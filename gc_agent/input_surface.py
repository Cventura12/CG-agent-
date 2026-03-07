"""Normalized inbound payload contract for future voice-capable ingress."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from gc_agent.state import AgentState

InboundSurface = Literal[
    "typed_note",
    "upload",
    "sms",
    "whatsapp",
    "voice_note",
    "inbound_call",
    "voicemail",
    "call_transcript",
]
InboundIntent = Literal["estimate", "update", "briefing", "transcript"]


class InboundInput(BaseModel):
    """Single normalized ingress payload for all external input surfaces."""

    surface: InboundSurface
    intent: InboundIntent | None = None
    raw_text: str = ""
    media_url: str = ""
    mime_type: str = ""
    external_id: str = ""
    from_number: str = ""
    gc_id: str = ""
    job_id: str = ""
    quote_id: str = ""
    call_id: str = ""
    provider: str = ""
    caller_name: str = ""
    received_at: datetime | None = None
    started_at: datetime | None = None
    duration_seconds: int | None = None
    recording_url: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


def _input_type_for_surface(surface: InboundSurface) -> Literal["whatsapp", "sms", "chat", "cron", "voice"]:
    """Map inbound surface names to the existing AgentState input_type enum."""
    if surface in {"sms"}:
        return "sms"
    if surface in {"whatsapp"}:
        return "whatsapp"
    if surface in {"voice_note", "inbound_call", "voicemail", "call_transcript"}:
        return "voice"
    return "chat"


def to_agent_state(payload: InboundInput, trace_id: str, *, gc_id: str = "") -> AgentState:
    """Convert a normalized ingress payload into the existing AgentState shape."""
    resolved_gc_id = gc_id.strip() or payload.gc_id.strip()
    raw_input = payload.raw_text.strip() or payload.media_url.strip()
    thread_id = payload.external_id.strip() or trace_id.strip()

    return AgentState(
        input_type=_input_type_for_surface(payload.surface),
        raw_input=raw_input,
        from_number=payload.from_number.strip(),
        mode=payload.intent,
        gc_id=resolved_gc_id,
        thread_id=thread_id,
        trace_id=trace_id.strip(),
    )


__all__ = ["InboundInput", "InboundIntent", "InboundSurface", "to_agent_state"]
