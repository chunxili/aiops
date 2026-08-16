from fastapi.testclient import TestClient

from app.main import create_app


client = TestClient(create_app())


def test_root_route_points_to_agent_entrypoint() -> None:
    response = client.get("/")

    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "aws-platform-agent"
    assert body["entrypoint"] == "/api/agent/chat"
    assert body["docs"] == "/docs"
