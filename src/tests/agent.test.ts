import { describe, expect, it } from "vitest";
import { createApp } from "../app/createApp.js";
import { AnalysisPlanner } from "../agent/analysisPlanner.js";
import { MockAwsProvider } from "../integrations/aws/provider.js";
import type { ChatRequest, ToolPlanStep } from "../schemas/agent.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ModelClient } from "../agent/modelAdapter.js";

process.env.MODEL_PROVIDER = "mock";

const app = createApp();

async function request(path: string, init?: RequestInit): Promise<Response> {
  const server = app.listen(0);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not provide a port.");
  }

  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
  } finally {
    server.close();
  }
}

describe("agent route", () => {
  it("returns tool calls for chat requests", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Check EKS alerts and incident status" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toContain("Mock local OpenAI-compatible AIOps response");
    expect(body.tool_calls.map((call: { name: string }) => call.name)).toEqual(
      expect.arrayContaining(["query_alerts", "query_cluster_status", "query_logs"]),
    );
    expect(body.tool_calls.every((call: { result: { readonly: boolean } }) => call.result.readonly)).toBe(true);
    expect(body.analysis_plan.length).toBeGreaterThan(0);
    expect(body.findings.length).toBeGreaterThan(0);
  });

  it("can use AIOps summary", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Give me the full AIOps summary" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tool_calls.map((call: { name: string }) => call.name)).toContain("query_aiops_summary");
  });

  it("runs dynamic incident analysis and proposes approval-gated self healing", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "集群异常，帮我逐步分析并给出自愈建议" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.analysis_plan.map((step: { phase: string }) => step.phase)).toEqual(
      expect.arrayContaining(["detect", "correlate", "diagnose"]),
    );
    expect(body.tool_calls.map((call: { name: string }) => call.name)).toEqual(
      expect.arrayContaining([
        "query_alerts",
        "query_cluster_status",
        "query_logs",
        "query_resource_inventory",
        "query_incident_diagnosis",
        "query_runbook_recommendations",
      ]),
    );
    expect(body.findings.map((finding: { title: string }) => finding.title)).toContain("形成初步根因假设");
    expect(body.self_healing_proposals[0].requiresApproval).toBe(true);
    expect(body.self_healing_proposals[0].actionType).toBe("scale_service");
  });

  it("stores user-scoped conversation history", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "alice",
        "x-user-name": "alice",
      },
      body: JSON.stringify({ message: "查看 AIOps 总览" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversation_id).toBeTruthy();

    const listResponse = await request("/api/agent/conversations", {
      headers: { "x-user-id": "alice", "x-user-name": "alice" },
    });
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.conversations.some((item: { id: string }) => item.id === body.conversation_id)).toBe(true);

    const detailResponse = await request(`/api/agent/conversations/${body.conversation_id}`, {
      headers: { "x-user-id": "alice", "x-user-name": "alice" },
    });
    expect(detailResponse.status).toBe(200);
    const detail = await detailResponse.json();
    expect(detail.messages.length).toBeGreaterThanOrEqual(2);
    expect(detail.messages[0].role).toBe("user");
  });

  it("prevents users from reading another user's conversation", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "owner",
      },
      body: JSON.stringify({ message: "查看 AIOps 总览" }),
    });
    const body = await response.json();

    const forbidden = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "other-user",
      },
      body: JSON.stringify({ conversation_id: body.conversation_id, message: "继续" }),
    });

    expect(forbidden.status).toBe(403);
  });

  it("asks for clarification before creating a WAF blacklist change", async () => {
    const first = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "security-user",
        "x-user-name": "security-user",
      },
      body: JSON.stringify({ message: "帮我设置 WAF 黑名单" }),
    });

    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.needs_clarification).toBe(true);
    expect(firstBody.clarification_question).toContain("目标对象");

    const second = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "security-user",
        "x-user-name": "security-user",
      },
      body: JSON.stringify({
        conversation_id: firstBody.conversation_id,
        message: "IP 是 203.0.113.10，生产环境，原因是恶意扫描",
      }),
    });

    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.delivery_change_id).toBeTruthy();
    expect(secondBody.answer).toContain("待审批变更计划");
  });

  it("filters tools by Keycloak-style module permissions", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "limited-user",
        "x-module-permissions": "EKS,Log",
      },
      body: JSON.stringify({ message: "帮我查集群和费用" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const toolNames = body.tool_calls.map((call: { name: string }) => call.name);
    expect(toolNames).toEqual(expect.arrayContaining(["query_cluster_status"]));
    expect(toolNames).not.toContain("query_service_cost");
  });

  it("blocks direct tool route access without the required module permission", async () => {
    const response = await request("/api/tools/query_service_cost", {
      headers: { "x-user-id": "limited-tool-user", "x-module-permissions": "EKS,Log" },
    });

    expect(response.status).toBe(403);
  });

  it("does not create delivery changes without Delivery permission", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "read-only-user",
        "x-user-name": "read-only-user",
        "x-module-permissions": "Alert,EKS,Log,AIOps",
      },
      body: JSON.stringify({ message: "把 203.0.113.20 加入 WAF 黑名单，生产环境，原因是攻击流量" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.delivery_change_id).toBeUndefined();
    expect(body.answer).toContain("没有 Delivery 模块权限");
  });
});

describe("LangGraph model-driven planning", () => {
  it("uses model-generated plans and filters invalid tools", async () => {
    class PlanningModel implements ModelClient {
      async complete(_request: ChatRequest, _registry: ToolRegistry): Promise<string> {
        return "planned";
      }

      async planTools(_message: string, _registry: ToolRegistry): Promise<ToolPlanStep[]> {
        return [
          {
            phase: "model-detect",
            tools: ["query_logs", "delete_cluster", "query_cluster_status"],
            reason: "模型根据语义判断需要日志和集群状态。",
          },
        ];
      }
    }

    const registry = new ToolRegistry(new MockAwsProvider());
    const planner = new AnalysisPlanner(registry, new PlanningModel());
    const result = await planner.run("为什么服务一直报错，帮我看一下运行状态");

    expect(result.steps).toEqual([
      {
        phase: "model-detect",
        tools: ["query_logs", "query_cluster_status"],
        reason: "模型根据语义判断需要日志和集群状态。",
      },
    ]);
    expect(result.toolCalls.map((call) => call.name)).toEqual(["query_logs", "query_cluster_status"]);
  });
});

describe("tool route", () => {
  it("returns structured JSON", async () => {
    const response = await request("/api/tools/query_resource_inventory");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tool).toBe("query_resource_inventory");
    expect(body.category).toBe("Resource");
    expect(body.readonly).toBe(true);
    expect(body.data.counts).toBeTruthy();
  });

  it("blocks mutating tool names", async () => {
    const response = await request("/api/tools/delete_cluster");

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.detail).toContain("read-only guard");
  });
});

describe("root route", () => {
  it("points to the agent entrypoint", async () => {
    const response = await request("/");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.service).toBe("aws-platform-aiops-agent");
    expect(body.entrypoint).toBe("/api/agent/chat");
  });
});
