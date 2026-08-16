from integrations.aws.provider import AwsProvider
from tools.guard import readonly_tool


@readonly_tool
async def query_service_cost(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_service_cost",
        "category": "FinOps",
        "summary": "Month-to-date mock spend is 12,430.75 USD; EC2 is the largest driver.",
        "data": {
            "account_id": identity.account_id,
            "account_name": identity.account_name,
            "currency": "USD",
            "month_to_date": 12430.75,
            "services": [
                {"service": "EC2", "cost": 5320.10},
                {"service": "EKS", "cost": 2910.40},
                {"service": "RDS", "cost": 2290.25},
                {"service": "S3", "cost": 1910.00},
            ],
        },
    }
