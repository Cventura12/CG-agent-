from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.insights import router as insights_router

insights_module = import_module("gc_agent.routers.insights")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(insights_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-insights"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_multi_job_insights_returns_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_multi_job_insights(gc_id: str, horizon_days: int = 14):
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        assert horizon_days == 7
        return {
            "horizon_days": 7,
            "generated_at": "2026-03-04T00:00:00+00:00",
            "summary": {
                "active_jobs_considered": 5,
                "opportunities_found": 1,
                "estimated_total_savings_amount": 1800.0,
            },
            "opportunities": [
                {
                    "group_key": "roofing::lump sum",
                    "job_type": "Roofing",
                    "contract_type": "Lump Sum",
                    "job_count": 2,
                    "jobs": [],
                    "suggested_materials": ["Architectural shingles"],
                    "estimated_savings_pct": 4.0,
                    "estimated_savings_amount": 1800.0,
                    "confidence": "high",
                    "rationale": "2 active jobs can share a material order.",
                    "recommended_order_window_days": 2,
                    "generated_at": "2026-03-04T00:00:00+00:00",
                }
            ],
        }

    monkeypatch.setattr(
        insights_module.queries,
        "get_gc_by_clerk_user_id",
        _fake_get_gc_by_clerk_user_id,
    )
    monkeypatch.setattr(
        insights_module.queries,
        "get_multi_job_insights",
        _fake_get_multi_job_insights,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/insights/multi-job", params={"horizon_days": 7})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["summary"]["opportunities_found"] == 1


@pytest.mark.asyncio
async def test_multi_job_insights_requires_registered_gc(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return None

    monkeypatch.setattr(
        insights_module.queries,
        "get_gc_by_clerk_user_id",
        _fake_get_gc_by_clerk_user_id,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/insights/multi-job")

    assert response.status_code == 403
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "GC profile not registered"
