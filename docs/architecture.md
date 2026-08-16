# Architecture

## Compatibility Target

This agent is implemented in TypeScript so it can fit into an existing AIOps platform built with Backstage, TypeScript, and React.

The compatibility boundary is intentionally narrow:

```text
Backstage React plugin -> POST /api/agent/chat -> AIOps Agent service
```

Backstage should not call individual tools directly in normal user flows. It should send user messages to `/api/agent/chat` and render the response.

## Service Catalog / CMDB Boundary

The agent treats service ownership, runtime location, logs, dashboards, approval policy, and dependencies as a catalog provider boundary instead of planner hard-code.

Provider options:

- `mock`: local demo data for payment, order, and platform services.
- `backstage`: reads Backstage Catalog component entities and maps `metadata`, `spec`, and `aiops/*` annotations into the agent's service metadata.
- `cmdb`: reads a company CMDB HTTP endpoint that returns `ServiceMetadata[]` or `{ services: ServiceMetadata[] }`.

The internal contract is `ServiceMetadata`: service id, aliases, owner, team, environments, permissions, approval policy, runbooks, and dependencies.

LangGraph resolves service context before model-driven tool planning. This lets the planner choose logs, cluster status, alerts, resources, runbooks, and delivery approval context with a concrete service target instead of relying only on keywords.

## Platform AIOps Agent

The Platform AIOps Agent is a read-only support assistant for AWS platform operations.

Request flow:

```text
Backstage React UI
  -> Express /api/agent/chat
  -> AgentOrchestrator
  -> ClaudeSdkAgentRuntime
  -> ToolRegistry
  -> read-only tools
  -> simulated AWS provider
  -> MiniMax adapter for final analysis
```

The current system uses `MockModelClient` when no MiniMax key is configured and `MockAwsProvider` for simulated AWS account data.

## Backstage Integration

Recommended Backstage shape:

- A Backstage frontend plugin owns the chat UI.
- The plugin posts messages to `/api/agent/chat`.
- The plugin renders `answer` as the assistant reply.
- The plugin renders `tool_calls` as evidence, tables, or expandable JSON.
- The plugin can map known tool categories to existing AIOps widgets.

Stable response contract:

```ts
type ChatResponse = {
  answer: string;
  tool_calls: Array<{
    name: string;
    result: {
      tool: string;
      category: "Alert" | "FinOps" | "EKS" | "Resource" | "Log" | "AIOps";
      readonly: true;
      summary: string;
      data: Record<string, unknown>;
    };
  }>;
};
```

## Extending Existing AIOps Features

To integrate an existing TypeScript AIOps feature:

1. Wrap the feature as a function returning `ToolResult`.
2. Keep the function read-only.
3. Register it in `src/tools/registry.ts`.
4. Add intent keywords in `selectForMessage`.
5. Add route/tool tests.
6. Let the Backstage UI continue calling only `/api/agent/chat`.

This allows old AIOps capabilities to become agent capabilities without changing the chat contract.

## Simulated AWS Accounts

`MockAwsProvider` supplies safe fake account identities:

- `simulated-platform-prod`
- `simulated-shared-services`
- `simulated-platform-staging`

No real AWS credentials are stored, loaded, or used by default.

## Tool Layer

Core platform domains:

- Alert: `query_alerts`
- FinOps: `query_service_cost`
- EKS: `query_cluster_status`
- Resource: `query_resource_inventory`
- Log: `query_logs`

AIOps correlation tools:

- Incident diagnosis: `query_incident_diagnosis`
- Cost anomaly analysis: `query_cost_anomalies`
- Runbook recommendation: `query_runbook_recommendations`
- Cross-domain summary: `query_aiops_summary`

Each tool returns structured JSON with:

- `tool`
- `category`
- `readonly`
- `summary`
- `data`

`ToolRegistry` is the only place that exposes tools to the agent. It validates tool names through the read-only guard before execution.

## Security Boundary

This MVP intentionally avoids real credentials and write-capable AWS operations.

Guardrails:

- Tool names must use read-only prefixes such as `query_`, `list_`, `get_`, or `describe_`.
- Mutating prefixes such as `create_`, `update_`, `delete_`, `start_`, `stop_`, `scale_`, and `apply_` are blocked.
- The AWS provider is an interface boundary. The default provider is a mock.
- Future AssumeRole sessions should use short-lived credentials and read-only IAM policies.
- The frontend should only use `/api/agent/chat`; direct tool routes are for tests and local validation.

## Claude SDK Runtime And MiniMax Boundary

`src/agent/claudeSdkRuntime.ts` owns the Claude-SDK-shaped agent loop: select tools, execute read-only tools through the registry, pass structured context to the model backend, and return a trace of tool calls.

`src/agent/modelAdapter.ts` owns the MiniMax integration point. If `MINIMAX_API_KEY` is configured, the runtime calls MiniMax's OpenAI-compatible Chat Completions API through this adapter. Otherwise it uses deterministic local mock output.

The model receives server-selected read-only tool context. Tool execution remains server-side through `ToolRegistry`, so MiniMax cannot bypass the read-only guard.

## Future GitHub Push Flow

Before pushing, run:

```bash
npm run build
npm test
git status --short
```
