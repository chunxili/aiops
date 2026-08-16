# Architecture

## Platform AIOps Agent

The Platform AIOps Agent is a read-only support assistant for AWS platform operations. The frontend talks to one backend route, `/api/agent/chat`, and does not call AWS or individual tools directly.

Request flow:

```text
Frontend -> FastAPI /api/agent/chat -> AgentOrchestrator -> ClaudeSdkAgentRuntime -> MiniMax adapter -> ToolRegistry -> read-only tools -> simulated AWS provider
```

The current system uses `MockModelClient` when no MiniMax key is configured and `MockAwsProvider` for simulated AWS account data.

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

`agent/claude_sdk_runtime.py` owns the Claude-SDK-shaped agent loop: select tools, execute read-only tools through the registry, pass structured context to the model backend, and return a trace of tool calls.

`agent/model_adapter.py` owns the MiniMax integration point. If `MINIMAX_API_KEY` is configured, the runtime calls MiniMax's OpenAI-compatible Chat Completions API through this adapter. Otherwise it uses deterministic local mock output.

The model receives server-selected read-only tool context. Tool execution remains server-side through `ToolRegistry`, so MiniMax cannot bypass the read-only guard.

## Future GitHub Push Flow

This repository is initialized locally only. To publish later:

```bash
git remote add origin <repo-url>
git branch -M main
git push -u origin main
```

Before pushing, run:

```bash
pytest
git status --short
```
