"""Twilio webhook handlers for Arbor Agent."""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
from collections import Counter
from importlib import import_module
from typing import Any, Optional
from uuid import uuid4
from xml.sax.saxutils import escape

from dotenv import load_dotenv
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from supabase import Client, create_client
try:
    from twilio.rest import Client as TwilioClient
    from twilio.request_validator import RequestValidator
    from twilio.twiml.messaging_response import MessagingResponse
    _TWILIO_IMPORT_ERROR: Exception | None = None
except ModuleNotFoundError as exc:  # pragma: no cover - handled at runtime.
    TwilioClient = Any  # type: ignore[assignment]
    RequestValidator = None  # type: ignore[assignment]
    MessagingResponse = None  # type: ignore[assignment]
    _TWILIO_IMPORT_ERROR = exc

from gc_agent import graph
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.input_surface import InboundInput
from gc_agent.state import AgentState
from gc_agent.tools.call_recordings import upload_call_recording_file
from gc_agent.voice_streaming import DeepgramLiveBridge, DeepgramTTSBridge, mulaw_bytes_to_wav
from gc_agent.voice_runtime import (
    apply_voice_plan,
    append_voice_turn,
    build_voice_transcript,
    get_voice_session,
    increment_voice_silence,
    mark_voice_handoff,
    plan_voice_session,
    remember_voice_session,
    update_voice_session,
    upsert_voice_session,
)
from gc_agent.webhooks.onboarding import build_unregistered_onboarding_message
from gc_agent.webhooks.transcript_normalization import normalize_provider_transcript

load_dotenv()

LOGGER = logging.getLogger(__name__)
router = APIRouter(tags=["twilio"])

_SUPABASE_CLIENT: Optional[Client] = None
_TWILIO_CLIENT: Optional[TwilioClient] = None


def _get_status_callback_url(explicit_url: str = "") -> str:
    """Return the Twilio delivery status callback URL when configured."""
    if explicit_url.strip():
        return explicit_url.strip()
    return os.getenv("TWILIO_STATUS_CALLBACK_URL", "").strip()


def _truncate(text: str, max_chars: int) -> str:
    """Return text constrained to max_chars while preserving readability."""
    cleaned = text.strip()
    if len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 3].rstrip() + "..."


def _twiml_message(message_text: str) -> str:
    """Build a TwiML response body for outbound WhatsApp replies."""
    if MessagingResponse is None:
        escaped = message_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        return f"<Response><Message>{escaped}</Message></Response>"

    response = MessagingResponse()
    response.message(message_text)
    return str(response)


def _twiml_voice_gather(prompt_text: str, *, action_url: str, fallback_url: str) -> str:
    """Build simple TwiML for a conversational voice turn."""
    prompt = escape(prompt_text.strip() or "Tell me what changed on site or what needs to be quoted.")
    action = escape(action_url.strip())
    fallback = escape(fallback_url.strip())
    return (
        "<Response>"
        f'<Gather input="speech" action="{action}" method="POST" speechTimeout="auto" timeout="4">'
        f"<Say>{prompt}</Say>"
        "</Gather>"
        f'<Redirect method="POST">{fallback}</Redirect>'
        "</Response>"
    )


def _twiml_voice_stream(prompt_text: str, *, stream_url: str) -> str:
    """Build TwiML that speaks a prompt and reconnects the call to a media stream."""
    prompt = escape(prompt_text.strip() or "Tell me what changed on site or what needs to be quoted.")
    stream_target = escape(stream_url.strip())
    return (
        "<Response>"
        f"<Say>{prompt}</Say>"
        "<Connect>"
        f'<Stream url="{stream_target}" track="inbound_track" />'
        "</Connect>"
        "</Response>"
    )


def _twiml_voice_message(message_text: str, *, hangup: bool = False) -> str:
    """Build a voice-only TwiML response."""
    prompt = escape(message_text.strip() or "I captured that.")
    hangup_xml = "<Hangup/>" if hangup else ""
    return f"<Response><Say>{prompt}</Say>{hangup_xml}</Response>"


def _twiml_hangup() -> str:
    """Build a hangup-only TwiML response for post-playback call completion."""
    return "<Response><Hangup/></Response>"


def _twiml_transfer_only(*, transfer_to: str) -> str:
    """Build a transfer-only TwiML response after audio has already been played."""
    destination = escape(transfer_to.strip())
    return f"<Response><Dial>{destination}</Dial></Response>"


def _normalize_whatsapp_number(phone_number: str) -> str:
    """Return Twilio WhatsApp-addressable destination format."""
    cleaned = phone_number.strip()
    if not cleaned:
        raise ValueError("Destination phone number is required")
    if cleaned.startswith("whatsapp:"):
        return cleaned
    return f"whatsapp:{cleaned}"


def _normalize_sms_number(phone_number: str) -> str:
    """Return Twilio SMS destination format (no whatsapp: prefix)."""
    cleaned = phone_number.strip()
    if not cleaned:
        raise ValueError("Destination phone number is required")
    if cleaned.startswith("whatsapp:"):
        cleaned = cleaned.replace("whatsapp:", "", 1).strip()
    return cleaned


def _normalize_lookup_number(phone_number: str) -> str:
    """Return a lookup-safe phone string for GC identity matching."""
    cleaned = phone_number.strip()
    if cleaned.startswith("whatsapp:"):
        cleaned = cleaned.replace("whatsapp:", "", 1).strip()
    return cleaned


def _get_twilio_client() -> TwilioClient:
    """Create and memoize Twilio REST client from environment variables."""
    global _TWILIO_CLIENT

    if _TWILIO_CLIENT is not None:
        return _TWILIO_CLIENT

    if _TWILIO_IMPORT_ERROR is not None:
        raise RuntimeError(
            "Twilio SDK is required for notification delivery. "
            "Install the 'twilio' package."
        ) from _TWILIO_IMPORT_ERROR

    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()

    if not account_sid or not auth_token:
        raise RuntimeError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required")

    _TWILIO_CLIENT = TwilioClient(account_sid, auth_token)
    return _TWILIO_CLIENT


def _send_single_whatsapp_message(
    client: TwilioClient,
    from_number: str,
    to_number: str,
    body: str,
    *,
    status_callback_url: str = "",
) -> str:
    """Send one WhatsApp message synchronously and return Twilio SID."""
    create_kwargs: dict[str, Any] = {
        "from_": from_number,
        "to": to_number,
        "body": body,
    }
    if status_callback_url:
        create_kwargs["status_callback"] = status_callback_url

    message = client.messages.create(**create_kwargs)
    sid = str(getattr(message, "sid", "")).strip()
    if not sid:
        raise RuntimeError("Twilio returned empty SID")
    return sid


def _split_for_twilio(body: str, max_chars: int = 1600) -> list[str]:
    """Split long WhatsApp body into at most two prefixed messages."""
    cleaned = body.strip() or "Morning briefing unavailable."
    if len(cleaned) <= max_chars:
        return [cleaned]

    prefix_one = "Part 1/2: "
    prefix_two = "Part 2/2: "
    first_cap = max_chars - len(prefix_one)
    second_cap = max_chars - len(prefix_two)

    first_text = cleaned[:first_cap].rstrip()
    remaining = cleaned[first_cap:].lstrip()
    if len(remaining) > second_cap:
        remaining = remaining[: max(second_cap - 3, 0)].rstrip() + "..."

    second_text = remaining.rstrip()
    if not second_text:
        second_text = "No additional content."

    return [f"{prefix_one}{first_text}", f"{prefix_two}{second_text}"]


