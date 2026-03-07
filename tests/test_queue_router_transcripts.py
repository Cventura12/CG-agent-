from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.queue import router as queue_router
from gc_agent.state import Draft, DraftTranscriptContext

queue_module = import_module("gc_agent.routers.queue")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(queue_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-queue"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_internal_queue_serializes_transcript_review_drafts(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_queued_drafts(_: str) -> list[Draft]:
        return [
            Draft(
                id="draft-transcript-1",
                job_id="job-1",
                job_name="Miller Job",
                type="transcript-review",
                title="Call transcript review",
                content="Transcript ID: ct-1\nSummary: Caller wants a revised quote before Friday.",
                why="Transcript classified as quote question with high urgency.",
                status="queued",
                trace_id="trace-transcript-1",
                transcript=DraftTranscriptContext(
                    transcript_id="ct-1",
                    source="call_transcript",
                    provider="manual",
                    caller_label="Taylor Brooks - +14235550101",
                    caller_phone="+14235550101",
                    summary="Caller wants a revised quote before Friday.",
                    classification="quote_question",
                    urgency="high",
                    confidence=91,
                    recommended_actions=["Send revised quote", "Confirm permit allowance"],
                    risk_flags=["Client may stall approval without revised number."],
                    missing_information=["Updated total with permit allowance"],
                    transcript_text="Can you send me the revised number before Friday?",
                    linked_quote_id="quote-9",
                    recording_url="",
                    started_at=None,
                    duration_seconds=114,
                ),
            )
        ]

    monkeypatch.setattr(queue_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(queue_module.queries, "get_queued_drafts", _fake_get_queued_drafts)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/queue")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    draft = payload["data"]["jobs"][0]["drafts"][0]
    assert draft["type"] == "transcript-review"
    assert draft["transcript"]["transcript_id"] == "ct-1"
    assert draft["transcript"]["caller_label"] == "Taylor Brooks - +14235550101"
    assert draft["transcript"]["summary"] == "Caller wants a revised quote before Friday."
    assert draft["transcript"]["recommended_actions"] == ["Send revised quote", "Confirm permit allowance"]


@pytest.mark.asyncio
async def test_internal_queue_serializes_transcript_and_standard_drafts_together(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_queued_drafts(_: str) -> list[Draft]:
        return [
            Draft(
                id="draft-transcript-1",
                job_id="job-1",
                job_name="Miller Job",
                type="transcript-review",
                title="Call transcript review",
                content="Transcript ID: ct-1\nSummary: Caller wants a revised quote before Friday.",
                why="Transcript classified as quote question with high urgency.",
                status="queued",
                trace_id="trace-transcript-1",
                transcript=DraftTranscriptContext(
                    transcript_id="ct-1",
                    source="call_transcript",
                    provider="manual",
                    caller_label="Taylor Brooks - +14235550101",
                    caller_phone="+14235550101",
                    summary="Caller wants a revised quote before Friday.",
                    classification="quote_question",
                    urgency="high",
                    confidence=91,
                    recommended_actions=["Send revised quote"],
                    risk_flags=[],
                    missing_information=[],
                    transcript_text="Can you send me the revised number before Friday?",
                    linked_quote_id="quote-9",
                    recording_url="",
                    started_at=None,
                    duration_seconds=114,
                ),
            ),
            Draft(
                id="draft-owner-1",
                job_id="job-1",
                job_name="Miller Job",
                type="owner-update",
                title="Owner update draft",
                content="Send progress update about framing timeline.",
                why="Owner is waiting on today's framing status.",
                status="queued",
                trace_id="trace-owner-1",
            ),
        ]

    monkeypatch.setattr(queue_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(queue_module.queries, "get_queued_drafts", _fake_get_queued_drafts)

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/queue")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    drafts = payload["data"]["jobs"][0]["drafts"]
    assert [draft["id"] for draft in drafts] == ["draft-transcript-1", "draft-owner-1"]
    assert drafts[0]["transcript"]["transcript_id"] == "ct-1"
    assert drafts[1]["type"] == "owner-update"
    assert drafts[1]["transcript"] is None
