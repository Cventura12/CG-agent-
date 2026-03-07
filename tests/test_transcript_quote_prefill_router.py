from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.transcripts import router as transcripts_router
from gc_agent.state import TranscriptQuotePrefill

transcripts_module = import_module("gc_agent.routers.transcripts")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(transcripts_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-transcripts"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_quote_prefill_route_returns_transcript_estimate_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-demo"

    async def _fake_get_prefill(transcript_id: str, gc_id: str) -> object:
        assert transcript_id == "ct-1"
        assert gc_id == "gc-demo"
        return TranscriptQuotePrefill(
            transcript_id="ct-1",
            trace_id="trace-transcript-1",
            classification="estimate_request",
            confidence=87.0,
            summary="Caller wants a first-pass estimate.",
            urgency="high",
            caller_name="Taylor Brooks",
            caller_phone="+14235550101",
            linked_job_id="job-9",
            linked_quote_id="",
            customer_name="Taylor Brooks",
            job_type="Exterior Painting",
            scope_items=["Prime siding"],
            customer_questions=["Can you include better-grade paint?"],
            insurance_involved=False,
            missing_information=["Exact square footage"],
            recommended_actions=["Create quote draft"],
            scheduling_notes=["Needs number before Friday"],
            estimate_related=True,
            quote_input="Call transcript estimate request",
        )

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_get_transcript_quote_prefill", _fake_get_prefill)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/transcripts/ct-1/quote-prefill")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["classification"] == "estimate_request"
    assert payload["data"]["linked_job_id"] == "job-9"
    assert payload["data"]["quote_input"] == "Call transcript estimate request"


@pytest.mark.asyncio
async def test_quote_prefill_route_returns_not_found_when_transcript_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "gc-demo"

    async def _fake_get_prefill(_: str, __: str) -> None:
        return None

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_get_transcript_quote_prefill", _fake_get_prefill)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/transcripts/missing/quote-prefill")

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"] == "transcript_id not found"
