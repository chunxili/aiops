from integrations.aws.provider import AwsProvider
from tools.guard import readonly_tool


@readonly_tool
async def query_alerts(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_alerts",
        "category": "Alert",
        "summary": "2 active warning alerts and 0 critical alerts.",
        "data": {
            "account_id": identity.account_id,
            "account_name": identity.account_name,
            "region": identity.region,
            "alerts": [
                {"name": "HighCPU-api-prod", "severity": "warning", "service": "api-prod"},
                {"name": "QueueDepth-worker", "severity": "warning", "service": "worker"},
            ],
        },
    }