def _get_supabase_client() -> Optional[Client]:
    """Create and memoize a Supabase client using environment configuration."""
    global _SUPABASE_CLIENT

    if _SUPABASE_CLIENT is not None:
        return _SUPABASE_CLIENT

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )

    if not supabase_url or not supabase_key:
        LOGGER.warning("Supabase env vars missing; unrecognized numbers map to gc-demo")
        return None

    try:
        _SUPABASE_CLIENT = create_client(supabase_url, supabase_key)
    except Exception:
        LOGGER.exception("Failed to initialize Supabase client")
        _SUPABASE_CLIENT = None

    return _SUPABASE_CLIENT


async def send_whatsapp_message(
    to_number: str,
    body: str,
    *,
    status_callback_url: str = "",
) -> str:
    """Send a WhatsApp message and return the Twilio SID string."""
    client = _get_twilio_client()

    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    if not from_number:
        raise RuntimeError("TWILIO_WHATSAPP_FROM is required")
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"

    destination = _normalize_whatsapp_number(to_number)
    message_parts = _split_for_twilio(body, max_chars=1600)
    callback_url = _get_status_callback_url(status_callback_url)
    sids: list[str] = []

    for part in message_parts:
        sid = await asyncio.to_thread(
            _send_single_whatsapp_message,
            client,
            from_number,
            destination,
            part,
            status_callback_url=callback_url,
        )
        sids.append(sid)

    return ",".join(sids)


async def send_sms_message(
    to_number: str,
    body: str,
    *,
    status_callback_url: str = "",
) -> str:
    """Send an SMS message and return the Twilio SID string."""
    client = _get_twilio_client()

    from_number = os.getenv("TWILIO_SMS_FROM", "").strip()
    if not from_number:
        fallback = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
        if fallback.startswith("whatsapp:"):
            fallback = fallback.replace("whatsapp:", "", 1).strip()
        from_number = fallback
    if not from_number:
        raise RuntimeError("TWILIO_SMS_FROM (or TWILIO_WHATSAPP_FROM) is required")

    destination = _normalize_sms_number(to_number)
    message_parts = _split_for_twilio(body, max_chars=1600)
    callback_url = _get_status_callback_url(status_callback_url)
    sids: list[str] = []

    for part in message_parts:
        sid = await asyncio.to_thread(
            _send_single_whatsapp_message,
            client,
            from_number,
            destination,
            part,
            status_callback_url=callback_url,
        )
        sids.append(sid)

    return ",".join(sids)


