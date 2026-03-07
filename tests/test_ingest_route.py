from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.state import AgentState

ROUTER_PATH = Path(__file__).resolve().parents[1] / "gc_agent" / "routers" / "ingest.py"
ROUTER_SPEC = spec_from_file_location("gc_agent_routers_ingest_test", ROUTER_PATH)
assert ROUTER_SPEC is not None and ROUTER_SPEC.loader is not None
ingest_module = module_from_spec(ROUTER_SPEC)
ROUTER_SPEC.loader.exec_module(ingest_module)


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(ingest_module.router, prefix="/api/v1")
    return app


@pytest.mark.asyncio
async def test_ingest_route_dispatches_estimate_path_and_returns_trace_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_by_clerk_user_id(clerk_user_id: str) -> str:
        assert clerk_user_id == "clerk-user-123"
        return "gc-demo"

    async def _fake_run_single_input(
        raw_input: str,
        *,
        session_id: str,
        gc_id: str,
    ) -> AgentState:
        assert raw_input == "Replace 20 squares on Oak Street"
        assert session_id == "trace-123"
        assert gc_id == "gc-demo"
        return AgentState(
            mode="estimate",
            trace_id=session_id,
            active_job_id="job-1",
            quote_draft={"scope_of_work": "Replace roof"},
            rendered_quote="Quote preview",
        )

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(ingest_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(ingest_module, "_run_single_input", _fake_run_single_input)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/ingest",
            json={
                "surface": "typed_note",
                "intent": "estimate",
                "raw_text": "Replace 20 squares on Oak Street",
                "external_id": "trace-123",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["mode"] == "estimate"
    assert payload["data"]["trace_id"] == "trace-123"
    assert payload["data"]["active_job_id"] == "job-1"
    assert payload["data"]["rendered_quote"] == "Quote preview"


@pytest.mark.asyncio
async def test_ingest_route_dispatches_transcript_path_and_returns_structured_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_by_clerk_user_id(clerk_user_id: str) -> str:
        assert clerk_user_id == "clerk-user-123"
        return "gc-demo"

    async def _fake_process_call_transcript(payload, gc_id: str, trace_id: str) -> dict[str, object]:
        assert payload.surface == "call_transcript"
        assert payload.intent == "transcript"
        assert payload.raw_text == "Customer asked to move the walkthrough."
        assert gc_id == "gc-demo"
        assert trace_id == "trace-transcript-1"
        return {
            "mode": "transcript",
            "trace_id": trace_id,
            "transcript_id": "ct-1",
            "summary": "Customer wants to move the walkthrough.",
            "classification": "reschedule",
            "confidence": 83.0,
            "urgency": "normal",
            "risk_flags": [],
            "missing_information": ["New time window"],
            "next_actions": ["Confirm the new walkthrough time."],
            "active_job_id": "job-9",
            "linked_quote_id": "quote-9",
            "created_draft_ids": ["draft-1"],
            "errors": [],
        }

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(ingest_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(ingest_module, "_process_call_transcript", _fake_process_call_transcript)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/ingest",
            json={
                "surface": "call_transcript",
                "intent": "transcript",
                "raw_text": "Customer asked to move the walkthrough.",
                "external_id": "trace-transcript-1",
                "from_number": "+14235550109",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["mode"] == "transcript"
    assert payload["data"]["transcript_id"] == "ct-1"
    assert payload["data"]["linked_quote_id"] == "quote-9"
    assert payload["data"]["created_draft_ids"] == ["draft-1"]


@pytest.mark.asyncio
async def test_ingest_route_passes_transcript_linkage_and_metadata_fields_to_processor(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_by_clerk_user_id(clerk_user_id: str) -> str:
        assert clerk_user_id == "clerk-user-123"
        return "gc-demo"

    async def _fake_process_call_transcript(payload, gc_id: str, trace_id: str) -> dict[str, object]:
        assert gc_id == "gc-demo"
        assert trace_id == "trace-transcript-metadata"
        assert payload.job_id == "job-7"
        assert payload.quote_id == "quote-7"
        assert payload.call_id == "call-7"
        assert payload.provider == "twilio"
        assert payload.caller_name == "Taylor Brooks"
        assert payload.duration_seconds == 114
        assert payload.recording_url == "https://example.com/recording.mp3"
        assert payload.metadata == {"language": "en"}
        assert payload.started_at is not None
        assert payload.started_at.isoformat() == "2026-03-06T10:00:00+00:00"
        return {
            "mode": "transcript",
            "trace_id": trace_id,
            "transcript_id": "ct-7",
            "summary": "Caller wants a revised estimate for the detached garage.",
            "classification": "estimate_request",
            "confidence": 89.0,
            "urgency": "high",
            "risk_flags": [],
            "missing_information": ["Exact garage dimensions"],
            "next_actions": ["Create quote draft"],
            "active_job_id": "job-7",
            "linked_quote_id": "quote-7",
            "created_draft_ids": ["draft-7"],
            "errors": [],
        }

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(ingest_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(ingest_module, "_process_call_transcript", _fake_process_call_transcript)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/ingest",
            json={
                "surface": "call_transcript",
                "intent": "transcript",
                "raw_text": "I need a revised estimate for the detached garage.",
                "external_id": "trace-transcript-metadata",
                "job_id": "job-7",
                "quote_id": "quote-7",
                "call_id": "call-7",
                "provider": "twilio",
                "caller_name": "Taylor Brooks",
                "from_number": "+14235550107",
                "started_at": "2026-03-06T10:00:00+00:00",
                "duration_seconds": 114,
                "recording_url": "https://example.com/recording.mp3",
                "metadata": {"language": "en"},
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["transcript_id"] == "ct-7"
    assert payload["data"]["active_job_id"] == "job-7"
    assert payload["data"]["created_draft_ids"] == ["draft-7"]
