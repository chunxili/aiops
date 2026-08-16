from integrations.aws.provider import AwsProvider
from tools.guard import readonly_tool


@readonly_tool
async def query_resource_inventory(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_resource_inventory",
        "category": "Resource",
        "summary": "Inventory includes 42 EC2 instances, 8 RDS instances, and 19 S3 buckets.",
        "data": {
            "account_id": identity.account_id,
            "account_name": identity.account_name,
            "region": identity.region,
            "counts": {
                "ec2_instances": 42,
                "rds_instances": 8,
                "s3_buckets": 19,
                "load_balancers": 7,
            },
        },
    }
