import { describe, expect, it } from "vitest";
import { createApp } from "../app/createApp.js";
import { AnalysisPlanner } from "../agent/analysisPlanner.js";
import { MockAwsProvider } from "../integrations/aws/provider.js";
import type { ChatRequest, ToolPlanStep } from "../schemas/agent.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ModelClient } from "../agent/modelAdapter.js";
import { BackstageServiceCatalogProvider, ServiceCatalog } from "../catalog/serviceCatalog.js";
import { evaluatePlanningCases, type PlanningEvalCase } from "../agent/planningEvaluation.js";

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

  it("resolves service context before correlated incident analysis", async () => {
    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "平台服务 5xx 异常，帮我查根因" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.tool_calls.map((call: { name: string }) => call.name)).toContain("query_service_context");
    expect(body.findings.map((finding: { title: string }) => finding.title)).toContain("已定位服务上下文：platform-api");
    expect(body.analysis_plan.every((step: { confidence?: number }) => typeof step.confidence === "number")).toBe(true);
    expect(body.analysis_plan.flatMap((step: { signals?: string[] }) => step.signals ?? [])).toContain("service:platform-api");
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

    expect(result.steps[0]).toMatchObject({
      phase: "model-detect",
      tools: ["query_logs", "query_cluster_status"],
      reason: "模型根据语义判断需要日志和集群状态。",
      planner: "model",
    });
    expect(result.steps[0].confidence).toBeGreaterThan(0.5);
    expect(result.toolCalls.map((call) => call.name)).toEqual(["query_logs", "query_cluster_status"]);
  });
});

describe("tool planning evaluation", () => {
  it("measures expected tool recall across representative AIOps requests", async () => {
    const registry = new ToolRegistry(new MockAwsProvider());
    const planner = new AnalysisPlanner(registry);
    const cases: PlanningEvalCase[] = [
      {
        name: "platform incident",
        message: "平台服务 5xx 异常，帮我查根因和影响面",
        expectedTools: ["query_service_context", "query_alerts", "query_logs", "query_cluster_status", "query_incident_diagnosis"],
      },
      {
        name: "monthly cost",
        message: "查看本月费用是否异常，顺便看资源是不是扩太多",
        expectedTools: ["query_service_cost", "query_resource_inventory", "query_cost_anomalies"],
      },
      {
        name: "self healing",
        message: "集群异常，帮我逐步分析并给出自愈建议",
        expectedTools: ["query_alerts", "query_cluster_status", "query_logs", "query_runbook_recommendations"],
      },
    ];

    const plans = new Map<string, Awaited<ReturnType<typeof planner.run>>["steps"]>();
    for (const item of cases) {
      const result = await planner.run(item.message);
      plans.set(item.name, result.steps);
    }

    const results = evaluatePlanningCases(cases, plans);
    expect(results.every((result) => result.passed)).toBe(true);
    expect(results.map((result) => result.recall)).toEqual([1, 1, 1]);
  });
});

describe("demo scenarios", () => {
  it("exposes runnable AIOps demo scenarios", async () => {
    const response = await request("/api/demo/scenarios");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scenarios.map((scenario: { id: string }) => scenario.id)).toEqual(
      expect.arrayContaining(["platform-api-5xx-incident", "basic-cluster-query", "basic-resource-query", "limited-permission-user"]),
    );
    expect(body.scenarios.map((scenario: { id: string }) => scenario.id)).not.toContain("waf-blacklist-approval");
    expect(body.scenarios[0].expectedTools).toBeInstanceOf(Array);
  });

  it("returns a single demo scenario by id", async () => {
    const response = await request("/api/demo/scenarios/platform-api-5xx-incident");

    expect(response.status).toBe(200);
    const scenario = await response.json();
    expect(scenario.userMessage).toContain("平台服务");
    expect(scenario.expectedTools).toContain("query_service_context");
  });

  it("demo scenario message exercises the expected agent tool chain", async () => {
    const scenarioResponse = await request("/api/demo/scenarios/platform-api-5xx-incident");
    const scenario = await scenarioResponse.json();

    const response = await request("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: scenario.userMessage }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const toolNames = body.tool_calls.map((call: { name: string }) => call.name);
    for (const tool of scenario.expectedTools) {
      expect(toolNames).toContain(tool);
    }
  });
});

describe("service catalog providers", () => {
  it("resolves services from the mock provider", async () => {
    const catalog = new ServiceCatalog();
    const resolution = await catalog.resolve("收款服务 5xx 异常");

    expect(resolution?.service.name).toBe("payment-api");
    expect(resolution?.matchedBy).toBe("alias");
  });

  it("maps Backstage catalog components into service metadata", async () => {
    const originalFetch = globalThis.fetch;
    process.env.BACKSTAGE_CATALOG_URL = "https://backstage.internal/api/catalog";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify([
          {
            metadata: {
              name: "risk-api",
              title: "风控服务",
              description: "Risk control service",
              tags: ["risk", "fraud"],
              annotations: {
                "aiops/environment": "prod",
                "aiops/cluster": "platform-prod",
                "aiops/namespace": "risk",
                "aiops/log-group": "/aws/eks/platform-prod/risk-api",
                "aiops/dashboard-url": "https://grafana.local/d/risk-api",
                "aiops/permissions": "AIOps,EKS,Log,Alert,Delivery",
                "aiops/prod-approvers": "risk-owner,sre-approver",
                "aiops/runbooks": "risk-5xx-runbook",
              },
            },
            spec: {
              owner: "risk-team",
              system: "risk",
              dependsOn: ["component:default/payment-api"],
            },
          },
        ]),
        { status: 200 },
      );

    try {
      const catalog = new ServiceCatalog(new BackstageServiceCatalogProvider());
      const resolution = await catalog.resolve("风控服务 5xx 异常");

      expect(resolution?.service.name).toBe("risk-api");
      expect(resolution?.service.owner).toBe("risk-team");
      expect(resolution?.service.environments[0].cluster).toBe("platform-prod");
      expect(resolution?.service.dependencies[0].service).toBe("payment-api");
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.BACKSTAGE_CATALOG_URL;
    }
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

  it("returns service catalog context", async () => {
    const response = await request("/api/tools/query_service_context");

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.category).toBe("ServiceCatalog");
    expect(body.data.services.some((service: { name: string }) => service.name === "payment-api")).toBe(true);
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
