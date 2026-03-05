from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.state import Job

jobs_module = import_module("gc_agent.routers.jobs")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(jobs_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-jobs"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_job_detail_includes_audit_timeline(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return [
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
            )
        ]

    async def _fake_get_recent_update_logs(_: str, __: str, limit: int = 10):
        _ = limit
        return []

    async def _fake_get_job_audit_timeline(_: str, __: str, limit: int = 80):
        _ = limit
        return [
            {
                "id": "evt-1",
                "event_type": "quote_approved",
                "timestamp": "2026-03-04T10:00:00+00:00",
                "title": "Quote approved",
                "summary": "Quote quote-1 marked approved.",
                "trace_id": "trace-1",
                "metadata": {"quote_id": "quote-1"},
            }
        ]

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_recent_update_logs", _fake_get_recent_update_logs)
    monkeypatch.setattr(jobs_module.queries, "get_job_audit_timeline", _fake_get_job_audit_timeline)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/jobs/job-1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["job"]["id"] == "job-1"
    assert len(payload["data"]["audit_timeline"]) == 1
    assert payload["data"]["audit_timeline"][0]["event_type"] == "quote_approved"


@pytest.mark.asyncio
async def test_job_detail_returns_not_found_when_job_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return []

    async def _fake_get_recent_update_logs(_: str, __: str, limit: int = 10):
        _ = limit
        return []

    async def _fake_get_job_audit_timeline(_: str, __: str, limit: int = 80):
        _ = limit
        return []

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_recent_update_logs", _fake_get_recent_update_logs)
    monkeypatch.setattr(jobs_module.queries, "get_job_audit_timeline", _fake_get_job_audit_timeline)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/jobs/job-404")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "job_id not found"
