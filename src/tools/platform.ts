import type { AwsProvider } from "../integrations/aws/provider.js";
import type { ToolResult } from "../schemas/agent.js";

export async function queryAlerts(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_alerts",
    category: "Alert",
    readonly: true,
    summary: "2 active warning alerts and 0 critical alerts.",
    data: {
      account_id: identity.accountId,
      account_name: identity.accountName,
      region: identity.region,
      alerts: [
        { name: "HighCPU-api-prod", severity: "warning", service: "api-prod" },
        { name: "QueueDepth-worker", severity: "warning", service: "worker" },
      ],
    },
  };
}

export async function queryServiceCost(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_service_cost",
    category: "FinOps",
    readonly: true,
    summary: "Month-to-date mock spend is 12,430.75 USD; EC2 is the largest driver.",
    data: {
      account_id: identity.accountId,
      account_name: identity.accountName,
      currency: "USD",
      month_to_date: 12430.75,
      services: [
        { service: "EC2", cost: 5320.1 },
        { service: "EKS", cost: 2910.4 },
        { service: "RDS", cost: 2290.25 },
        { service: "S3", cost: 1910.0 },
      ],
    },
  };
}

export async function queryClusterStatus(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_cluster_status",
    category: "EKS",
    readonly: true,
    summary: "2 EKS clusters are active; one namespace has pending pods.",
    data: {
      account_id: identity.accountId,
      account_name: identity.accountName,
      clusters: [
        {
          name: "platform-prod",
          status: "ACTIVE",
          version: "1.30",
          nodes_ready: 18,
          pods_pending: 3,
        },
        {
          name: "platform-staging",
          status: "ACTIVE",
          version: "1.30",
          nodes_ready: 6,
          pods_pending: 0,
        },
      ],
    },
  };
}

export async function queryResourceInventory(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_resource_inventory",
    category: "Resource",
    readonly: true,
    summary: "Inventory includes 42 EC2 instances, 8 RDS instances, and 19 S3 buckets.",
    data: {
      account_id: identity.accountId,
      account_name: identity.accountName,
      region: identity.region,
      counts: {
        ec2_instances: 42,
        rds_instances: 8,
        s3_buckets: 19,
        load_balancers: 7,
      },
    },
  };
}

export async function queryLogs(provider: AwsProvider): Promise<ToolResult> {
  const identity = await provider.identity();
  return {
    tool: "query_logs",
    category: "Log",
    readonly: true,
    summary: "Latest mock logs show elevated 5xx responses from api-prod.",
    data: {
      account_id: identity.accountId,
      account_name: identity.accountName,
      log_group: "/aws/eks/platform-prod/api",
      events: [
        {
          timestamp: "2026-08-16T03:42:00Z",
          level: "ERROR",
          message: "GET /checkout returned 503 after upstream timeout",
        },
        {
          timestamp: "2026-08-16T03:41:44Z",
          level: "WARN",
          message: "Retry budget above threshold for payment-client",
        },
      ],
    },
  };
}
