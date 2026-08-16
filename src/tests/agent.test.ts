import { describe, expect, it } from "vitest";
import { createApp } from "../app/createApp.js";

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
