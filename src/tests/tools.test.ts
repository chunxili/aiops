import { describe, expect, it } from "vitest";
import { MockAwsProvider } from "../integrations/aws/provider.js";
import { assertReadOnlyTool, ReadOnlyViolation } from "../tools/guard.js";
import { ToolRegistry } from "../tools/registry.js";
import type { ToolDefinition } from "../tools/definitions.js";

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

  it("auto-registers tools from a single tool definition", async () => {
    const demoTool: ToolDefinition = {
      manifest: {
        name: "query_demo_release_risk",
        category: "AIOps",
        description: "查询发布风险 demo 数据。",
        readOnly: true,
        examples: ["发布风险", "release risk"],
        phases: ["diagnose"],
      },
      keywords: ["发布风险", "release risk"],
      handler: async () => ({
        tool: "query_demo_release_risk",
        category: "AIOps",
        readonly: true,
        summary: "Demo release risk is medium.",
        data: { risk: "medium" },
      }),
    };
    const registry = new ToolRegistry(new MockAwsProvider(), undefined, [demoTool]);

    expect(registry.names()).toEqual(["query_demo_release_risk"]);
    expect(registry.manifests()[0].description).toContain("发布风险");
    expect(registry.selectForMessage("帮我看一下发布风险")).toEqual(["query_demo_release_risk"]);

    const result = await registry.run("query_demo_release_risk");
    expect(result.data.risk).toBe("medium");
  });
});
