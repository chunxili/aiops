import type { AwsProvider } from "../integrations/aws/provider.js";
import type { ToolResult } from "../schemas/agent.js";
import {
  queryAiopsSummary,
  queryCostAnomalies,
  queryIncidentDiagnosis,
  queryRunbookRecommendations,
} from "./aiops.js";
import { assertReadOnlyTool, ReadOnlyViolation } from "./guard.js";
import {
  queryAlerts,
  queryClusterStatus,
  queryLogs,
  queryResourceInventory,
  queryServiceCost,
} from "./platform.js";

export type ToolFunction = (provider: AwsProvider) => Promise<ToolResult>;

export class UnknownToolError extends Error {}

export class ToolRegistry {
  private readonly tools: Record<string, ToolFunction>;

  constructor(private readonly provider: AwsProvider) {
    this.tools = {
      query_alerts: queryAlerts,
      query_service_cost: queryServiceCost,
      query_cluster_status: queryClusterStatus,
      query_resource_inventory: queryResourceInventory,
      query_logs: queryLogs,
      query_incident_diagnosis: queryIncidentDiagnosis,
      query_cost_anomalies: queryCostAnomalies,
      query_runbook_recommendations: queryRunbookRecommendations,
      query_aiops_summary: queryAiopsSummary,
    };

    for (const name of this.names()) {
      assertReadOnlyTool(name);
    }
  }

  names(): string[] {
    return Object.keys(this.tools);
  }

  selectForMessage(message: string): string[] {
    const text = message.toLowerCase();
    const selectionRules: Record<string, string[]> = {
      query_alerts: ["alert", "alarm", "incident", "告警", "报警"],
      query_service_cost: ["cost", "finops", "spend", "bill", "费用", "成本", "账单"],
      query_cluster_status: ["eks", "cluster", "pod", "node", "集群", "节点"],
      query_resource_inventory: ["resource", "inventory", "ec2", "rds", "s3", "资源"],
      query_logs: ["log", "error", "trace", "日志", "错误"],
      query_incident_diagnosis: ["diagnose", "incident", "root cause", "rca", "故障", "诊断", "根因"],
      query_cost_anomalies: ["anomaly", "cost spike", "overspend", "异常", "费用异常"],
      query_runbook_recommendations: ["runbook", "triage", "next step", "预案", "下一步"],
      query_aiops_summary: ["aiops", "overview", "summary", "all signals", "全套", "总结", "总览"],
    };

    return Object.entries(selectionRules)
      .filter(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))
      .map(([name]) => name);
  }

  async run(name: string): Promise<ToolResult> {
    assertReadOnlyTool(name);
    const tool = this.tools[name];
    if (!tool) {
      throw new UnknownToolError(`Unknown tool '${name}'.`);
    }
    return tool(this.provider);
  }
}

export function isReadOnlyViolation(error: unknown): error is ReadOnlyViolation {
  return error instanceof ReadOnlyViolation;
}
