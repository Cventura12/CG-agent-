"""Twilio webhook handlers for GC Agent."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from importlib import import_module
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Request
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
from gc_agent.state import AgentState
from gc_agent.webhooks.onboarding import build_unregistered_onboarding_message
from gc_agent.webhooks.transcript_normalization import normalize_provider_transcript

load_dotenv()

LOGGER = logging.getLogger(__name__)
router = APIRouter(tags=["twilio"])

_SUPABASE_CLIENT: Optional[Client] = None
_TWILIO_CLIENT: Optional[TwilioClient] = None


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
) -> str:
    """Send one WhatsApp message synchronously and return Twilio SID."""
    message = client.messages.create(
        from_=from_number,
        to=to_number,
        body=body,
    )
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


async def send_whatsapp_message(to_number: str, body: str) -> str:
    """Send a WhatsApp message and return the Twilio SID string."""
    client = _get_twilio_client()

    from_number = os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    if not from_number:
        raise RuntimeError("TWILIO_WHATSAPP_FROM is required")
    if not from_number.startswith("whatsapp:"):
        from_number = f"whatsapp:{from_number}"

    destination = _normalize_whatsapp_number(to_number)
    message_parts = _split_for_twilio(body, max_chars=1600)
    sids: list[str] = []

    for part in message_parts:
        sid = await asyncio.to_thread(
            _send_single_whatsapp_message,
            client,
            from_number,
            destination,
            part,
        )
        sids.append(sid)

    return ",".join(sids)


async def send_sms_message(to_number: str, body: str) -> str:
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
    sids: list[str] = []

    for part in message_parts:
        sid = await asyncio.to_thread(
            _send_single_whatsapp_message,
            client,
            from_number,
            destination,
            part,
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


@router.post("/whatsapp/status")
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
    "whatsapp_status_callback",
    "twilio_transcript_webhook",
    "whatsapp_health",
    "send_whatsapp_message",
    "send_sms_message",
]

