# AWS Platform AIOps Agent

Read-only AWS Platform AIOps Agent using a Claude-SDK-shaped agent runtime with MiniMax as the model boundary. The backend exposes one primary frontend entrypoint:

```text
POST /api/agent/chat
```

The app runs locally without real MiniMax or AWS credentials. If `MINIMAX_API_KEY` is absent, it uses a deterministic mock model. AWS accounts are simulated by `MockAwsProvider`.

## Architecture

```text
app/                 FastAPI app and HTTP routes
agent/               Claude SDK runtime shape, orchestration layer, and MiniMax adapter
tools/               Read-only AIOps, Alert, FinOps, EKS, Resource, and Log tools
integrations/aws/    Simulated AWS account provider and future AssumeRole boundary
schemas/             Pydantic request/response schemas
docs/                Architecture and operational notes
tests/               API, tool, and read-only guard tests
```

## Run Locally

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Open the API docs at:

```text
http://127.0.0.1:8000/docs
```

Example chat request:

```bash
curl -X POST http://127.0.0.1:8000/api/agent/chat ^
  -H "Content-Type: application/json" ^
  -d "{\"message\":\"Give me the full AIOps summary for incidents, EKS, logs, resources, and costs\"}"
```

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `MINIMAX_API_KEY` | No | If set, the Claude-SDK-shaped runtime calls MiniMax Chat Completions through the model adapter. If omitted, mock model output is used. |
| `MINIMAX_BASE_URL` | No | MiniMax API base URL. Defaults to `https://api.minimax.io`. |
| `MINIMAX_MODEL` | No | MiniMax chat model. Defaults to `MiniMax-M3`. |
| `AWS_ROLE_ARN` | No | Future production role ARN for STS AssumeRole. Not used by the mock provider. |
| `AWS_REGION` | No | Future AWS query region. The mock provider defaults to `us-east-1`. |

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

Internal local validation routes are available under `/api/tools/{tool_name}`. The frontend contract should use only `/api/agent/chat`.

## Replacing Mocks With Real AWS Queries

1. Implement `AssumeRoleAwsProvider` in `integrations/aws/provider.py` using STS AssumeRole and short-lived credentials.
2. Keep the IAM policy read-only. Prefer AWS managed read-only policies plus narrower service scopes where possible.
3. Replace each tool's mock payload with AWS SDK reads:
   - Alert: CloudWatch alarms or incident source.
   - FinOps: Cost Explorer.
   - EKS: EKS and Kubernetes read APIs.
   - Resource: Resource Groups Tagging API, Config, or service-specific describe calls.
   - Log: CloudWatch Logs read APIs.
   - AIOps: server-side correlation across read-only tool outputs.
4. Keep mutating verbs blocked by `tools/guard.py`.
5. Add integration tests with mocked AWS SDK clients before enabling live queries.

## Tests

```bash
pytest
```
