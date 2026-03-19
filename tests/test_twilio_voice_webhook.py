from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.input_surface import InboundInput
from gc_agent.voice_runtime import clear_voice_sessions
from gc_agent.webhooks import twilio


def _build_client() -> httpx.AsyncClient:
    app = FastAPI()
    app.include_router(twilio.router, prefix="/webhook")
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def setup_function() -> None:
    clear_voice_sessions()


def teardown_function() -> None:
    clear_voice_sessions()


@pytest.mark.asyncio
async def test_twilio_voice_start_returns_gather_prompt(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)
    async def _fake_upsert_voice_call_session(_session) -> None:
        return None

    async def _fake_resolve(
        payload: dict[str, Any],
        *,
        from_number: str,
        to_number: str,
        explicit_gc_id: str = "",
        ) -> tuple[str, str]:
        assert from_number == "+14235550111"
        assert to_number == "+18005550199"
        return "gc-demo", "from_number"

    monkeypatch.setattr(twilio.queries, "upsert_voice_call_session", _fake_upsert_voice_call_session)
    monkeypatch.setattr(twilio, "_resolve_transcript_gc_id", _fake_resolve)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/twilio/voice",
            data={
                "CallSid": "CA123",
                "From": "+14235550111",
                "To": "+18005550199",
                "CallerName": "Taylor Brooks",
            },
        )

    assert response.status_code == 200
    assert "<Gather" in response.text
    assert "Fieldr here. Tell me what changed on site or what needs to be quoted." in response.text


@pytest.mark.asyncio
async def test_twilio_voice_turn_routes_ready_call_into_transcript_pipeline(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)
    captured: dict[str, Any] = {}
    async def _fake_upsert_voice_call_session(_session) -> None:
        return None

    async def _fake_find_existing_call_transcript_for_ingest(*_args, **_kwargs):
        return None

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        captured["insert_kwargs"] = kwargs
        return "ct-live-1"

    async def _fake_resolve(
        payload: dict[str, Any],
        *,
        from_number: str,
        to_number: str,
        explicit_gc_id: str = "",
    ) -> tuple[str, str]:
        return "gc-demo", "from_number"

    async def _fake_process_normalized_input(
        payload: InboundInput,
        gc_id: str,
        *,
        trace_id: str = "",
    ) -> dict[str, Any]:
        captured["payload"] = payload
        captured["gc_id"] = gc_id
        captured["trace_id"] = trace_id
        return {
            "trace_id": trace_id,
            "transcript_id": "ct-live-1",
            "classification": "estimate_request",
            "active_job_id": "job-voice-1",
            "linked_quote_id": "",
            "created_draft_ids": ["draft-voice-1"],
        }

    monkeypatch.setattr(twilio.queries, "upsert_voice_call_session", _fake_upsert_voice_call_session)
    monkeypatch.setattr(twilio.queries, "find_existing_call_transcript_for_ingest", _fake_find_existing_call_transcript_for_ingest)
    monkeypatch.setattr(twilio.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(twilio, "_resolve_transcript_gc_id", _fake_resolve)
    monkeypatch.setattr(twilio, "_process_normalized_input", _fake_process_normalized_input)

    async with _build_client() as client:
        start_response = await client.post(
            "/webhook/twilio/voice",
            data={
                "CallSid": "CA123",
                "From": "+14235550111",
                "To": "+18005550199",
                "CallerName": "Taylor Brooks",
            },
        )
        first_turn = await client.post(
            "/webhook/twilio/voice/turn",
            data={
                "CallSid": "CA123",
                "From": "+14235550111",
                "To": "+18005550199",
                "SpeechResult": "This is Taylor at Johnson site.",
                "Confidence": "0.91",
            },
        )
        second_turn = await client.post(
            "/webhook/twilio/voice/turn",
            data={
                "CallSid": "CA123",
                "From": "+14235550111",
                "To": "+18005550199",
                "SpeechResult": "We need to swap the flashing and add $320 today before the crew closes the roof.",
                "Confidence": "0.95",
            },
        )

    assert start_response.status_code == 200
    assert first_turn.status_code == 200
    assert "Tell me what changed on site or what you need priced." in first_turn.text

    assert second_turn.status_code == 200
    assert "I routed this for review and created 1 draft action in your queue." in second_turn.text
    assert captured["gc_id"] == "gc-demo"
    assert captured["trace_id"] == "CA123"
    assert captured["payload"].surface == "call_transcript"
    assert captured["payload"].intent == "transcript"
    assert captured["payload"].call_id == "CA123"
    assert captured["payload"].metadata["voice_goal"] == "issue_report"
    assert captured["insert_kwargs"]["summary"] == "Roofing · Field issue at Johnson site: We need to swap the flashing and add $320 today before the crew closes the roof."
    assert captured["insert_kwargs"]["metadata"]["review_state"] == "pending"
    assert "Caller: This is Taylor at Johnson site." in captured["payload"].raw_text
    assert "Caller: We need to swap the flashing and add $320 today before the crew closes the roof." in captured["payload"].raw_text


@pytest.mark.asyncio
async def test_twilio_voice_turn_transfers_and_keeps_review_record_when_handoff_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)
    monkeypatch.setenv("TWILIO_VOICE_FALLBACK_TO", "+14235550199")
    captured: dict[str, Any] = {}

    async def _fake_upsert_voice_call_session(_session) -> None:
        return None

    async def _fake_find_existing_call_transcript_for_ingest(*_args, **_kwargs):
        return None

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        captured["insert_kwargs"] = kwargs
        return "ct-live-fallback"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        captured["update_args"] = {"transcript_id": transcript_id, "gc_id": gc_id, "kwargs": kwargs}

    async def _fake_resolve(
        payload: dict[str, Any],
        *,
        from_number: str,
        to_number: str,
        explicit_gc_id: str = "",
    ) -> tuple[str, str]:
        return "gc-demo", "from_number"

    async def _fake_process_normalized_input(
        payload: InboundInput,
        gc_id: str,
        *,
        trace_id: str = "",
    ) -> dict[str, Any]:
        raise RuntimeError("downstream exploded")

    monkeypatch.setattr(twilio.queries, "upsert_voice_call_session", _fake_upsert_voice_call_session)
    monkeypatch.setattr(twilio.queries, "find_existing_call_transcript_for_ingest", _fake_find_existing_call_transcript_for_ingest)
    monkeypatch.setattr(twilio.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(twilio.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(twilio, "_resolve_transcript_gc_id", _fake_resolve)
    monkeypatch.setattr(twilio, "_process_normalized_input", _fake_process_normalized_input)

    async with _build_client() as client:
        await client.post(
            "/webhook/twilio/voice",
            data={
                "CallSid": "CA999",
                "From": "+14235550111",
                "To": "+18005550199",
                "CallerName": "Taylor Brooks",
            },
        )
        response = await client.post(
            "/webhook/twilio/voice/turn",
            data={
                "CallSid": "CA999",
                "From": "+14235550111",
                "To": "+18005550199",
                "SpeechResult": "I need a human about Johnson site because I am not sure what changed. The owner wants to talk through it now.",
                "Confidence": "0.63",
            },
        )

    assert response.status_code == 200
    assert "<Dial>+14235550199</Dial>" in response.text
    assert captured["insert_kwargs"]["metadata"]["review_state"] == "pending"
    assert captured["update_args"]["transcript_id"] == "ct-live-fallback"
    assert captured["update_args"]["kwargs"]["metadata"]["processing_error"] == "live_voice_handoff_failed"
