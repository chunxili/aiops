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

export type ToolManifest = {
  name: string;
  category: string;
  description: string;
  readOnly: true;
  examples: string[];
  phases: string[];
};

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

  manifests(): ToolManifest[] {
    return [
      {
        name: "query_alerts",
        category: "Alert",
        description: "查询告警、报警、监控事件、影响服务和严重级别。",
        readOnly: true,
        examples: ["有没有告警", "哪些服务报警了", "incident alerts"],
        phases: ["detect", "overview"],
      },
      {
        name: "query_service_cost",
        category: "FinOps",
        description: "查询服务费用、本月账单、成本拆分和 FinOps 数据。",
        readOnly: true,
        examples: ["本月费用多少", "哪个服务成本最高", "monthly spend"],
        phases: ["cost-baseline", "overview"],
      },
      {
        name: "query_cluster_status",
        category: "EKS",
        description: "查询 EKS 集群、节点、Pod 状态、pending pods 和集群健康。",
        readOnly: true,
        examples: ["集群是否异常", "pod 为什么 pending", "EKS cluster status"],
        phases: ["detect", "correlate", "overview"],
      },
      {
        name: "query_resource_inventory",
        category: "Resource",
        description: "查询资源库存、EC2、RDS、S3、负载均衡器和容量上下文。",
        readOnly: true,
        examples: ["查资源", "有哪些 EC2", "resource inventory"],
        phases: ["correlate", "cost-baseline"],
      },
      {
        name: "query_logs",
        category: "Log",
        description: "查询日志、错误、trace、异常事件和关键服务日志。",
        readOnly: true,
        examples: ["查错误日志", "为什么 5xx", "show logs"],
        phases: ["correlate", "diagnose"],
      },
      {
        name: "query_incident_diagnosis",
        category: "AIOps",
        description: "跨告警、日志、集群和资源信号生成故障诊断和根因假设。",
        readOnly: true,
        examples: ["帮我诊断根因", "为什么服务异常", "RCA"],
        phases: ["diagnose"],
      },
      {
        name: "query_cost_anomalies",
        category: "AIOps",
        description: "分析费用异常、成本突增、容量变化与成本驱动。",
        readOnly: true,
        examples: ["费用异常", "成本突然升高", "cost anomaly"],
        phases: ["cost-anomaly", "diagnose"],
      },
      {
        name: "query_runbook_recommendations",
        category: "AIOps",
        description: "给出只读排查步骤、Runbook、下一步建议和安全处置路径。",
        readOnly: true,
        examples: ["下一步怎么处理", "runbook", "triage"],
        phases: ["diagnose", "self-healing-prep"],
      },
      {
        name: "query_aiops_summary",
        category: "AIOps",
        description: "生成跨域 AIOps 总览，覆盖告警、成本、集群、资源和诊断摘要。",
        readOnly: true,
        examples: ["AIOps 总览", "全套总结", "overall summary"],
        phases: ["overview"],
      },
    ];
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
