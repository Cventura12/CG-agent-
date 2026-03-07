from __future__ import annotations

from typing import Any

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.input_surface import InboundInput
from gc_agent.webhooks import twilio


def _build_client() -> httpx.AsyncClient:
    app = FastAPI()
    app.include_router(twilio.router, prefix="/webhook")
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_twilio_transcript_webhook_normalizes_and_dispatches(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}

    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)

    async def _fake_lookup_gc_id_by_phone(phone_number: str) -> tuple[str, bool]:
        assert phone_number == "+14235550111"
        return "gc-demo", True

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
            "transcript_id": "ct-123",
            "classification": "estimate_request",
            "active_job_id": "job-9",
            "linked_quote_id": "quote-9",
            "created_draft_ids": ["draft-1"],
        }

    monkeypatch.setattr(twilio, "_lookup_gc_id_by_phone", _fake_lookup_gc_id_by_phone)
    monkeypatch.setattr(twilio, "_process_normalized_input", _fake_process_normalized_input)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/twilio/transcript",
            data={
                "TranscriptionSid": "TR123",
                "CallSid": "CA123",
                "From": "+14235550111",
                "To": "+18005550199",
                "CallerName": "Taylor Brooks",
                "TranscriptionText": "Customer wants the revised estimate by tomorrow.",
                "RecordingUrl": "https://api.twilio.test/recording",
                "RecordingDuration": "42",
                "TranscriptionStatus": "completed",
            },
        )

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["transcript_id"] == "ct-123"
    assert captured["gc_id"] == "gc-demo"
    assert captured["trace_id"] == "TR123"
    assert captured["payload"].surface == "call_transcript"
    assert captured["payload"].intent == "transcript"
    assert captured["payload"].provider == "twilio"
    assert captured["payload"].call_id == "CA123"
    assert captured["payload"].raw_text == "Customer wants the revised estimate by tomorrow."
    assert captured["payload"].metadata["webhook_provider"] == "twilio"
    assert captured["payload"].metadata["gc_resolution"] == "from_number"


@pytest.mark.asyncio
async def test_twilio_transcript_webhook_ignores_pending_transcripts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/twilio/transcript",
            data={
                "CallSid": "CA999",
                "From": "+14235550111",
                "TranscriptionStatus": "in-progress",
            },
        )

    assert response.status_code == 202
    assert response.json()["status"] == "ignored"
    assert response.json()["reason"] == "transcript_pending"


@pytest.mark.asyncio
async def test_twilio_transcript_webhook_rejects_invalid_signature(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: False)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/twilio/transcript",
            data={"CallSid": "CA123", "TranscriptionText": "Transcript text"},
        )

    assert response.status_code == 403
