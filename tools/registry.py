from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import HTTPException

from integrations.aws.provider import AwsProvider, get_aws_provider
from tools.alerts import query_alerts
from tools.aiops import (
    query_aiops_summary,
    query_cost_anomalies,
    query_incident_diagnosis,
    query_runbook_recommendations,
)
from tools.eks import query_cluster_status
from tools.finops import query_service_cost
from tools.guard import ReadOnlyViolation, assert_read_only_tool
from tools.logs import query_logs
from tools.resources import query_resource_inventory

ToolFunc = Callable[[AwsProvider], Awaitable[dict[str, Any]]]


class ToolRegistry:
    def __init__(self, provider: AwsProvider) -> None:
        self.provider = provider
        self._tools: dict[str, ToolFunc] = {
            "query_alerts": query_alerts,
            "query_service_cost": query_service_cost,
            "query_cluster_status": query_cluster_status,
            "query_resource_inventory": query_resource_inventory,
            "query_logs": query_logs,
            "query_incident_diagnosis": query_incident_diagnosis,
            "query_cost_anomalies": query_cost_anomalies,
            "query_runbook_recommendations": query_runbook_recommendations,
            "query_aiops_summary": query_aiops_summary,
        }
        for name in self._tools:
            assert_read_only_tool(name)

    def names(self) -> list[str]:
        return list(self._tools.keys())

    def select_for_message(self, message: str) -> list[str]:
        text = message.lower()
        selection_rules = {
            "query_alerts": ["alert", "alarm", "incident"],
            "query_service_cost": ["cost", "finops", "spend", "bill"],
            "query_cluster_status": ["eks", "cluster", "pod", "node"],
            "query_resource_inventory": ["resource", "inventory", "ec2", "rds", "s3"],
            "query_logs": ["log", "error", "trace"],
            "query_incident_diagnosis": ["diagnose", "incident", "root cause", "rca", "degradation"],
            "query_cost_anomalies": ["anomaly", "cost spike", "overspend", "finops"],
            "query_runbook_recommendations": ["runbook", "triage", "next step"],
            "query_aiops_summary": ["aiops", "overview", "summary", "all signals", "full system"],
        }
        return [
            name
            for name, keywords in selection_rules.items()
            if any(keyword in text for keyword in keywords)
        ]

    async def run(self, name: str) -> dict[str, Any]:
        try:
            assert_read_only_tool(name)
        except ReadOnlyViolation as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        tool = self._tools.get(name)
        if tool is None:
            raise HTTPException(status_code=404, detail=f"Unknown tool '{name}'.")
        return await tool(self.provider)


def get_tool_registry() -> ToolRegistry:
    return ToolRegistry(provider=get_aws_provider())
