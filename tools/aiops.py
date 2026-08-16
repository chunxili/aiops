from integrations.aws.provider import AwsProvider
from tools.alerts import query_alerts
from tools.eks import query_cluster_status
from tools.finops import query_service_cost
from tools.guard import readonly_tool
from tools.logs import query_logs
from tools.resources import query_resource_inventory


@readonly_tool
async def query_incident_diagnosis(provider: AwsProvider) -> dict:
    alerts = await query_alerts(provider)
    clusters = await query_cluster_status(provider)
    logs = await query_logs(provider)
    return {
        "tool": "query_incident_diagnosis",
        "category": "AIOps",
        "summary": "Likely checkout degradation: API 5xx logs align with EKS pending pods and warning alerts.",
        "data": {
            "signals": {
                "alerts": alerts["data"]["alerts"],
                "clusters": clusters["data"]["clusters"],
                "logs": logs["data"]["events"],
            },
            "probable_cause": "api-prod has insufficient ready capacity after upstream timeout retries.",
            "safe_next_steps": [
                "Inspect recent deploys and HPA metrics.",
                "Confirm payment-client latency from dashboards.",
                "Escalate to service owner before any scaling or rollback action.",
            ],
        },
    }


@readonly_tool
async def query_cost_anomalies(provider: AwsProvider) -> dict:
    costs = await query_service_cost(provider)
    return {
        "tool": "query_cost_anomalies",
        "category": "AIOps",
        "summary": "EC2 and EKS spend are above simulated baseline; no write action was taken.",
        "data": {
            "baseline": {"month_to_date_expected": 9800.00, "currency": "USD"},
            "actual": costs["data"],
            "anomalies": [
                {
                    "service": "EC2",
                    "delta_percent": 24.0,
                    "suspected_driver": "larger node group footprint in platform-prod",
                },
                {
                    "service": "EKS",
                    "delta_percent": 18.0,
                    "suspected_driver": "additional managed node groups",
                },
            ],
        },
    }


@readonly_tool
async def query_runbook_recommendations(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    return {
        "tool": "query_runbook_recommendations",
        "category": "AIOps",
        "summary": "Recommended read-only triage path: verify alerts, correlate logs, inspect EKS health, then review costs.",
        "data": {
            "account_name": identity.account_name,
            "steps": [
                {"step": 1, "action": "Review active alerts and affected services."},
                {"step": 2, "action": "Correlate error logs with deploy and traffic windows."},
                {"step": 3, "action": "Inspect EKS pod pending and node readiness."},
                {"step": 4, "action": "Check cost anomaly context before capacity changes."},
                {"step": 5, "action": "Hand off any mutation to a human-approved runbook."},
            ],
        },
    }


@readonly_tool
async def query_aiops_summary(provider: AwsProvider) -> dict:
    identity = await provider.identity()
    inventory = await query_resource_inventory(provider)
    diagnosis = await query_incident_diagnosis(provider)
    anomalies = await query_cost_anomalies(provider)
    return {
        "tool": "query_aiops_summary",
        "category": "AIOps",
        "summary": "AIOps overview generated across simulated AWS platform signals.",
        "data": {
            "account": {
                "id": identity.account_id,
                "name": identity.account_name,
                "region": identity.region,
            },
            "inventory": inventory["data"]["counts"],
            "incident": diagnosis["data"]["probable_cause"],
            "cost": anomalies["data"]["anomalies"],
        },
    }
