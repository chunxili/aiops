from integrations.aws.provider import AwsProvider
from tools.guard import readonly_tool


@readonly_tool
async def query_cluster_status(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_cluster_status",
        "category": "EKS",
        "summary": "2 EKS clusters are active; one namespace has pending pods.",
        "data": {
            "account_id": identity.account_id,
            "account_name": identity.account_name,
            "clusters": [
                {
                    "name": "platform-prod",
                    "status": "ACTIVE",
                    "version": "1.30",
                    "nodes_ready": 18,
                    "pods_pending": 3,
                },
                {
                    "name": "platform-staging",
                    "status": "ACTIVE",
                    "version": "1.30",
                    "nodes_ready": 6,
                    "pods_pending": 0,
                },
            ],
        },
    }