async def _lookup_gc_id_by_phone(phone_number: str) -> tuple[str, bool]:
    """Resolve gc_id by Twilio sender phone number via Supabase gc_users table."""
    if not phone_number:
        return "gc-demo", False

    client = _get_supabase_client()
    if client is None:
        return "gc-demo", False

    def _query_gc_user() -> list[dict[str, Any]]:
        result = (
            client.table("gc_users")
            .select("id")
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
        return list(result.data or [])

    try:
        rows = await asyncio.to_thread(_query_gc_user)
    except Exception:
        LOGGER.exception("Failed gc_users lookup for phone=%s", phone_number)
        return "gc-demo", False

    if not rows:
        return "gc-demo", False

    gc_id = str(rows[0].get("id", "")).strip()
    if not gc_id:
        return "gc-demo", False

    return gc_id, True


def _validate_twilio_request(
    request: Request,
    *,
    form_payload: dict[str, str] | None = None,
    raw_body: bytes | None = None,
) -> bool:
    """Validate Twilio requests for either form or raw JSON bodies."""
    if RequestValidator is None:
        LOGGER.error("Twilio SDK is not installed; cannot validate webhook signature")
        return False

    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    signature = request.headers.get("X-Twilio-Signature", "")

    if not auth_token:
        LOGGER.error("TWILIO_AUTH_TOKEN is not configured")
        return False

    if not signature:
        LOGGER.warning("Missing X-Twilio-Signature header")
        return False

    validator = RequestValidator(auth_token)
    if raw_body is not None:
        validate_body = getattr(validator, "validate_body", None)
        if callable(validate_body):
            try:
                return bool(validate_body(str(request.url), raw_body.decode("utf-8"), signature))
            except TypeError:
                return bool(validate_body(str(request.url), raw_body, signature))
        LOGGER.error("Twilio SDK does not support raw-body signature validation")
        return False

    normalized_payload = {key: str(value) for key, value in (form_payload or {}).items()}
    return validator.validate(str(request.url), normalized_payload, signature)


async def _read_provider_payload(
    request: Request,
) -> tuple[dict[str, Any], dict[str, str] | None, bytes | None]:
    """Parse webhook bodies as JSON or form payloads."""
    content_type = request.headers.get("content-type", "").lower()
    raw_body = await request.body()

    if "application/json" in content_type:
        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError("invalid JSON webhook payload") from exc
        if not isinstance(payload, dict):
            raise ValueError("JSON webhook payload must be an object")
        return payload, None, raw_body

    try:
        form = await request.form()
    except Exception as exc:
        raise ValueError("invalid form webhook payload") from exc

    payload = {key: str(value) for key, value in form.multi_items()}
    return payload, payload, None


async def _process_normalized_input(*args: Any, **kwargs: Any) -> dict[str, Any]:
    """Lazily import normalized ingest dispatch so webhooks reuse the same runtime path."""
    ingest_module = import_module("gc_agent.routers.ingest")
    return await ingest_module.process_normalized_input(*args, **kwargs)


async def _resolve_transcript_gc_id(
    payload: dict[str, Any],
    *,
    from_number: str,
    to_number: str,
    explicit_gc_id: str = "",
) -> tuple[str, str]:
    """Resolve the owning GC for transcript webhooks."""
    if explicit_gc_id.strip():
        return explicit_gc_id.strip(), "explicit_gc_id"

    payload_gc_id = str(payload.get("gc_id", "") or payload.get("GcId", "")).strip()
    if payload_gc_id:
        return payload_gc_id, "payload_gc_id"

    lookup_candidates = [
        ("from_number", _normalize_lookup_number(from_number)),
        ("to_number", _normalize_lookup_number(to_number)),
    ]
    for match_source, candidate in lookup_candidates:
        if not candidate:
            continue
        gc_id, recognized = await _lookup_gc_id_by_phone(candidate)
        if recognized and gc_id.strip():
            return gc_id.strip(), match_source
    return "", ""


def _compose_reply(state: AgentState) -> str:
    """Generate webhook reply text from graph execution outputs."""
    if state.errors:
        first_error = _truncate(state.errors[0], 140)
        return f"Something went wrong - I'll retry. {first_error}"

    draft_count = len(state.drafts_created)
    if draft_count > 0:
        message = f"Got it. {draft_count} draft(s) ready in your queue."
    else:
        understanding = "Update captured."
        if state.parsed_intent and state.parsed_intent.understanding:
            understanding = _truncate(state.parsed_intent.understanding, 140)
        message = f"Updated. {understanding}"

    if state.risk_flags:
        first_risk = _truncate(state.risk_flags[0], 120)
        message = f"{message} Heads up: {first_risk}"

    return message


def _normalize_callback_status(raw_status: str) -> str:
    """Map Twilio callback status values into stable sent/pending/failed states."""
    normalized = raw_status.strip().lower()
    if normalized in {"sent", "delivered", "read"}:
        return "sent"
    if normalized in {"failed", "undelivered", "canceled"}:
        return "failed"
    if normalized in {"accepted", "queued", "scheduled"}:
        return "pending"
    return normalized or "pending"


def _voice_completion_message(result: dict[str, Any]) -> str:
    """Return the spoken handoff confirmation after a live call is routed."""
    draft_count = len(result.get("created_draft_ids", []) or [])
    linked_quote_id = str(result.get("linked_quote_id", "")).strip()
    if draft_count > 0:
        return f"I routed this for review and created {draft_count} draft action{'s' if draft_count != 1 else ''} in your queue."
    if linked_quote_id:
        return "I routed this for review and linked it to the active quote."
    return "I routed this for office review and preserved the call details."


def _get_voice_transfer_target() -> str:
    """Return the configured live-call transfer target when available."""
    return os.getenv("TWILIO_VOICE_FALLBACK_TO", "").strip()


def _voice_streaming_enabled() -> bool:
    """Return whether the streaming voice runtime is enabled."""
    raw = os.getenv("TWILIO_VOICE_STREAMING_ENABLED", "1").strip().lower()
    return raw not in {"0", "false", "off", "no"}


def _get_voice_stream_base_url(request: Request | None = None) -> str:
    """Return the public WebSocket base URL for Twilio media streams."""
    explicit = os.getenv("TWILIO_VOICE_STREAM_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")

    if request is None:
        return ""

    scheme = "wss" if request.url.scheme == "https" else "ws"
    host = request.url.netloc.strip()
    if not host or host.startswith("localhost") or host.startswith("127.0.0.1") or host.startswith("testserver"):
        return ""
    return f"{scheme}://{host}"


def _build_voice_stream_url(request: Request, session_id: str) -> str:
    """Build the full WebSocket URL for one media stream session."""
    base = _get_voice_stream_base_url(request)
    if not base:
        return ""
    return f"{base}/webhook/twilio/voice/stream/{escape(session_id.strip())}"


async def _update_live_call_twiml(call_sid: str, twiml: str) -> None:
    """Push new TwiML into an active Twilio call."""
    call_value = call_sid.strip()
    if not call_value:
        raise RuntimeError("CallSid is required for live call updates")

    client = _get_twilio_client()

    def _update() -> None:
        client.calls(call_value).update(twiml=twiml)

    await asyncio.to_thread(_update)


async def _send_stream_event(websocket: WebSocket, payload: dict[str, Any], *, send_lock: asyncio.Lock | None = None) -> None:
    """Send one JSON payload back to Twilio over the active media stream."""
    encoded = json.dumps(payload)
    if send_lock is None:
        await websocket.send_text(encoded)
        return

    async with send_lock:
        await websocket.send_text(encoded)


async def _send_stream_clear(websocket: WebSocket, stream_sid: str, *, send_lock: asyncio.Lock | None = None) -> None:
    """Clear any buffered outbound audio still queued inside Twilio."""
    if not stream_sid.strip():
        return
    await _send_stream_event(
        websocket,
        {"event": "clear", "streamSid": stream_sid},
        send_lock=send_lock,
    )


async def _send_stream_media(websocket: WebSocket, stream_sid: str, payload: bytes, *, send_lock: asyncio.Lock | None = None) -> None:
    """Send one raw mu-law audio chunk back to Twilio over the media stream."""
    if not stream_sid.strip() or not payload:
        return
    await _send_stream_event(
        websocket,
        {
            "event": "media",
            "streamSid": stream_sid,
            "media": {"payload": base64.b64encode(payload).decode("ascii")},
        },
        send_lock=send_lock,
    )


async def _send_stream_mark(websocket: WebSocket, stream_sid: str, name: str, *, send_lock: asyncio.Lock | None = None) -> None:
    """Send a Twilio stream mark so we know when buffered playback finishes."""
    if not stream_sid.strip() or not name.strip():
        return
    await _send_stream_event(
        websocket,
        {
            "event": "mark",
            "streamSid": stream_sid,
            "mark": {"name": name.strip()},
        },
        send_lock=send_lock,
    )


def _twiml_voice_transfer(message_text: str, *, transfer_to: str) -> str:
    """Build a voice response that transfers the caller to a human fallback number."""
    prompt = escape(message_text.strip() or "Connecting you to the office now.")
    destination = escape(transfer_to.strip())
    return f"<Response><Say>{prompt}</Say><Dial>{destination}</Dial></Response>"


def _voice_goal_to_transcript_classification(goal: str) -> str:
    """Map live-call planner goals into the transcript classification enum."""
    mapping = {
        "quote_request": "estimate_request",
        "issue_report": "complaint_or_issue",
        "follow_up": "followup_response",
        "job_update": "job_update",
        "general": "unknown",
    }
    return mapping.get(goal.strip(), "unknown")


def _audio_chunk_has_speech_signature(payload: bytes) -> bool:
    """Best-effort heuristic for whether an inbound mu-law chunk contains speech-like energy."""
    if len(payload) < 80:
        return False

    counts = Counter(payload)
    dominant_ratio = max(counts.values()) / len(payload)
    silence_ratio = sum(counts.get(value, 0) for value in (0xFF, 0x7F)) / len(payload)
    varied_ratio = len(counts) / min(len(payload), 32)

    return silence_ratio < 0.82 and dominant_ratio < 0.78 and varied_ratio > 0.10


def _trim_history_rows(value: list[dict[str, str]], *, limit: int = 8) -> list[dict[str, str]]:
    """Keep only the newest bounded number of debug-history rows."""
    if limit <= 0:
        return []
    return value[-limit:]


def _append_prompt_history(session, prompt_text: str, *, phase: str) -> object:
    """Persist one agent prompt into the session metadata for operator debugging."""
    prompt_value = prompt_text.strip()
    if not prompt_value:
        return session

    metadata = dict(session.metadata)
    history = list(metadata.get("prompt_history") or [])
    history.append(
        {
            "text": prompt_value,
            "phase": phase.strip() or "runtime",
            "at": session.updated_at.isoformat(),
        }
    )
    metadata["prompt_history"] = _trim_history_rows(
        [row for row in history if isinstance(row, dict)],
        limit=10,
    )
    return update_voice_session(session.id, {"metadata": metadata})


def _append_interruption_history(
    session,
    *,
    reason: str,
    prompt_text: str,
    excerpt: str = "",
) -> object:
    """Persist one interruption event into session metadata for operator debugging."""
    metadata = dict(session.metadata)
    history = list(metadata.get("interruption_history") or [])
    history.append(
        {
            "reason": reason.strip() or "caller_barge_in",
            "prompt": prompt_text.strip(),
            "excerpt": excerpt.strip(),
            "at": session.updated_at.isoformat(),
        }
    )
    metadata["interruption_history"] = _trim_history_rows(
        [row for row in history if isinstance(row, dict)],
        limit=8,
    )
    return update_voice_session(session.id, {"metadata": metadata})


def _should_interrupt_for_transcript(transcript: str) -> bool:
    """Use transcript content, not only raw audio shape, to decide whether barge-in is real."""
    cleaned = transcript.strip()
    if not cleaned:
        return False

    min_chars = max(int(os.getenv("TWILIO_VOICE_BARGE_IN_MIN_CHARS", "5") or 5), 1)
    min_words = max(int(os.getenv("TWILIO_VOICE_BARGE_IN_MIN_WORDS", "2") or 2), 1)
    if len(cleaned) < min_chars:
        return False
    words = [word for word in cleaned.replace("-", " ").split() if word.strip()]
    return len(words) >= min_words


async def _persist_voice_session(session) -> None:
    """Best-effort persistence for one live voice session snapshot."""
    try:
        await queries.upsert_voice_call_session(session)
    except Exception:
        LOGGER.exception("Failed persisting voice session id=%s gc_id=%s", session.id, session.gc_id)


async def _load_persisted_voice_session(session_id: str):
    """Return a persisted voice session snapshot when memory is cold."""
    try:
        record = await queries.get_voice_call_session(session_id)
    except Exception:
        LOGGER.exception("Failed loading persisted voice session id=%s", session_id)
        return None
    if record is None:
        return None
    return remember_voice_session(record)


async def _persist_voice_recording(session, audio_bytes: bytes) -> object:
    """Upload one captured live-call recording and attach it to the session."""
    if not audio_bytes:
        return session

    try:
        wav_bytes = mulaw_bytes_to_wav(audio_bytes)
        stored = await asyncio.to_thread(
            upload_call_recording_file,
            contractor_id=session.gc_id,
            session_id=session.id,
            filename=f"{session.call_id or session.id}.wav",
            content_type="audio/wav",
            payload=wav_bytes,
        )
    except Exception:
        LOGGER.exception("Failed persisting voice recording for session id=%s", session.id)
        return session

    recording_url = f"/api/v1/voice/sessions/{session.id}/recording"
    updated = update_voice_session(
        session.id,
        {
            "recording_url": recording_url,
            "recording_storage_ref": str(stored.get("storage_ref", "")).strip(),
            "recording_content_type": str(stored.get("content_type", "")).strip() or "audio/wav",
            "recording_duration_seconds": round(len(audio_bytes) / 8000, 2),
        },
    )
    await _persist_voice_session(updated)

    if updated.transcript_id:
        try:
            await queries.update_call_transcript(
                updated.transcript_id,
                updated.gc_id,
                recording_url=recording_url,
                metadata={
                    **updated.metadata,
                    "recording_storage_ref": updated.recording_storage_ref,
                },
            )
        except Exception:
            LOGGER.exception("Failed attaching recording URL to transcript id=%s", updated.transcript_id)

    return updated


async def _handoff_live_voice_session(session, plan) -> tuple[object, str, str, bool]:
    """Route a completed live voice session into review and return the spoken result."""
    transcript_id = await _ensure_live_call_review_record(session, plan)
    session = update_voice_session(session.id, {"transcript_id": transcript_id})
    await _persist_voice_session(session)

    transfer_target = _get_voice_transfer_target()
    normalized_input = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text=build_voice_transcript(session),
        external_id=session.call_id or session.id,
        from_number=session.from_number,
        gc_id=session.gc_id,
        call_id=session.call_id or session.id,
        provider=session.provider or "twilio-live",
        caller_name=session.caller_name or plan.extracted_fields.get("caller_name", ""),
        received_at=session.updated_at,
        started_at=session.created_at,
        recording_url=session.recording_url,
        metadata={
            **session.metadata,
            "voice_goal": plan.goal,
            "voice_summary": plan.summary,
            "voice_extracted_fields": dict(plan.extracted_fields),
            "voice_missing_slots": [slot.name for slot in plan.missing_slots],
            "voice_session_status": plan.status,
            "webhook_provider": "twilio",
            "runtime_mode": session.runtime_mode,
            "transfer_state": session.transfer_state,
        },
    )

    try:
        result = await _process_normalized_input(
            normalized_input,
            session.gc_id,
            trace_id=session.call_id or session.id,
        )
    except Exception:
        LOGGER.exception("Failed handing off live voice session call_sid=%s gc_id=%s", session.call_id, session.gc_id)
        await queries.update_call_transcript(
            transcript_id,
            session.gc_id,
            recording_url=session.recording_url or None,
            metadata={
                **session.metadata,
                "review_state": "pending",
                "voice_live_call": True,
                "voice_goal": plan.goal,
                "voice_session_status": "failed",
                "processing_error": "live_voice_handoff_failed",
                "recording_storage_ref": session.recording_storage_ref,
            },
        )
        failure_result = {"error": "handoff_failed", "transcript_id": transcript_id}
        session = mark_voice_handoff(session.id, trace_id=session.call_id or session.id, handoff_result=failure_result, status="failed")
        session = update_voice_session(
            session.id,
            {
                "transfer_state": "saved_for_review",
                "stream_state": "closed",
            },
        )
        await _persist_voice_session(session)
        return session, "I captured the call and saved it for office review.", transfer_target, True

    session = mark_voice_handoff(
        session.id,
        trace_id=str(result.get("trace_id", session.call_id or session.id)),
        handoff_result=result,
        status="completed" if plan.ready_for_review else "escalated",
    )
    linked_job_id = str(result.get("active_job_id", "")).strip()
    linked_quote_id = str(result.get("linked_quote_id", "")).strip()
    session = update_voice_session(
        session.id,
        {
            "transfer_target": transfer_target if plan.escalate_to_human and transfer_target else session.transfer_target,
            "transfer_state": "transferred" if plan.escalate_to_human and transfer_target else session.transfer_state,
            "stream_state": "closed",
            "metadata": {
                **session.metadata,
                "linked_job_id": linked_job_id,
                "linked_quote_id": linked_quote_id,
            },
        },
    )
    await _persist_voice_session(session)
    completion = _voice_completion_message(result)
    session = append_voice_turn(session.id, speaker="agent", text=completion)
    session = _append_prompt_history(session, completion, phase="completion")
    await _persist_voice_session(session)
    return session, completion, transfer_target, False


