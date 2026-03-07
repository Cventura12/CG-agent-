from __future__ import annotations

from gc_agent.webhooks.transcript_normalization import (
    normalize_provider_transcript,
    normalize_twilio_transcript_payload,
)


def test_normalize_twilio_transcript_payload_maps_common_fields() -> None:
    result = normalize_twilio_transcript_payload(
        {
            "TranscriptionSid": "TR123",
            "CallSid": "CA123",
            "From": "+14235550111",
            "To": "+18005550199",
            "CallerName": "Taylor Brooks",
            "TranscriptionText": "Customer wants the revised estimate by tomorrow.",
            "RecordingUrl": "https://api.twilio.test/recording",
            "RecordingDuration": "42",
            "TranscriptionStatus": "completed",
            "gc_id": "gc-demo",
        }
    )

    assert result.reason == ""
    assert result.inbound_input is not None
    assert result.inbound_input.surface == "call_transcript"
    assert result.inbound_input.intent == "transcript"
    assert result.inbound_input.provider == "twilio"
    assert result.inbound_input.external_id == "TR123"
    assert result.inbound_input.call_id == "CA123"
    assert result.inbound_input.gc_id == "gc-demo"
    assert result.inbound_input.raw_text == "Customer wants the revised estimate by tomorrow."
    assert result.inbound_input.duration_seconds == 42
    assert result.inbound_input.metadata["to_number"] == "+18005550199"


def test_normalize_provider_transcript_returns_pending_when_status_not_final() -> None:
    result = normalize_provider_transcript(
        "twilio",
        {
            "CallSid": "CA999",
            "TranscriptionStatus": "in-progress",
        },
    )

    assert result.inbound_input is None
    assert result.reason == "transcript_pending"
