import type { AwsProvider } from "../integrations/aws/provider.js";
import type { ToolResult } from "../schemas/agent.js";
import {
  queryAlerts,
  queryClusterStatus,
  queryLogs,
  queryResourceInventory,
  queryServiceCost,
} from "./platform.js";

export async function queryIncidentDiagnosis(provider: AwsProvider): Promise<ToolResult> {
  const alerts = await queryAlerts(provider);
  const clusters = await queryClusterStatus(provider);
  const logs = await queryLogs(provider);

  return {
    tool: "query_incident_diagnosis",
    category: "AIOps",
    readonly: true,
    summary: "Likely checkout degradation: API 5xx logs align with EKS pending pods and warning alerts.",
    data: {
      signals: {
        alerts: alerts.data.alerts,
        clusters: clusters.data.clusters,
        logs: logs.data.events,
      },
      probable_cause: "api-prod has insufficient ready capacity after upstream timeout retries.",
      safe_next_steps: [
        "Inspect recent deploys and HPA metrics.",
        "Confirm payment-client latency from dashboards.",
        "Escalate to service owner before any scaling or rollback action.",
      ],
    },
  };
}

export async function queryCostAnomalies(provider: AwsProvider): Promise<ToolResult> {
  const costs = await queryServiceCost(provider);
  return {
    tool: "query_cost_anomalies",
    category: "AIOps",
    readonly: true,
    summary: "EC2 and EKS spend are above simulated baseline; no write action was taken.",
    data: {
      baseline: { month_to_date_expected: 9800.0, currency: "USD" },
      actual: costs.data,
      anomalies: [
        {
          service: "EC2",
          delta_percent: 24.0,
          suspected_driver: "larger node group footprint in platform-prod",
        },
        {
          service: "EKS",
          delta_percent: 18.0,
          suspected_driver: "additional managed node groups",
        },
      ],
    },
  };
}

export async function queryRunbookRecommendations(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_runbook_recommendations",
    category: "AIOps",
    readonly: true,
    summary: "Recommended read-only triage path: verify alerts, correlate logs, inspect EKS health, then review costs.",
    data: {
      account_name: identity.accountName,
      steps: [
        { step: 1, action: "Review active alerts and affected services." },
        { step: 2, action: "Correlate error logs with deploy and traffic windows." },
        { step: 3, action: "Inspect EKS pod pending and node readiness." },
        { step: 4, action: "Check cost anomaly context before capacity changes." },
        { step: 5, action: "Hand off any mutation to a human-approved runbook." },
      ],
    },
  };
}

export async function queryAiopsSummary(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  const inventory = await queryResourceInventory(provider);
  const diagnosis = await queryIncidentDiagnosis(provider);
  const anomalies = await queryCostAnomalies(provider);

  return {
    tool: "query_aiops_summary",
    category: "AIOps",
    readonly: true,
    summary: "AIOps overview generated across simulated AWS platform signals.",
    data: {
      account: {
        id: identity.accountId,
        name: identity.accountName,
        region: identity.region,
      },
      inventory: inventory.data.counts,
      incident: diagnosis.data.probable_cause,
      cost: anomalies.data.anomalies,
    },
  };
}
