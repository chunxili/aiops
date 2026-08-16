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

async function createChange(overrides: Record<string, unknown> = {}) {
  const response = await request("/api/delivery/changes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Scale platform-prod API",
      summary: "Scale recommendation based on AIOps diagnosis.",
      environment: "prod",
      requestedBy: "alice",
      actions: [
        {
          type: "scale_service",
          target: "platform-prod/api",
          parameters: { replicas: 6 },
        },
      ],
      evidence: ["query_alerts", "query_cluster_status", "query_logs"],
      idempotencyKey: "change-platform-prod-api-001",
      rollbackPlan: "Restore original replica count if error rate does not improve.",
      ...overrides,
    }),
  });

  expect(response.status).toBe(201);
  return response.json();
}

describe("delivery workflow", () => {
  it("creates a change plan with audit evidence", async () => {
    const change = await createChange({ idempotencyKey: "create-only-001" });

    expect(change.status).toBe("planned");
    expect(change.environment).toBe("prod");
    expect(change.actions[0].type).toBe("scale_service");

    const auditResponse = await request(`/api/delivery/changes/${change.id}/audit`);
    expect(auditResponse.status).toBe(200);
    const audit = await auditResponse.json();
    expect(audit.events.map((event: { event: string }) => event.event)).toContain("created");
  });

  it("requires approval before execution", async () => {
    const change = await createChange({ idempotencyKey: "approval-required-001" });

    const response = await request(`/api/delivery/changes/${change.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "release-bot", idempotencyKey: "approval-required-001" }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.detail).toContain("must be approved");
  });

  it("prevents requester self-approval", async () => {
    const change = await createChange({ idempotencyKey: "self-approval-001" });

    const response = await request(`/api/delivery/changes/${change.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "alice" }),
    });

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.detail).toContain("Requester cannot approve");
  });

  it("approves and executes with matching idempotency key", async () => {
    const change = await createChange({ idempotencyKey: "execute-success-001" });

    const approvalResponse = await request(`/api/delivery/changes/${change.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "bob" }),
    });
    expect(approvalResponse.status).toBe(200);

    const executeResponse = await request(`/api/delivery/changes/${change.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "release-bot", idempotencyKey: "execute-success-001" }),
    });
    expect(executeResponse.status).toBe(200);
    const executed = await executeResponse.json();
    expect(executed.status).toBe("executed");
    expect(executed.executionResult.mode).toBe("mock");

    const auditResponse = await request(`/api/delivery/changes/${change.id}/audit`);
    const audit = await auditResponse.json();
    expect(audit.events.map((event: { event: string }) => event.event)).toEqual([
      "created",
      "approved",
      "executed",
    ]);
  });

  it("blocks execution with a mismatched idempotency key", async () => {
    const change = await createChange({ idempotencyKey: "expected-key" });

    const approvalResponse = await request(`/api/delivery/changes/${change.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "bob" }),
    });
    expect(approvalResponse.status).toBe(200);

    const executeResponse = await request(`/api/delivery/changes/${change.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actor: "release-bot", idempotencyKey: "wrong-key" }),
    });

    expect(executeResponse.status).toBe(409);
    const body = await executeResponse.json();
    expect(body.detail).toContain("Idempotency key");
  });
});
