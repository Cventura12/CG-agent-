"""Twilio WhatsApp webhook handlers for GC Agent."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from supabase import Client, create_client
from twilio.rest import Client as TwilioClient
from twilio.request_validator import RequestValidator
from twilio.twiml.messaging_response import MessagingResponse

from gc_agent import graph
from gc_agent.state import AgentState
from gc_agent.webhooks.onboarding import build_unregistered_onboarding_message

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


def _get_twilio_client() -> TwilioClient:
    """Create and memoize Twilio REST client from environment variables."""
    global _TWILIO_CLIENT

    if _TWILIO_CLIENT is not None:
        return _TWILIO_CLIENT

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


def _validate_twilio_signature(request: Request, payload: dict[str, str]) -> bool:
    """Validate incoming Twilio signature against request URL and form payload."""
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    signature = request.headers.get("X-Twilio-Signature", "")

    if not auth_token:
        LOGGER.error("TWILIO_AUTH_TOKEN is not configured")
        return False

    if not signature:
        LOGGER.warning("Missing X-Twilio-Signature header")
        return False

    validator = RequestValidator(auth_token)
    return validator.validate(str(request.url), payload, signature)


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

    if not _validate_twilio_signature(request, payload):
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
    form = await request.form()
    payload = {key: str(value) for key, value in form.multi_items()}
    message_sid = payload.get("MessageSid", "").strip()
    message_status = payload.get("MessageStatus", "").strip()

    LOGGER.info(
        "Twilio status callback sid=%s status=%s",
        message_sid,
        message_status,
    )

    return JSONResponse(content={"status": "ok"}, status_code=200)


@router.get("/whatsapp/health")
async def whatsapp_health() -> dict[str, str]:
    """Health endpoint for Twilio webhook availability checks."""
    return {"status": "ok"}


__all__ = [
    "router",
    "whatsapp_webhook",
    "whatsapp_status_callback",
    "whatsapp_health",
    "send_whatsapp_message",
    
]
