"""Provider-specific transcript webhook normalization into GC Agent input contracts."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Mapping

from gc_agent.input_surface import InboundInput

_FINAL_TRANSCRIPT_STATUSES = {"complete", "completed", "final", "succeeded", "success"}
_PENDING_TRANSCRIPT_STATUSES = {
    "accepted",
    "in_progress",
    "in-progress",
    "partial",
    "pending",
    "processing",
    "queued",
    "received",
}


@dataclass(frozen=True)
class TranscriptWebhookNormalizationResult:
    """Result of provider-specific transcript normalization."""

    inbound_input: InboundInput | None
    reason: str = ""


def _clean_text(value: Any) -> str:
    """Return one trimmed string value or an empty string."""
    if value is None:
        return ""
    return str(value).strip()


def _lookup_mapping_key(payload: Mapping[str, Any], key: str) -> Any:
    """Resolve one key from a mapping with case-insensitive fallback."""
    if key in payload:
        return payload[key]

    lowered = key.lower()
    for existing_key, value in payload.items():
        if str(existing_key).lower() == lowered:
            return value
    return None


def _path_value(payload: Mapping[str, Any], path: str) -> Any:
    """Resolve a dotted path from nested dict payloads."""
    current: Any = payload
    for segment in path.split("."):
        if not isinstance(current, Mapping):
            return None
        current = _lookup_mapping_key(current, segment)
    return current


def _first_present(payload: Mapping[str, Any], *paths: str) -> str:
    """Return the first non-empty string from candidate payload paths."""
    for path in paths:
        value = _clean_text(_path_value(payload, path))
        if value:
            return value
    return ""


def _coerce_int(value: Any) -> int | None:
    """Convert integer-like provider payload values safely."""
    if value is None:
        return None
    if isinstance(value, int):
        return value
    candidate = _clean_text(value)
    if not candidate:
        return None
    try:
        return int(float(candidate))
    except ValueError:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    """Best-effort timestamp parsing for provider payloads."""
    candidate = _clean_text(value)
    if not candidate:
        return None
    try:
        return datetime.fromisoformat(candidate.replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_status(value: str) -> str:
    """Normalize provider status text for pending/final transcript handling."""
    return value.strip().lower().replace(" ", "_")


def normalize_twilio_transcript_payload(
    payload: Mapping[str, Any],
) -> TranscriptWebhookNormalizationResult:
    """Normalize one Twilio transcript/call payload into the internal InboundInput shape."""
    transcription_status = _normalize_status(
        _first_present(
            payload,
            "TranscriptionStatus",
            "transcription_status",
            "transcription.status",
            "status",
        )
    )
    if transcription_status and (
        transcription_status in _PENDING_TRANSCRIPT_STATUSES
        and transcription_status not in _FINAL_TRANSCRIPT_STATUSES
    ):
        return TranscriptWebhookNormalizationResult(
            inbound_input=None,
            reason="transcript_pending",
        )

    transcript_text = _first_present(
        payload,
        "TranscriptionText",
        "transcription_text",
        "Transcript",
        "transcript",
        "transcription.text",
        "data.transcript",
        "payload.transcript",
    )
    if not transcript_text:
        return TranscriptWebhookNormalizationResult(
            inbound_input=None,
            reason="transcript_missing",
        )

    call_id = _first_present(payload, "CallSid", "call_sid", "callSid")
    external_id = _first_present(
        payload,
        "TranscriptionSid",
        "transcription_sid",
        "transcriptionSid",
        "EventSid",
        "event_sid",
    ) or call_id
    from_number = _first_present(payload, "From", "from", "Caller", "caller")
    to_number = _first_present(payload, "To", "to", "Called", "called")
    call_status = _first_present(payload, "CallStatus", "call_status")
    direction = _first_present(payload, "Direction", "direction")

    inbound_input = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text=transcript_text,
        external_id=external_id,
        from_number=from_number,
        gc_id=_first_present(payload, "gc_id", "GcId", "contractor_id", "ContractorId"),
        job_id=_first_present(payload, "job_id", "JobId"),
        quote_id=_first_present(payload, "quote_id", "QuoteId"),
        call_id=call_id,
        provider="twilio",
        caller_name=_first_present(payload, "CallerName", "caller_name"),
        received_at=_parse_datetime(_first_present(payload, "Timestamp", "timestamp", "received_at")),
        started_at=_parse_datetime(_first_present(payload, "StartTime", "start_time", "started_at")),
        duration_seconds=_coerce_int(
            _path_value(payload, "RecordingDuration")
            or _path_value(payload, "CallDuration")
            or _path_value(payload, "duration_seconds")
        ),
        recording_url=_first_present(payload, "RecordingUrl", "recording_url", "recording.url"),
        metadata={
            "call_status": call_status,
            "direction": direction,
            "to_number": to_number,
            "transcription_status": transcription_status,
            "provider_payload_keys": sorted(str(key) for key in payload.keys()),
        },
    )
    return TranscriptWebhookNormalizationResult(inbound_input=inbound_input)


def normalize_provider_transcript(
    provider: str,
    payload: Mapping[str, Any],
) -> TranscriptWebhookNormalizationResult:
    """Normalize one provider transcript payload into the internal transcript ingest contract."""
    normalized_provider = provider.strip().lower()
    if normalized_provider == "twilio":
        return normalize_twilio_transcript_payload(payload)
    raise ValueError(f"unsupported transcript provider: {provider}")


__all__ = [
    "TranscriptWebhookNormalizationResult",
    "normalize_provider_transcript",
    "normalize_twilio_transcript_payload",
]
