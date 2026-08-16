import { describe, expect, it } from "vitest";
import { MockAwsProvider } from "../integrations/aws/provider.js";
import { assertReadOnlyTool, ReadOnlyViolation } from "../tools/guard.js";
import { ToolRegistry } from "../tools/registry.js";

describe("ToolRegistry", () => {
  it("keeps all registered tools read-only", async () => {
    const registry = new ToolRegistry(new MockAwsProvider());

    for (const name of registry.names()) {
      const result = await registry.run(name);
      expect(name.startsWith("query_")).toBe(true);
      expect(result.readonly).toBe(true);
      expect(typeof result.data).toBe("object");
    }
  });

  it("registers AIOps tools", () => {
    const registry = new ToolRegistry(new MockAwsProvider());

    expect(registry.names()).toEqual(
      expect.arrayContaining([
        "query_incident_diagnosis",
        "query_cost_anomalies",
        "query_runbook_recommendations",
        "query_aiops_summary",
      ]),
    );
  });

  it("rejects mutations", () => {
    expect(() => assertReadOnlyTool("update_auto_scaling_group")).toThrow(ReadOnlyViolation);
  });
});
