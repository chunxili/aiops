from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def test_chat_route_returns_tool_calls() -> None:
    response = client.post("/api/agent/chat", json={"message": "Check EKS alerts and costs"})

    assert response.status_code == 200
    body = response.json()
    assert "Mock MiniMax AIOps response" in body["answer"]
    assert {call["name"] for call in body["tool_calls"]} >= {
        "query_alerts",
        "query_service_cost",
        "query_cluster_status",
    }
    assert all(call["result"]["readonly"] is True for call in body["tool_calls"])


def test_chat_route_can_use_aiops_summary() -> None:
    response = client.post("/api/agent/chat", json={"message": "Give me the full AIOps summary"})

    assert response.status_code == 200
    body = response.json()
    assert {call["name"] for call in body["tool_calls"]} >= {"query_aiops_summary"}


def test_tool_route_returns_structured_json() -> None:
    response = client.get("/api/tools/query_resource_inventory")

    assert response.status_code == 200
    body = response.json()
    assert body["tool"] == "query_resource_inventory"
    assert body["category"] == "Resource"
    assert body["readonly"] is True
    assert "counts" in body["data"]


def test_read_only_guard_blocks_mutating_tool_names() -> None:
    response = client.get("/api/tools/delete_cluster")

    assert response.status_code == 403
    assert "read-only guard" in response.json()["detail"]