async def request_voice_session_transfer(
    session_id: str,
    *,
    target_number: str = "",
    note: str = "",
    initiated_by: str = "operator",
) -> object:
    """Request a human transfer for one active or completed voice session."""
    session = get_voice_session(session_id)
    if session is None:
        session = await _load_persisted_voice_session(session_id)
    if session is None:
        raise ValueError("voice session not found")

    transfer_target = target_number.strip() or _get_voice_transfer_target()
    if not transfer_target:
        raise ValueError("No transfer target configured")

    session = update_voice_session(
        session.id,
        {
            "transfer_target": transfer_target,
            "transfer_state": "requested",
            "status": "escalated" if session.status not in {"completed", "failed"} else session.status,
            "metadata": {
                **session.metadata,
                "transfer_note": note.strip(),
                "transfer_initiated_by": initiated_by.strip() or "operator",
            },
        },
    )
    await _persist_voice_session(session)

    if session.call_id.strip() and session.status in {"active", "awaiting_caller", "streaming", "escalated"}:
        try:
            await _update_live_call_twiml(
                session.call_id,
                _twiml_voice_transfer("Connecting you to the office now.", transfer_to=transfer_target),
            )
            session = update_voice_session(
                session.id,
                {
                    "transfer_state": "transferred",
                    "status": "escalated",
                    "stream_state": "closed",
                },
            )
            await _persist_voice_session(session)
        except Exception:
            LOGGER.exception("Failed live transfer update for session id=%s", session.id)
            session = update_voice_session(session.id, {"transfer_state": "failed"})
            await _persist_voice_session(session)
            raise
    else:
        session = update_voice_session(session.id, {"transfer_state": "saved_for_review"})
        await _persist_voice_session(session)

    return session


