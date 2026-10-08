import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def test_live_health() -> None:
    client = TestClient(app)
    response = client.get("/health/live")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_exposes_realtime_and_chat() -> None:
    client = TestClient(app)
    schema = client.get("/openapi.json").json()
    assert "/api/v1/chat/completions" in schema["paths"]
    assert "/health/live" in schema["paths"]
