import { describe, expect, it } from "vitest";
import { createApp } from "../app/createApp.js";

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
      body: JSON.stringify({ message: "Check EKS alerts and costs" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.answer).toContain("Mock MiniMax AIOps response");
    expect(body.tool_calls.map((call: { name: string }) => call.name)).toEqual(
      expect.arrayContaining(["query_alerts", "query_service_cost", "query_cluster_status"]),
    );
    expect(body.tool_calls.every((call: { result: { readonly: boolean } }) => call.result.readonly)).toBe(true);
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