async def _ensure_live_call_review_record(session, plan) -> str:
    """Guarantee that a completed live call leaves behind a transcript review record."""
    transcript_text = build_voice_transcript(session)
    existing_record = await queries.find_existing_call_transcript_for_ingest(
        session.gc_id,
        source="call_transcript",
        call_id=session.call_id,
        trace_id=session.call_id or session.id,
    )

    metadata = {
        **session.metadata,
        "review_state": "pending",
        "match_source": str(session.metadata.get("gc_resolution", "")).strip() or "voice_live_call",
        "voice_live_call": True,
        "voice_goal": plan.goal,
        "voice_summary": plan.summary,
        "voice_extracted_fields": dict(plan.extracted_fields),
        "voice_missing_slots": [slot.name for slot in plan.missing_slots],
        "voice_session_status": plan.status,
        "runtime_mode": session.runtime_mode,
        "transfer_state": session.transfer_state,
        "recording_storage_ref": session.recording_storage_ref,
    }

    if existing_record is not None:
        transcript_id = str(existing_record.get("id", "")).strip()
        await queries.update_call_transcript(
            transcript_id,
            session.gc_id,
            provider=session.provider or "twilio-live",
            caller_phone=session.from_number,
            caller_name=session.caller_name or str(plan.extracted_fields.get("caller_name", "")).strip(),
            started_at=session.created_at.isoformat(),
            transcript_text=transcript_text,
            duration_seconds=existing_record.get("duration_seconds"),
            recording_url=session.recording_url,
            trace_id=session.call_id or session.id,
            summary=plan.summary,
            classification=_voice_goal_to_transcript_classification(plan.goal),
            extracted_json={
                "voice_goal": plan.goal,
                "voice_summary": plan.summary,
                "voice_extracted_fields": dict(plan.extracted_fields),
                "missing_information": [slot.reason for slot in plan.missing_slots],
                "trade": plan.detected_trade or session.extracted_fields.get("trade", ""),
            },
            risk_flags=["Caller requested human review"] if plan.escalate_to_human else [],
            recommended_actions=["Review live call capture and approve next step"],
            metadata=metadata,
        )
        return transcript_id

    return await queries.insert_call_transcript(
        gc_id=session.gc_id,
        source="call_transcript",
        transcript_text=transcript_text,
        call_id=session.call_id or session.id,
        provider=session.provider or "twilio-live",
        caller_phone=session.from_number,
        caller_name=session.caller_name or str(plan.extracted_fields.get("caller_name", "")).strip(),
        started_at=session.created_at.isoformat(),
        recording_url=session.recording_url,
        summary=plan.summary,
        classification=_voice_goal_to_transcript_classification(plan.goal),
        extracted_json={
            "voice_goal": plan.goal,
            "voice_summary": plan.summary,
            "voice_extracted_fields": dict(plan.extracted_fields),
            "missing_information": [slot.reason for slot in plan.missing_slots],
            "trade": plan.detected_trade or session.extracted_fields.get("trade", ""),
        },
        risk_flags=["Caller requested human review"] if plan.escalate_to_human else [],
        recommended_actions=["Review live call capture and approve next step"],
        trace_id=session.call_id or session.id,
        metadata=metadata,
    )


@router.post("/whatsapp")
async def whatsapp_webhook(request: Request) -> Response:
    """Handle inbound Twilio WhatsApp messages and run the update graph."""
    try:
        form = await request.form()
        payload = {key: str(value) for key, value in form.multi_items()}
    except Exception:
        LOGGER.exception("Failed to parse Twilio webhook form payload")
        error_xml = _twiml_message("Something went wrong - I'll retry. Invalid payload.")
        return Response(content=error_xml, media_type="text/xml")

    if not _validate_twilio_request(request, form_payload=payload):
        LOGGER.warning("Rejected Twilio webhook due to invalid signature")
        forbidden_xml = _twiml_message("Forbidden")
        return Response(status_code=403, content=forbidden_xml, media_type="text/xml")

    body = payload.get("Body", "").strip()
    from_number = payload.get("From", "").strip()
    to_number = payload.get("To", "").strip()
    message_sid = payload.get("MessageSid", "").strip()
    media_url = payload.get("MediaUrl0", "").strip()
    media_content_type = payload.get("MediaContentType0", "").strip().lower()
    is_voice_note = bool(media_url) and media_content_type.startswith("audio/")

    input_type = "voice" if is_voice_note else "whatsapp"
    raw_input = media_url if is_voice_note else body

    LOGGER.info(
        "Inbound WhatsApp sid=%s from=%s to=%s input_type=%s chars=%s media_type=%s",
        message_sid,
        from_number,
        to_number,
        input_type,
        len(raw_input),
        media_content_type,
    )

    gc_id, recognized = await _lookup_gc_id_by_phone(from_number)
    if not recognized:
        LOGGER.info("Unregistered number %s; returning onboarding instructions", from_number)
        onboarding_text = build_unregistered_onboarding_message()
        onboarding_xml = _twiml_message(onboarding_text)
        return Response(content=onboarding_xml, media_type="text/xml")

    try:
        final_state = await graph.run_update(
            raw_input,
            gc_id,
            from_number,
            input_type,
            trace_id=message_sid,
        )
        reply_text = _compose_reply(final_state)
        response_xml = _twiml_message(reply_text)
        return Response(content=response_xml, media_type="text/xml")
    except Exception:
        LOGGER.exception("Graph execution failed sid=%s gc_id=%s", message_sid, gc_id)
        error_xml = _twiml_message("Something went wrong - I'll retry. Graph execution failed.")
        return Response(content=error_xml, media_type="text/xml")


@router.post("/twilio/voice", name="twilio_voice_start")
async def twilio_voice_start(request: Request) -> Response:
    """Answer an inbound Twilio voice call and begin live speech capture."""
    try:
        form = await request.form()
        payload = {key: str(value) for key, value in form.multi_items()}
    except Exception:
        LOGGER.exception("Failed to parse Twilio voice webhook form payload")
        return Response(content=_twiml_voice_message("I could not read this call payload.", hangup=True), media_type="text/xml")

    if not _validate_twilio_request(request, form_payload=payload):
        LOGGER.warning("Rejected Twilio voice webhook due to invalid signature")
        return Response(status_code=403, content=_twiml_voice_message("Forbidden", hangup=True), media_type="text/xml")

    call_sid = payload.get("CallSid", "").strip()
    from_number = payload.get("From", "").strip()
    to_number = payload.get("To", "").strip()
    caller_name = payload.get("CallerName", "").strip()
    explicit_gc_id = request.query_params.get("gc_id", "").strip()

    gc_id, gc_resolution = await _resolve_transcript_gc_id(
        payload,
        from_number=from_number,
        to_number=to_number,
        explicit_gc_id=explicit_gc_id,
    )
    if not gc_id:
        LOGGER.info("Twilio voice call could not be resolved to a GC workspace call_sid=%s", call_sid)
        transfer_target = _get_voice_transfer_target()
        if transfer_target:
            return Response(
                content=_twiml_voice_transfer(
                    "I could not match this number automatically. Connecting you to the office now.",
                    transfer_to=transfer_target,
                ),
                media_type="text/xml",
            )
        return Response(
            content=_twiml_voice_message(
                "I could not match this number to an Arbor workspace yet. Please call from the registered contractor number.",
                hangup=True,
            ),
            media_type="text/xml",
        )

    stream_url = _build_voice_stream_url(request, call_sid or from_number or to_number)
    use_streaming = _voice_streaming_enabled() and bool(stream_url) and bool(os.getenv("DEEPGRAM_API_KEY", "").strip())

    session = upsert_voice_session(
        call_sid or from_number or to_number,
        gc_id=gc_id,
        call_id=call_sid,
        from_number=from_number,
        to_number=to_number,
        provider="twilio-live",
        caller_name=caller_name,
        metadata={"gc_resolution": gc_resolution},
    )
    session = update_voice_session(
        session.id,
        {
            "runtime_mode": "stream" if use_streaming else "gather",
            "stream_state": "connecting" if use_streaming else "idle",
        },
    )

    prompt = session.last_prompt.strip() or "Arbor here. Tell me what changed on site or what needs to be quoted."
    session = append_voice_turn(session.id, speaker="agent", text=prompt)
    session = _append_prompt_history(session, prompt, phase="call_open")
    await _persist_voice_session(session)

    action_url = str(request.url_for("twilio_voice_turn"))
    fallback_url = str(request.url_for("twilio_voice_start"))
    if use_streaming:
        return Response(content=_twiml_voice_stream(prompt, stream_url=stream_url), media_type="text/xml")
    return Response(content=_twiml_voice_gather(prompt, action_url=action_url, fallback_url=fallback_url), media_type="text/xml")


