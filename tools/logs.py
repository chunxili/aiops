from integrations.aws.provider import AwsProvider
from tools.guard import readonly_tool


@readonly_tool
async def query_logs(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_logs",
        "category": "Log",
        "summary": "Latest mock logs show elevated 5xx responses from api-prod.",
        "data": {
            "account_id": identity.account_id,
            "account_name": identity.account_name,
            "log_group": "/aws/eks/platform-prod/api",
            "events": [
                {
                    "timestamp": "2026-08-16T03:42:00Z",
                    "level": "ERROR",
                    "message": "GET /checkout returned 503 after upstream timeout",
                },
                {
                    "timestamp": "2026-08-16T03:41:44Z",
                    "level": "WARN",
                    "message": "Retry budget above threshold for payment-client",
                },
            ],
        },
    }
