# AWS Platform AIOps Agent

Read-only AWS Platform AIOps Agent implemented in TypeScript for easier integration with a Backstage + React AIOps platform.

The backend exposes one primary frontend entrypoint:

```text
POST /api/agent/chat
```

The app runs locally without real MiniMax or AWS credentials. If `MINIMAX_API_KEY` is absent, it uses a deterministic mock model. AWS accounts are simulated by `MockAwsProvider`.

## Architecture

```text
src/app/              Express app and HTTP routes
src/agent/            Claude-SDK-shaped runtime, orchestration layer, and MiniMax adapter
src/tools/            Read-only AIOps, Alert, FinOps, EKS, Resource, and Log tools
src/integrations/aws/ Simulated AWS account provider and future AssumeRole boundary
src/schemas/          Zod request schemas and TypeScript response types
src/tests/            API, tool, and read-only guard tests
docs/                 Architecture and Backstage integration notes
```

The intended Backstage integration is:

```text
Backstage React plugin -> /api/agent/chat -> TypeScript AIOps Agent -> read-only tools -> MiniMax analysis
```

## Run Locally

```bash
npm install
npm run dev
```

Production-style build:

```bash
npm run build
npm start
```

Example chat request:

```bash
curl -X POST http://127.0.0.1:8000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Give me the full AIOps summary for incidents, EKS, logs, resources, and costs"}'
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MINIMAX_API_KEY` | No | If set, the Claude-SDK-shaped runtime calls MiniMax Chat Completions through the model adapter. If omitted, mock model output is used. |
| `MINIMAX_BASE_URL` | No | MiniMax API base URL. Defaults to `https://api.minimax.io`. |
| `MINIMAX_MODEL` | No | MiniMax chat model. Defaults to `MiniMax-M3`. |
| `AWS_ROLE_ARN` | No | Future production role ARN for STS AssumeRole. Not used by the mock provider. |
| `AWS_REGION` | No | Future AWS query region. The mock provider defaults to `us-east-1`. |
| `PORT` | No | HTTP port. Defaults to `8000`. |

## AIOps Tool Surface

All registered tools are read-only and return structured JSON.

Core platform tools:

- `query_alerts`
- `query_service_cost`
- `query_cluster_status`
- `query_resource_inventory`
- `query_logs`

AIOps correlation tools:

- `query_incident_diagnosis`
- `query_cost_anomalies`
- `query_runbook_recommendations`
- `query_aiops_summary`

Internal local validation routes are available under `/api/tools/{tool_name}`. The Backstage frontend should call `/api/agent/chat`.

## Backstage Integration

For a Backstage + React platform, add a plugin or plugin page that posts user messages to `/api/agent/chat` and renders:

- `answer` as the model-generated response.
- `tool_calls` as an expandable evidence panel.
- `result.summary` as quick evidence.
- `result.data` as structured JSON, tables, or domain-specific widgets.

Existing TypeScript AIOps modules can be integrated by wrapping them as tools that return the same `ToolResult` shape and registering them in `src/tools/registry.ts`.

## Replacing Mocks With Real AWS Queries

1. Implement `AssumeRoleAwsProvider` in `src/integrations/aws/provider.ts` using STS AssumeRole and short-lived credentials.
2. Keep the IAM policy read-only. Prefer AWS managed read-only policies plus narrower service scopes where possible.
3. Replace each tool's mock payload with AWS SDK reads:
   - Alert: CloudWatch alarms or incident source.
   - FinOps: Cost Explorer.
   - EKS: EKS and Kubernetes read APIs.
   - Resource: Resource Groups Tagging API, Config, or service-specific describe calls.
   - Log: CloudWatch Logs read APIs.
   - AIOps: server-side correlation across read-only tool outputs.
4. Keep mutating verbs blocked by `src/tools/guard.ts`.
5. Add integration tests with mocked AWS SDK clients before enabling live queries.

## Tests

```bash
npm run build
npm test
```