@router.post("/twilio/voice/turn", name="twilio_voice_turn")
async def twilio_voice_turn(request: Request) -> Response:
    """Handle one live speech turn from Twilio Voice and continue the call."""
    try:
        form = await request.form()
        payload = {key: str(value) for key, value in form.multi_items()}
    except Exception:
        LOGGER.exception("Failed to parse Twilio voice turn payload")
        return Response(content=_twiml_voice_message("I could not read this turn.", hangup=True), media_type="text/xml")

    if not _validate_twilio_request(request, form_payload=payload):
        LOGGER.warning("Rejected Twilio voice turn due to invalid signature")
        return Response(status_code=403, content=_twiml_voice_message("Forbidden", hangup=True), media_type="text/xml")

    call_sid = payload.get("CallSid", "").strip()
    from_number = payload.get("From", "").strip()
    to_number = payload.get("To", "").strip()
    caller_name = payload.get("CallerName", "").strip()
    speech_result = payload.get("SpeechResult", "").strip()
    explicit_gc_id = request.query_params.get("gc_id", "").strip()
    confidence_raw = payload.get("Confidence", "").strip()

    session = get_voice_session(call_sid)
    if session is None:
        session = await _load_persisted_voice_session(call_sid)
    if session is None:
        gc_id, gc_resolution = await _resolve_transcript_gc_id(
            payload,
            from_number=from_number,
            to_number=to_number,
            explicit_gc_id=explicit_gc_id,
        )
        if not gc_id:
            transfer_target = _get_voice_transfer_target()
            if transfer_target:
                return Response(
                    content=_twiml_voice_transfer(
                        "I could not recover the call context automatically. Connecting you to the office now.",
                        transfer_to=transfer_target,
                    ),
                    media_type="text/xml",
                )
            return Response(
                content=_twiml_voice_message(
                    "I could not match this number to an Arbor workspace yet. Please call from the registered contractor number.",
                    hangup=True,
                ),
                media_type="text/xml",
            )
        session = upsert_voice_session(
            call_sid or from_number or to_number,
            gc_id=gc_id,
            call_id=call_sid,
            from_number=from_number,
            to_number=to_number,
            provider="twilio-live",
            caller_name=caller_name,
            metadata={"gc_resolution": gc_resolution},
        )

    if session.status in {"completed", "failed"}:
        return Response(
            content=_twiml_voice_message("This call has already been routed for review.", hangup=True),
            media_type="text/xml",
        )

    if not speech_result:
        session = increment_voice_silence(session.id)
        await _persist_voice_session(session)
        has_caller_turns = any(turn.speaker == "caller" for turn in session.turns)
        if session.silence_count >= 2 and not has_caller_turns:
            transfer_target = _get_voice_transfer_target()
            if transfer_target:
                session = update_voice_session(
                    session.id,
                    {
                        "status": "escalated",
                        "escalation_reason": "repeated_silence",
                        "transfer_target": transfer_target,
                        "transfer_state": "transferred",
                        "stream_state": "closed",
                    },
                )
                await _persist_voice_session(session)
                return Response(
                    content=_twiml_voice_transfer(
                        "I still did not catch anything on the call. Connecting you to the office now.",
                        transfer_to=transfer_target,
                    ),
                    media_type="text/xml",
                )
            return Response(
                content=_twiml_voice_message(
                    "I still did not catch anything on the call. Please try again or send a text update instead.",
                    hangup=True,
                ),
                media_type="text/xml",
            )

        prompt = "I did not catch that. Tell me the job or site and what changed."
        session = append_voice_turn(session.id, speaker="agent", text=prompt)
        session = _append_prompt_history(session, prompt, phase="reprompt")
        await _persist_voice_session(session)
        return Response(
            content=_twiml_voice_gather(
                prompt,
                action_url=str(request.url_for("twilio_voice_turn")),
                fallback_url=str(request.url_for("twilio_voice_start")),
            ),
            media_type="text/xml",
        )

    try:
        confidence = float(confidence_raw) if confidence_raw else None
    except ValueError:
        confidence = None

    session = append_voice_turn(session.id, speaker="caller", text=speech_result, confidence=confidence)
    plan = plan_voice_session(session)
    session = apply_voice_plan(session.id, plan)
    if plan.escalate_to_human:
        session = update_voice_session(
            session.id,
            {
                "escalation_reason": "caller_requested_human_or_low_confidence",
                "transfer_state": "requested" if _get_voice_transfer_target() else session.transfer_state,
            },
        )
    await _persist_voice_session(session)

    if plan.ready_for_review or plan.escalate_to_human:
        session, completion, transfer_target, _handoff_failed = await _handoff_live_voice_session(session, plan)
        if plan.escalate_to_human and transfer_target:
            return Response(
                content=_twiml_voice_transfer(
                    f"{completion} Connecting you to the office now.",
                    transfer_to=transfer_target,
                ),
                media_type="text/xml",
            )
        return Response(content=_twiml_voice_message(completion, hangup=True), media_type="text/xml")

    prompt = plan.next_prompt.strip() or "Tell me what changed on site or what needs to happen next."
    session = append_voice_turn(session.id, speaker="agent", text=prompt)
    session = _append_prompt_history(session, prompt, phase="follow_up")
    await _persist_voice_session(session)
    return Response(
        content=_twiml_voice_gather(
            prompt,
            action_url=str(request.url_for("twilio_voice_turn")),
            fallback_url=str(request.url_for("twilio_voice_start")),
        ),
        media_type="text/xml",
    )


