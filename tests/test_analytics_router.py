from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.analytics import router as analytics_router

analytics_module = import_module("gc_agent.routers.analytics")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(analytics_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-analytics"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_usage_analytics_returns_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_usage_analytics(gc_id: str, window_days: int = 30) -> dict[str, object]:
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        assert window_days == 7
        return {
            "window_days": 7,
            "quotes": {
                "generated": 10,
                "approved": 6,
                "edited": 2,
                "discarded": 2,
                "approval_rate_pct": 80.0,
                "avg_quote_value": 12500.0,
                "memory_updates": 8,
            },
            "delivery": {"sent": 5, "failed": 1, "channel_breakdown": {"whatsapp": 4, "sms": 2}},
            "updates": {"ingested": 12, "drafts_suggested": 18},
            "queue": {"pending": 3, "approved": 11, "discarded": 2, "edited": 4},
            "runtime": {
                "trace_rows": 120,
                "trace_errors": 3,
                "trace_error_rate_pct": 2.5,
                "avg_node_latency_ms": 412.2,
                "flow_breakdown": {"estimate": 70, "update": 50},
            },
            "warnings": [],
            "since": "2026-01-01T00:00:00+00:00",
        }

    monkeypatch.setattr(
        analytics_module.queries,
        "get_gc_by_clerk_user_id",
        _fake_get_gc_by_clerk_user_id,
    )
    monkeypatch.setattr(
        analytics_module.queries,
        "get_usage_analytics",
        _fake_get_usage_analytics,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/analytics/usage", params={"days": 7})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["quotes"]["generated"] == 10
    assert payload["data"]["delivery"]["sent"] == 5


@pytest.mark.asyncio
async def test_usage_analytics_requires_registered_gc(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return None

    monkeypatch.setattr(
        analytics_module.queries,
        "get_gc_by_clerk_user_id",
        _fake_get_gc_by_clerk_user_id,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/analytics/usage")

    assert response.status_code == 403
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "GC profile not registered"
