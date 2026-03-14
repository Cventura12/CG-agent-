from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.state import Job, OpenItem

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
                open_items=[
                    OpenItem(
                        id="open-co-1",
                        job_id="job-1",
                        type="CO",
                        description="Owner approved additional work that still needs pricing.",
                        owner="PM",
                        days_silent=4,
                    )
                ],
            )
        ]

    async def _fake_get_recent_update_logs(_: str, __: str, limit: int = 10):
        _ = limit
        return []

    async def _fake_get_job_call_history(_: str, __: str, limit: int = 12):
        _ = limit
        return [
            {
                "id": "transcript-1",
                "timestamp": "2026-03-04T09:00:00+00:00",
                "trace_id": "trace-transcript-1",
                "caller_label": "Taylor Brooks - +14235550101",
                "caller_phone": "+14235550101",
                "source": "call_transcript",
                "provider": "manual",
                "summary": "Caller wants the revised quote before Friday.",
                "classification": "quote_question",
                "urgency": "high",
                "confidence": 91,
                "risk_flags": ["Client may stall approval without revised number."],
                "recommended_actions": ["Send revised quote"],
                "missing_information": ["Updated total with permit allowance"],
                "transcript_text": "Can you send me the revised number before Friday?",
                "linked_quote_id": "quote-1",
                "related_queue_item_ids": ["draft-transcript-1"],
                "recording_url": "",
                "started_at": None,
                "duration_seconds": 114,
            }
        ]

    async def _fake_get_job_audit_timeline(_: str, __: str, limit: int = 80):
        _ = limit
        return [
            {
                "id": "evt-1",
                "event_type": "call_transcript_received",
                "timestamp": "2026-03-04T09:00:00+00:00",
                "title": "Call captured",
                "summary": "Caller wants the revised quote before Friday.",
                "trace_id": "trace-transcript-1",
                "metadata": {"transcript_id": "transcript-1", "quote_id": "quote-1"},
            }
        ]

    async def _fake_get_job_followup_state(_: str, __: str):
        return {
            "open_item_id": "followup-1",
            "quote_id": "quote-1",
            "job_id": "job-1",
            "status": "scheduled",
            "next_due_at": "2026-03-06T14:00:00+00:00",
            "reminder_count": 1,
            "last_reminder_at": "2026-03-05T14:00:00+00:00",
            "stopped_at": None,
            "stop_reason": None,
            "channel": "sms",
        }

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_recent_update_logs", _fake_get_recent_update_logs)
    monkeypatch.setattr(jobs_module.queries, "get_job_call_history", _fake_get_job_call_history)
    monkeypatch.setattr(jobs_module.queries, "get_job_audit_timeline", _fake_get_job_audit_timeline)
    monkeypatch.setattr(jobs_module.queries, "get_job_followup_state", _fake_get_job_followup_state)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/jobs/job-1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["job"]["id"] == "job-1"
    assert payload["data"]["job"]["operational_summary"]["financial_exposure_count"] == 1
    assert payload["data"]["job"]["open_items"][0]["financial_exposure"] is True
    assert payload["data"]["job"]["open_items"][0]["kind_label"] == "Money at risk"
    assert payload["data"]["call_history"][0]["summary"] == "Caller wants the revised quote before Friday."
    assert payload["data"]["call_history"][0]["related_queue_item_ids"] == ["draft-transcript-1"]
    assert len(payload["data"]["audit_timeline"]) == 1
    assert payload["data"]["audit_timeline"][0]["event_type"] == "call_transcript_received"
    assert payload["data"]["followup_state"]["status"] == "scheduled"


@pytest.mark.asyncio
async def test_job_detail_returns_not_found_when_job_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return []

    async def _fake_get_recent_update_logs(_: str, __: str, limit: int = 10):
        _ = limit
        return []

    async def _fake_get_job_call_history(_: str, __: str, limit: int = 12):
        _ = limit
        return []

    async def _fake_get_job_audit_timeline(_: str, __: str, limit: int = 80):
        _ = limit
        return []

    async def _fake_get_job_followup_state(_: str, __: str):
        return None

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_recent_update_logs", _fake_get_recent_update_logs)
    monkeypatch.setattr(jobs_module.queries, "get_job_call_history", _fake_get_job_call_history)
    monkeypatch.setattr(jobs_module.queries, "get_job_audit_timeline", _fake_get_job_audit_timeline)
    monkeypatch.setattr(jobs_module.queries, "get_job_followup_state", _fake_get_job_followup_state)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/jobs/job-404")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "job_id not found"