@router.websocket("/twilio/voice/stream/{session_id}")
async def twilio_voice_stream(websocket: WebSocket, session_id: str) -> None:
    """Handle one Twilio Media Streams session for true streaming voice capture."""
    await websocket.accept()

    session = get_voice_session(session_id)
    if session is None:
        session = await _load_persisted_voice_session(session_id)
    if session is None:
        await websocket.close(code=4404, reason="voice session not found")
        return

    stream_base = _get_voice_stream_base_url() or f"{'wss' if websocket.url.scheme == 'wss' else 'ws'}://{websocket.url.netloc}"
    stream_url = f"{stream_base}/webhook/twilio/voice/stream/{session.id}"
    audio_buffer = bytearray()
    bridge = DeepgramLiveBridge()
    tts_bridge = DeepgramTTSBridge()
    send_lock = asyncio.Lock()
    call_updated = False
    consumer_task: asyncio.Task[None] | None = None
    last_processed_transcript = ""
    playback_state: dict[str, Any] = {
        "token": "",
        "mark": "",
        "kind": "",
        "text": "",
        "final_action": None,
        "interrupted": False,
        "speech_chunks": 0,
    }

    session = update_voice_session(
        session.id,
        {
            "runtime_mode": "stream",
            "stream_state": "connecting",
            "status": "streaming",
        },
    )
    await _persist_voice_session(session)

    def _clear_playback_state() -> None:
        playback_state.update(
            {
                "token": "",
                "mark": "",
                "kind": "",
                "text": "",
                "final_action": None,
                "interrupted": False,
                "speech_chunks": 0,
            }
        )

    async def _interrupt_prompt_playback(*, reason: str, audio_excerpt: str = "") -> bool:
        nonlocal session
        if playback_state.get("kind") != "prompt" or not playback_state.get("token") or playback_state.get("interrupted"):
            return False

        playback_state["interrupted"] = True
        try:
            await _send_stream_clear(websocket, session.stream_sid, send_lock=send_lock)
        except Exception:
            LOGGER.exception("Failed clearing Twilio playback during barge-in for session id=%s", session.id)

        metadata = dict(session.metadata)
        interruption_count = int(metadata.get("interruption_count", 0) or 0) + 1
        metadata.update(
            {
                "interruption_count": interruption_count,
                "last_interruption_reason": reason,
                "last_interrupted_prompt": str(playback_state.get("text", "")).strip(),
            }
        )
        if audio_excerpt.strip():
            metadata["last_interruption_excerpt"] = audio_excerpt.strip()
        session = update_voice_session(session.id, {"metadata": metadata})
        session = _append_interruption_history(
            session,
            reason=reason,
            prompt_text=str(playback_state.get("text", "")).strip(),
            excerpt=audio_excerpt,
        )
        await _persist_voice_session(session)
        return True

    async def _play_tts_prompt(
        spoken_text: str,
        *,
        final_action: dict[str, str] | None = None,
        clear_existing: bool = False,
    ) -> str:
        prompt_text = spoken_text.strip()
        stream_sid = session.stream_sid.strip()
        if not prompt_text or not stream_sid:
            return "failed"

        if clear_existing and playback_state.get("token"):
            try:
                await _send_stream_clear(websocket, stream_sid, send_lock=send_lock)
            except Exception:
                LOGGER.exception("Failed clearing pending Twilio audio for session id=%s", session.id)
            _clear_playback_state()

        playback_token = uuid4().hex
        playback_state.update(
            {
                "token": playback_token,
                "kind": "completion" if final_action is not None else "prompt",
                "text": prompt_text,
                "final_action": final_action,
                "interrupted": False,
                "speech_chunks": 0,
                "mark": "",
            }
        )

        chunk_sent = False
        try:
            async for chunk in tts_bridge.iter_audio(prompt_text):
                if playback_state.get("token") != playback_token or playback_state.get("interrupted"):
                    _clear_playback_state()
                    return "interrupted"
                if not chunk:
                    continue
                chunk_sent = True
                await _send_stream_media(websocket, stream_sid, chunk, send_lock=send_lock)
        except Exception:
            LOGGER.exception("Streaming TTS failed for session id=%s", session.id)
            _clear_playback_state()
            return "failed"

        if not chunk_sent:
            _clear_playback_state()
            return "failed"

        if playback_state.get("token") != playback_token or playback_state.get("interrupted"):
            _clear_playback_state()
            return "interrupted"

        mark_name = f"voice-{uuid4().hex[:10]}"
        playback_state["mark"] = mark_name
        await _send_stream_mark(websocket, stream_sid, mark_name, send_lock=send_lock)
        return "played"

    async def _consume_transcripts() -> None:
        nonlocal session, call_updated, last_processed_transcript
        async for transcript_event in bridge.iter_events():
            if call_updated:
                continue
            cleaned = transcript_event.transcript.strip()
            if not cleaned:
                continue

            metadata = dict(session.metadata)
            metadata["last_partial_transcript"] = cleaned
            metadata["vad_turn_state"] = "speech_final" if transcript_event.speech_final else ("final" if transcript_event.is_final else "interim")
            session = update_voice_session(session.id, {"metadata": metadata})
            await _persist_voice_session(session)

            if (
                playback_state.get("kind") == "prompt"
                and playback_state.get("token")
                and _should_interrupt_for_transcript(cleaned)
            ):
                await _interrupt_prompt_playback(
                    reason="caller_barge_in_transcript",
                    audio_excerpt=cleaned,
                )

            if not transcript_event.is_final and not transcript_event.speech_final:
                continue
            if cleaned == last_processed_transcript:
                continue
            last_processed_transcript = cleaned

            previous_prompt = session.last_prompt.strip()
            session = append_voice_turn(
                session.id,
                speaker="caller",
                text=cleaned,
                confidence=transcript_event.confidence,
            )
            plan = plan_voice_session(session)
            session = apply_voice_plan(session.id, plan)
            await _persist_voice_session(session)

            if plan.ready_for_review or plan.escalate_to_human:
                session, completion, transfer_target, _ = await _handoff_live_voice_session(session, plan)
                spoken_completion = (
                    f"{completion} Connecting you to the office now."
                    if plan.escalate_to_human and transfer_target
                    else completion
                )
                final_action = (
                    {"kind": "transfer", "target": transfer_target}
                    if plan.escalate_to_human and transfer_target
                    else {"kind": "hangup"}
                )
                if await _play_tts_prompt(spoken_completion, final_action=final_action, clear_existing=True) == "played":
                    call_updated = True
                    break

                if plan.escalate_to_human and transfer_target:
                    session = update_voice_session(
                        session.id,
                        {
                            "transfer_state": "transferred",
                            "transfer_target": transfer_target,
                            "stream_state": "closed",
                        },
                    )
                    await _persist_voice_session(session)
                    await _update_live_call_twiml(
                        session.call_id,
                        _twiml_voice_transfer(
                            spoken_completion,
                            transfer_to=transfer_target,
                        ),
                    )
                else:
                    await _update_live_call_twiml(session.call_id, _twiml_voice_message(completion, hangup=True))
                call_updated = True
                break

            prompt = plan.next_prompt.strip()
            if prompt and prompt != previous_prompt and session.call_id.strip():
                session = append_voice_turn(session.id, speaker="agent", text=prompt)
                session = _append_prompt_history(session, prompt, phase="stream_follow_up")
                await _persist_voice_session(session)
                playback_result = await _play_tts_prompt(prompt, clear_existing=True)
                if playback_result in {"played", "interrupted"}:
                    continue
                await _update_live_call_twiml(
                    session.call_id,
                    _twiml_voice_stream(prompt, stream_url=stream_url),
                )
                call_updated = True
                break

    try:
        await bridge.connect()
        consumer_task = asyncio.create_task(_consume_transcripts())

        while True:
            message = await websocket.receive_text()
            payload = json.loads(message)
            event_type = str(payload.get("event", "")).strip().lower()

            if event_type == "connected":
                continue

            if event_type == "start":
                start_payload = payload.get("start") if isinstance(payload.get("start"), dict) else {}
                stream_sid = str(start_payload.get("streamSid", "")).strip()
                session = update_voice_session(
                    session.id,
                    {
                        "stream_sid": stream_sid,
                        "stream_state": "streaming",
                        "status": "streaming",
                    },
                )
                await _persist_voice_session(session)
                continue

            if event_type == "mark":
                mark_payload = payload.get("mark") if isinstance(payload.get("mark"), dict) else {}
                mark_name = str(mark_payload.get("name", "")).strip()
                if mark_name != str(playback_state.get("mark", "")).strip():
                    continue

                action = playback_state.get("final_action")
                _clear_playback_state()
                if not isinstance(action, dict) or not session.call_id.strip():
                    continue

                action_kind = action.get("kind", "").strip()
                if action_kind == "transfer":
                    transfer_target = action.get("target", "").strip()
                    if transfer_target:
                        session = update_voice_session(
                            session.id,
                            {
                                "transfer_state": "transferred",
                                "transfer_target": transfer_target,
                                "status": "escalated",
                                "stream_state": "closed",
                            },
                        )
                        await _persist_voice_session(session)
                        await _update_live_call_twiml(
                            session.call_id,
                            _twiml_transfer_only(transfer_to=transfer_target),
                        )
                        break
                elif action_kind == "hangup":
                    session = update_voice_session(session.id, {"stream_state": "closed"})
                    await _persist_voice_session(session)
                    await _update_live_call_twiml(session.call_id, _twiml_hangup())
                    break
                continue

            if event_type == "media":
                media_payload = payload.get("media") if isinstance(payload.get("media"), dict) else {}
                encoded = str(media_payload.get("payload", "")).strip()
                if not encoded:
                    continue
                try:
                    chunk = base64.b64decode(encoded)
                except Exception:
                    continue
                audio_buffer.extend(chunk)
                if playback_state.get("kind") == "prompt" and playback_state.get("token"):
                    if _audio_chunk_has_speech_signature(chunk):
                        playback_state["speech_chunks"] = int(playback_state.get("speech_chunks", 0) or 0) + 1
                        if playback_state["speech_chunks"] >= 2:
                            await _interrupt_prompt_playback(reason="caller_barge_in_audio")
                    else:
                        playback_state["speech_chunks"] = 0
                await bridge.send_audio(chunk)
                continue

            if event_type == "stop":
                break
    except WebSocketDisconnect:
        LOGGER.info("Twilio voice stream disconnected for session id=%s", session.id)
    except Exception:
        LOGGER.exception("Live voice stream failed for session id=%s", session.id)
        session = update_voice_session(session.id, {"stream_state": "failed", "status": "failed"})
        await _persist_voice_session(session)
    finally:
        try:
            await bridge.close()
        except Exception:
            LOGGER.exception("Failed closing Deepgram bridge for session id=%s", session.id)

        if consumer_task is not None:
            try:
                await consumer_task
            except Exception:
                LOGGER.exception("Failed waiting for transcript consumer on session id=%s", session.id)

        session = await _persist_voice_recording(session, bytes(audio_buffer))
        if session.stream_state not in {"closed", "failed"}:
            session = update_voice_session(session.id, {"stream_state": "closed"})
            await _persist_voice_session(session)

        if not call_updated:
            if session.last_caller_transcript.strip() and session.status not in {"completed", "failed"}:
                plan = plan_voice_session(session)
                session = apply_voice_plan(session.id, plan)
                await _persist_voice_session(session)

                if plan.ready_for_review or plan.escalate_to_human:
                    await _handoff_live_voice_session(session, plan)
                else:
                    transcript_id = await _ensure_live_call_review_record(session, plan)
                    session = update_voice_session(
                        session.id,
                        {
                            "transcript_id": transcript_id,
                            "status": "ready_for_review",
                            "transfer_state": "saved_for_review",
                        },
                    )
                    await _persist_voice_session(session)


