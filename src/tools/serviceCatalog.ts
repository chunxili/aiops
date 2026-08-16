import type { AwsProvider } from "../integrations/aws/provider.js";
import type { ToolResult } from "../schemas/agent.js";
import { serviceCatalog } from "../catalog/serviceCatalog.js";

export async function queryServiceContext(_provider: AwsProvider): Promise<ToolResult> {
  const services = await serviceCatalog.list();
  return {
    tool: "query_service_context",
    category: "ServiceCatalog",
    readonly: true,
    summary: "Service catalog contains service ownership, runtime locations, logs, dashboards, approval policies, and dependencies.",
    data: {
      services: services.map((service) => ({
        id: service.id,
        name: service.name,
        aliases: service.aliases,
        owner: service.owner,
        team: service.team,
        environments: service.environments,
        approvalPolicy: service.approvalPolicy,
        runbooks: service.runbooks,
        dependencies: service.dependencies,
      })),
    },
  };
}
