import asyncio

import pytest

from integrations.aws.provider import MockAwsProvider
from tools.guard import ReadOnlyViolation, assert_read_only_tool
from tools.registry import ToolRegistry


def test_all_registered_tools_are_read_only() -> None:
    asyncio.run(_assert_all_registered_tools_are_read_only())


async def _assert_all_registered_tools_are_read_only() -> None:
    registry = ToolRegistry(provider=MockAwsProvider())

    for name in registry.names():
        result = await registry.run(name)
        assert name.startswith("query_")
        assert result["readonly"] is True
        assert isinstance(result["data"], dict)


def test_aiops_tools_are_registered() -> None:
    registry = ToolRegistry(provider=MockAwsProvider())

    assert {
        "query_incident_diagnosis",
        "query_cost_anomalies",
        "query_runbook_recommendations",
        "query_aiops_summary",
    }.issubset(set(registry.names()))


def test_guard_rejects_non_query_mutations() -> None:
    with pytest.raises(ReadOnlyViolation):
        assert_read_only_tool("update_auto_scaling_group")