@router.post("/whatsapp/status")
@router.post("/twilio/status")
async def whatsapp_status_callback(request: Request) -> JSONResponse:
    """Receive Twilio status callbacks for outbound WhatsApp messages."""
    try:
        form = await request.form()
        payload = {key: str(value) for key, value in form.multi_items()}
    except Exception:
        LOGGER.exception("Failed to parse Twilio status callback payload")
        return JSONResponse(content={"status": "error", "detail": "invalid payload"}, status_code=400)

    if not _validate_twilio_request(request, form_payload=payload):
        LOGGER.warning("Rejected Twilio status callback due to invalid signature")
        return JSONResponse(content={"status": "forbidden"}, status_code=403)

    message_sid = payload.get("MessageSid", "").strip()
    message_status = payload.get("MessageStatus", "").strip()
    error_code = payload.get("ErrorCode", "").strip()
    error_message = payload.get("ErrorMessage", "").strip()
    normalized_status = _normalize_callback_status(message_status)

    LOGGER.info(
        "Twilio status callback sid=%s status=%s normalized=%s",
        message_sid,
        message_status,
        normalized_status,
    )

    if not message_sid:
        return JSONResponse(content={"status": "ok", "updated": 0}, status_code=200)

    update_error = " ".join(part for part in [error_code, error_message] if part).strip()
    try:
        update_result = await queries.apply_twilio_delivery_status(
            provider_message_id=message_sid,
            delivery_status=normalized_status,
            error_message=update_error,
        )
    except DatabaseError:
        LOGGER.exception("Failed to persist Twilio callback sid=%s", message_sid)
        return JSONResponse(content={"status": "ok", "updated": 0}, status_code=200)

    return JSONResponse(
        content={
            "status": "ok",
            "updated": update_result.get("updated_rows", 0),
            "quote_rows": update_result.get("quote_rows", 0),
            "briefing_rows": update_result.get("briefing_rows", 0),
        },
        status_code=200,
    )


@router.post("/twilio/transcript")
async def twilio_transcript_webhook(request: Request) -> JSONResponse:
    """Normalize a Twilio transcript webhook into the shared transcript ingest path."""
    try:
        payload, form_payload, raw_body = await _read_provider_payload(request)
    except ValueError as exc:
        LOGGER.warning("Rejected Twilio transcript webhook due to invalid payload: %s", exc)
        return JSONResponse(content={"status": "error", "detail": str(exc), "trace_id": ""}, status_code=400)

    query_gc_id = request.query_params.get("gc_id", "").strip()
    if query_gc_id and "gc_id" not in payload and "GcId" not in payload:
        payload["gc_id"] = query_gc_id

    if not _validate_twilio_request(request, form_payload=form_payload, raw_body=raw_body):
        LOGGER.warning("Rejected Twilio transcript webhook due to invalid signature")
        return JSONResponse(content={"status": "forbidden", "trace_id": ""}, status_code=403)

    normalization = normalize_provider_transcript("twilio", payload)
    if normalization.inbound_input is None:
        LOGGER.info(
            "Ignoring Twilio transcript webhook reason=%s call_sid=%s",
            normalization.reason,
            str(payload.get("CallSid", "")).strip(),
        )
        return JSONResponse(
            content={
                "status": "ignored",
                "reason": normalization.reason,
                "trace_id": "",
            },
            status_code=202,
        )

    normalized_input = normalization.inbound_input
    transcript_trace_id = normalized_input.external_id.strip()
    to_number = str(normalized_input.metadata.get("to_number", "")).strip()
    gc_id, gc_resolution = await _resolve_transcript_gc_id(
        payload,
        from_number=normalized_input.from_number,
        to_number=to_number,
        explicit_gc_id=normalized_input.gc_id,
    )
    if not gc_id:
        LOGGER.info(
            "Ignoring Twilio transcript webhook because GC could not be resolved call_id=%s from=%s to=%s",
            normalized_input.call_id,
            normalized_input.from_number,
            to_number,
        )
        return JSONResponse(
            content={"status": "ignored", "reason": "gc_not_resolved", "trace_id": transcript_trace_id},
            status_code=202,
        )

    normalized_input = normalized_input.model_copy(
        update={
            "gc_id": gc_id,
            "metadata": {
                **normalized_input.metadata,
                "gc_resolution": gc_resolution,
                "webhook_provider": "twilio",
            },
        }
    )

    try:
        result = await _process_normalized_input(
            normalized_input,
            gc_id,
            trace_id=normalized_input.external_id,
        )
    except DatabaseError:
        LOGGER.exception("Twilio transcript webhook persistence failed gc_id=%s", gc_id)
        return JSONResponse(
            content={"status": "error", "detail": "processing failed", "trace_id": transcript_trace_id},
            status_code=200,
        )
    except ValueError as exc:
        LOGGER.warning(
            "Twilio transcript webhook ignored after normalization gc_id=%s detail=%s",
            gc_id,
            exc,
        )
        return JSONResponse(
            content={
                "status": "ignored",
                "reason": "invalid_transcript",
                "detail": str(exc),
                "trace_id": transcript_trace_id,
            },
            status_code=202,
        )
    except Exception:
        LOGGER.exception("Twilio transcript webhook processing failed gc_id=%s", gc_id)
        return JSONResponse(
            content={"status": "error", "detail": "processing failed", "trace_id": transcript_trace_id},
            status_code=200,
        )

    return JSONResponse(
        content={
            "status": "ok",
            "provider": "twilio",
            "trace_id": result.get("trace_id", ""),
            "transcript_id": result.get("transcript_id", ""),
            "classification": result.get("classification", ""),
            "active_job_id": result.get("active_job_id", ""),
            "linked_quote_id": result.get("linked_quote_id", ""),
            "created_draft_ids": result.get("created_draft_ids", []),
        },
        status_code=200,
    )


@router.get("/whatsapp/health")
async def whatsapp_health() -> dict[str, str]:
    """Health endpoint for Twilio webhook availability checks."""
    return {"status": "ok"}


__all__ = [
    "router",
    "whatsapp_webhook",
    "twilio_voice_start",
    "twilio_voice_turn",
    "whatsapp_status_callback",
    "twilio_transcript_webhook",
    "whatsapp_health",
    "send_whatsapp_message",
    "send_sms_message",
]

