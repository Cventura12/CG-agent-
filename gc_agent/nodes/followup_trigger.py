"""Create and process follow-up reminders for approved quotes."""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from importlib import import_module
from typing import Any, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent.api.quote_pdf import render_quote_pdf
from gc_agent.db import queries
from gc_agent import prompts
from gc_agent.state import AgentState
from gc_agent.telemetry import record_model_usage, write_agent_trace

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"
_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None
MAX_FOLLOWUP_REMINDERS = 2
FOLLOWUP_DUPLICATE_WINDOW_HOURS = 24
FOLLOWUP_INTERVAL_HOURS = 48
FOLLOWUP_LOG_PREFIX = "[FOLLOWUP"
FOLLOWUP_STOP_STATUSES = {"converted", "accepted", "closed", "discarded", "expired"}


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for follow-up draft generation."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for followup_trigger")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into plain text."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty follow-up output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 400) -> str:
    """Call Claude with retry support and return follow-up copy."""
    client = _get_anthropic_client()

    for attempt in range(1, 4):
        try:
            response = await client.messages.create(
                model=MODEL_NAME,
                max_tokens=max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            usage = getattr(response, "usage", None)
            record_model_usage(
                model_name=MODEL_NAME,
                input_tokens=getattr(usage, "input_tokens", None),
                output_tokens=getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("followup_trigger rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _utc_now() -> datetime:
    """Return timezone-aware current UTC time."""
    return datetime.now(timezone.utc)


def _parse_datetime(raw: Any) -> Optional[datetime]:
    """Parse ISO-like datetime payloads into aware UTC datetimes."""
    if isinstance(raw, datetime):
        value = raw
    elif isinstance(raw, str) and raw.strip():
        text = raw.strip()
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            value = datetime.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _parse_int(raw: Any, default: int = 0) -> int:
    """Coerce reminder counters into bounded integers."""
    try:
        return max(int(raw or default), 0)
    except Exception:
        return max(int(default), 0)


def _due_date_iso(now: datetime | None = None, *, due_in_hours: int = 48) -> str:
    """Return the next follow-up due date in ISO format."""
    current = now or _utc_now()
    return (current + timedelta(hours=max(int(due_in_hours or 48), 1))).date().isoformat()


def _next_due_at_iso(now: datetime | None = None, *, due_in_hours: int = FOLLOWUP_INTERVAL_HOURS) -> str:
    """Return the next follow-up reminder timestamp in ISO format."""
    current = now or _utc_now()
    return (current + timedelta(hours=max(int(due_in_hours or FOLLOWUP_INTERVAL_HOURS), 1))).isoformat()


def _parse_due_date(raw: Any) -> Optional[date]:
    """Parse due_date values from Supabase rows."""
    if isinstance(raw, date):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return None

    candidate = raw.strip().split("T", 1)[0]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None


def _is_followup_item(row: dict[str, Any]) -> bool:
    """Return True when a row represents a quote follow-up open item."""
    return str(row.get("type", "")).strip().lower() == "followup"


def _is_active_followup_item(row: dict[str, Any]) -> bool:
    """Return True when an open follow-up item still needs attention."""
    if _parse_datetime(row.get("stopped_at")) is not None:
        return False
    status = str(row.get("status", "")).strip().lower()
    return _is_followup_item(row) and status in {"open", "in-progress", "overdue", ""}


def _followup_draft_count(drafts: list[dict[str, Any]], job_id: str) -> int:
    """Count existing follow-up drafts for a job."""
    job_value = job_id.strip()
    if not job_value:
        return 0

    count = 0
    for draft in drafts:
        if str(draft.get("job_id", "")).strip() != job_value:
            continue
        if str(draft.get("type", "")).strip().lower() != "follow-up":
            continue
        count += 1
    return count


def _fallback_followup_message(job_name: str, address: str, attempt_number: int) -> str:
    """Build deterministic follow-up copy when Claude is unavailable."""
    job_label = job_name or address or "your roofing quote"
    if attempt_number <= 1:
        return (
            f"Checking in on the quote we sent for {job_label}. "
            "Let us know if you want to move forward or if you have any questions."
        )
    return (
        f"Following up one last time on the quote for {job_label}. "
        "If you would like us to schedule the work or revise anything, reply here and we will take care of it."
    )


async def _generate_followup_message(
    job_name: str,
    address: str,
    attempt_number: int,
) -> str:
    """Generate follow-up copy using the prompt, with deterministic fallback."""
    if not (os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()):
        return _fallback_followup_message(job_name, address, attempt_number)

    user_prompt = (
        f"JOB_NAME: {job_name or 'Roofing quote'}\n"
        f"ADDRESS: {address or 'Address pending'}\n"
        f"ATTEMPT_NUMBER: {attempt_number}\n"
        "Write only the outbound follow-up message body."
    )

    try:
        return await _call_claude(
            system=prompts.FOLLOWUP_TRIGGER_SYSTEM,
            user=user_prompt,
            max_tokens=400,
        )
    except Exception as exc:
        LOGGER.warning("followup_trigger fallback used: %s", exc)
        return _fallback_followup_message(job_name, address, attempt_number)


def _quote_followup_marker(quote_id: str) -> str:
    """Return the stable description marker used to identify quote follow-ups."""
    quote_value = quote_id.strip()
    return f"Quote ID: {quote_value}" if quote_value else ""


def _matches_quote_followup(row: dict[str, Any], quote_id: str, trace_id: str) -> bool:
    """Return True when an active follow-up row already belongs to the same quote."""
    if not _is_active_followup_item(row):
        return False
    quote_marker = _quote_followup_marker(quote_id)
    description = str(row.get("description", "")).strip()
    row_trace_id = str(row.get("trace_id", "")).strip()
    if quote_marker and quote_marker in description:
        return True
    return bool(trace_id.strip() and row_trace_id == trace_id.strip())


def _build_open_item_description(final_quote: dict[str, object], address: str, quote_id: str) -> str:
    """Build the reminder description for the stored open item."""
    quote_marker = _quote_followup_marker(quote_id)
    total_price = final_quote.get("total_price")
    if total_price:
        summary = f"Quote follow-up due for {address or 'recent estimate'} at total {total_price}."
    else:
        summary = f"Quote follow-up due for {address or 'recent estimate'}."
    return f"{summary} {quote_marker}".strip()


def _extract_quote_id(item: dict[str, Any]) -> str:
    """Resolve the quote_id attached to a follow-up open item."""
    direct_value = str(item.get("quote_id", "")).strip()
    if direct_value:
        return direct_value

    description = str(item.get("description", "")).strip()
    match = re.search(r"Quote ID:\s*([A-Za-z0-9._:-]+)", description)
    if match:
        return match.group(1).strip()
    return ""


def _followup_due_at(item: dict[str, Any]) -> Optional[datetime]:
    """Return the timestamp when a follow-up becomes eligible to send."""
    next_due_at = _parse_datetime(item.get("next_due_at"))
    if next_due_at is not None:
        return next_due_at

    due_date = _parse_due_date(item.get("due_date"))
    if due_date is None:
        return None
    return datetime.combine(due_date, datetime.min.time(), tzinfo=timezone.utc)


def _is_valid_quote_source(candidate: Any) -> bool:
    """Return True when a quote payload is complete enough for follow-up output."""
    if not isinstance(candidate, dict) or not candidate:
        return False
    if not str(candidate.get("scope_of_work", "")).strip():
        return False
    if "total_price" not in candidate:
        return False
    line_items = candidate.get("line_items")
    if line_items is not None and not isinstance(line_items, list):
        return False
    exclusions = candidate.get("exclusions")
    if exclusions is not None and not isinstance(exclusions, list):
        return False
    return True


def _select_followup_quote(record: dict[str, Any]) -> dict[str, Any]:
    """Use the final edited quote when valid, otherwise fall back to the generated quote."""
    original_quote = record.get("quote_draft")
    fallback = dict(original_quote) if isinstance(original_quote, dict) else {}
    final_quote = record.get("final_quote_draft")
    if isinstance(final_quote, dict) and final_quote:
        if _is_valid_quote_source(final_quote):
            return dict(final_quote)

        error_text = "followup: final_quote_draft malformed; falling back to quote_draft"
        LOGGER.warning(error_text)
        write_agent_trace(
            trace_id=str(record.get("trace_id", "")).strip(),
            gc_id=str(record.get("gc_id", "")).strip(),
            job_id=str(record.get("job_id", "")).strip(),
            input_surface="scheduler",
            flow="followup",
            node_name="quote_source_select",
            status="error",
            error_text=error_text,
            input_preview={
                "quote_id": str(record.get("id", "")).strip(),
                "context": "followup",
                "final_quote_keys": sorted(final_quote.keys()),
            },
            output_preview={"fallback_keys": sorted(fallback.keys())},
        )
    return fallback


def _followup_log_preview(body: str, attempt_number: int) -> str:
    """Prefix logged reminder bodies so duplicate detection can identify them."""
    return f"[FOLLOWUP #{attempt_number}] {body}".strip()


def _is_followup_delivery_attempt(row: dict[str, Any]) -> bool:
    """Return True when a delivery log row came from a reminder send."""
    preview = str(row.get("message_preview", "")).strip()
    return preview.upper().startswith(FOLLOWUP_LOG_PREFIX)


def _recent_followup_sent_at(
    item: dict[str, Any],
    deliveries: list[dict[str, Any]],
) -> Optional[datetime]:
    """Return the most recent reminder timestamp from item state or delivery logs."""
    candidates: list[datetime] = []
    last_reminder_at = _parse_datetime(item.get("last_reminder_at"))
    if last_reminder_at is not None:
        candidates.append(last_reminder_at)

    for row in deliveries:
        if not _is_followup_delivery_attempt(row):
            continue
        created_at = _parse_datetime(row.get("created_at"))
        if created_at is not None:
            candidates.append(created_at)

    if not candidates:
        return None
    return max(candidates)


def _select_delivery_target(deliveries: list[dict[str, Any]]) -> Optional[dict[str, str]]:
    """Choose the latest usable destination from existing quote delivery attempts."""
    usable_statuses = {"sent", "delivered", "queued", "accepted"}
    preferred: list[dict[str, str]] = []
    fallback: list[dict[str, str]] = []

    for row in deliveries:
        channel = str(row.get("channel", "")).strip().lower()
        destination = str(row.get("destination", "")).strip()
        if channel not in {"whatsapp", "sms", "email"} or not destination:
            continue

        payload = {
            "channel": channel,
            "destination": destination,
            "recipient_name": str(row.get("recipient_name", "")).strip(),
        }
        if str(row.get("delivery_status", "")).strip().lower() in usable_statuses:
            preferred.append(payload)
        else:
            fallback.append(payload)

    if preferred:
        return preferred[0]
    if fallback:
        return fallback[0]
    return None


def _build_followup_email_subject(quote_id: str, quote: dict[str, Any], attempt_number: int) -> str:
    """Return a customer-safe follow-up email subject."""
    address = str(quote.get("project_address", "your project")).strip() or "your project"
    return f"Following up on your quote for {address} ({quote_id}) #{attempt_number}"


async def _deliver_followup_message(channel: str, destination: str, body: str) -> str:
    """Send SMS or WhatsApp follow-up using the existing Twilio senders."""
    twilio_module = import_module("gc_agent.webhooks.twilio")
    if channel == "whatsapp":
        sender = getattr(twilio_module, "send_whatsapp_message")
    else:
        sender = getattr(twilio_module, "send_sms_message")
    return await sender(destination, body)


async def _deliver_followup_email(
    destination: str,
    subject: str,
    body: str,
    *,
    pdf_bytes: bytes,
    quote_id: str,
) -> str:
    """Send an email reminder using the existing SMTP delivery path."""
    from gc_agent.email_delivery import send_email_message

    filename = f"gc-agent-quote-{quote_id}.pdf"
    return await asyncio.to_thread(
        send_email_message,
        destination,
        subject,
        body,
        pdf_bytes=pdf_bytes,
        pdf_filename=filename,
    )


async def _stop_followup_item(
    contractor_id: str,
    item: dict[str, Any],
    *,
    reason: str,
    current_time: datetime,
    status: str,
) -> None:
    """Persist terminal state for a follow-up open item."""
    from gc_agent.tools import supabase

    item_id = str(item.get("id", "")).strip()
    if not item_id:
        return
    await asyncio.to_thread(
        supabase.update_open_item,
        item_id,
        contractor_id,
        {
            "status": status,
            "stopped_at": current_time.isoformat(),
            "stop_reason": reason,
            "next_due_at": None,
            "due_date": None,
            "resolved_at": current_time.isoformat() if status == "resolved" else None,
        },
    )


async def ensure_quote_followup(
    contractor_id: str,
    job_id: str,
    quote_id: str,
    trace_id: str,
    *,
    final_quote: dict[str, object] | None = None,
    due_in_hours: int = 48,
) -> dict[str, object]:
    """Create or reuse the quote follow-up open item for an approved quote."""
    from gc_agent.tools import supabase

    contractor_value = contractor_id.strip()
    job_value = job_id.strip()
    quote_value = quote_id.strip()
    trace_value = trace_id.strip()
    if not contractor_value or not job_value:
        return {
            "created": False,
            "open_item_id": "",
            "quote_id": quote_value,
            "reason": "missing identifiers",
        }

    existing_items = await asyncio.to_thread(
        supabase.list_open_items,
        contractor_value,
        job_value,
    )
    normalized_items = [dict(row) for row in existing_items]
    matching_items = [
        row for row in normalized_items if _matches_quote_followup(row, quote_value, trace_value)
    ]
    if matching_items:
        existing = matching_items[0]
        return {
            "created": False,
            "open_item_id": str(existing.get("id", "")).strip(),
            "quote_id": quote_value,
            "reason": "already_exists",
        }

    active_items = [row for row in normalized_items if _is_active_followup_item(row)]
    if active_items:
        existing = active_items[0]
        return {
            "created": False,
            "open_item_id": str(existing.get("id", "")).strip(),
            "quote_id": quote_value,
            "reason": "active_followup_exists",
        }

    final_quote_payload = dict(final_quote or {})
    address = str(final_quote_payload.get("project_address") or "").strip()
    open_item_id = f"followup-{uuid4().hex[:12]}"
    payload = {
        "id": open_item_id,
        "job_id": job_value,
        "gc_id": contractor_value,
        "quote_id": quote_value or None,
        "type": "followup",
        "description": _build_open_item_description(final_quote_payload, address, quote_value),
        "owner": "Arbor",
        "status": "open",
        "days_silent": 0,
        "reminder_count": 0,
        "due_date": _due_date_iso(due_in_hours=due_in_hours),
        "next_due_at": _next_due_at_iso(due_in_hours=due_in_hours),
        "last_reminder_at": None,
        "stopped_at": None,
        "stop_reason": None,
        "trace_id": trace_value or None,
    }
    await asyncio.to_thread(supabase.insert_open_item, payload)
    return {
        "created": True,
        "open_item_id": open_item_id,
        "quote_id": quote_value,
        "reason": "created",
    }


async def stop_quote_followup(
    contractor_id: str,
    quote_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    """Manually stop automatic reminders for a quote follow-up open item."""
    from gc_agent.tools import supabase

    contractor_value = contractor_id.strip()
    quote_value = quote_id.strip()
    if not contractor_value or not quote_value:
        return {
            "stopped": False,
            "open_item_id": "",
            "quote_id": quote_value,
            "reason": "missing identifiers",
        }

    current_time = now or datetime.now(timezone.utc)
    all_items = await asyncio.to_thread(supabase.list_open_items, contractor_value, None)
    normalized_items = [dict(row) for row in all_items]

    active_match = next(
        (row for row in normalized_items if _matches_quote_followup(row, quote_value, "") and _is_active_followup_item(row)),
        None,
    )
    if active_match is not None:
        await _stop_followup_item(
            contractor_value,
            active_match,
            reason="manual_stop",
            current_time=current_time,
            status="resolved",
        )
        return {
            "stopped": True,
            "open_item_id": str(active_match.get("id", "")).strip(),
            "quote_id": quote_value,
            "reason": "manual_stop",
        }

    existing_match = next(
        (row for row in normalized_items if _extract_quote_id(row) == quote_value),
        None,
    )
    if existing_match is not None:
        return {
            "stopped": False,
            "open_item_id": str(existing_match.get("id", "")).strip(),
            "quote_id": quote_value,
            "reason": "already_stopped",
        }

    return {
        "stopped": False,
        "open_item_id": "",
        "quote_id": quote_value,
        "reason": "not_found",
    }


async def followup_trigger(state: AgentState) -> dict[str, object]:
    """Create the initial follow-up open item after an approved quote is sent."""
    from gc_agent.tools import supabase

    approval_status = state.approval_status.strip().lower()
    if approval_status not in {"approved", "edited"}:
        return {
            "followup_count": state.followup_count,
            "stop_following_up": state.stop_following_up,
            "memory_context": dict(state.memory_context),
        }

    if not state.gc_id.strip() or not state.active_job_id.strip():
        errors = list(state.errors)
        errors.append("followup_trigger skipped: gc_id and active_job_id are required")
        return {"errors": errors}

    all_drafts = await asyncio.to_thread(supabase.list_draft_queue, state.gc_id)
    followup_count = _followup_draft_count([dict(row) for row in all_drafts], state.active_job_id)

    final_quote = dict(state.final_quote_draft) or dict(state.quote_draft)
    quote_id = str(state.memory_context.get("quote_id", "")).strip()

    try:
        followup_result = await ensure_quote_followup(
            state.gc_id,
            state.active_job_id,
            quote_id,
            state.trace_id,
            final_quote=final_quote,
        )
    except Exception as exc:
        LOGGER.warning("followup_trigger open item write failed: %s", exc)
        errors = list(state.errors)
        errors.append(f"followup_trigger open item write failed: {exc}")
        return {"errors": errors}

    memory_context = dict(state.memory_context)
    open_item_id = str(followup_result.get("open_item_id", "")).strip()
    memory_context["followup_open_item_id"] = open_item_id
    memory_context["followup_open_item_created"] = bool(followup_result.get("created"))
    return {
        "followup_count": followup_count,
        "stop_following_up": followup_count >= 2 or state.stop_following_up,
        "memory_context": memory_context,
    }


async def process_due_followups(
    contractor_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    """Send due follow-up reminders for quotes that were already delivered."""
    from gc_agent.tools import supabase

    contractor_value = contractor_id.strip()
    if not contractor_value:
        return {
            "processed_items": 0,
            "sent_reminders": 0,
            "failed_attempts": 0,
            "stopped_items": 0,
            "skipped_recent": 0,
            "skipped_missing_destination": 0,
        }

    current_time = now or _utc_now()

    open_items = await asyncio.to_thread(supabase.list_open_items, contractor_value, None)
    jobs = [dict(row) for row in await asyncio.to_thread(supabase.list_jobs, contractor_value)]
    jobs_by_id = {str(row.get("id", "")).strip(): row for row in jobs}

    processed_items = 0
    sent_reminders = 0
    failed_attempts = 0
    stopped_items = 0
    skipped_recent = 0
    skipped_missing_destination = 0

    for item in [dict(row) for row in open_items]:
        if not _is_active_followup_item(item):
            continue
        if _parse_datetime(item.get("stopped_at")) is not None:
            continue

        due_at = _followup_due_at(item)
        if due_at is not None and due_at > current_time:
            continue

        processed_items += 1
        item_id = str(item.get("id", "")).strip()
        job_id = str(item.get("job_id", "")).strip()
        quote_id = _extract_quote_id(item)
        if not quote_id:
            await _stop_followup_item(
                contractor_value,
                item,
                reason="missing_quote_id",
                current_time=current_time,
                status="overdue",
            )
            stopped_items += 1
            continue

        reminder_count = _parse_int(item.get("reminder_count"), 0)
        if reminder_count >= MAX_FOLLOWUP_REMINDERS:
            await _stop_followup_item(
                contractor_value,
                item,
                reason="max_reminders_reached",
                current_time=current_time,
                status="overdue",
            )
            stopped_items += 1
            continue

        try:
            record = await queries.get_quote_draft_record(quote_id)
            if record is None or str(record.get("gc_id", "")).strip() != contractor_value:
                await _stop_followup_item(
                    contractor_value,
                    item,
                    reason="quote_missing",
                    current_time=current_time,
                    status="overdue",
                )
                stopped_items += 1
                continue

            approval_status = str(record.get("approval_status", "")).strip().lower()
            if approval_status in FOLLOWUP_STOP_STATUSES:
                await _stop_followup_item(
                    contractor_value,
                    item,
                    reason=f"quote_{approval_status}",
                    current_time=current_time,
                    status="resolved",
                )
                stopped_items += 1
                continue

            deliveries = await queries.get_quote_delivery_attempts(quote_id, contractor_value)
            recent_reminder_at = _recent_followup_sent_at(item, deliveries)
            if recent_reminder_at is not None:
                threshold = recent_reminder_at + timedelta(hours=FOLLOWUP_DUPLICATE_WINDOW_HOURS)
                if threshold > current_time:
                    await asyncio.to_thread(
                        supabase.update_open_item,
                        item_id,
                        contractor_value,
                        {
                            "status": "in-progress",
                            "next_due_at": threshold.isoformat(),
                            "due_date": threshold.date().isoformat(),
                        },
                    )
                    skipped_recent += 1
                    continue

            target = _select_delivery_target(deliveries)
            if target is None:
                next_due = current_time + timedelta(hours=FOLLOWUP_DUPLICATE_WINDOW_HOURS)
                await asyncio.to_thread(
                    supabase.update_open_item,
                    item_id,
                    contractor_value,
                    {
                        "status": "open",
                        "next_due_at": next_due.isoformat(),
                        "due_date": next_due.date().isoformat(),
                        "quote_id": quote_id,
                    },
                )
                write_agent_trace(
                    trace_id=str(record.get("trace_id", "")).strip() or str(item.get("trace_id", "")).strip(),
                    gc_id=contractor_value,
                    job_id=job_id,
                    input_surface="scheduler",
                    flow="followup",
                    node_name="process_due_followups",
                    status="skipped",
                    error_text="missing delivery destination",
                    input_preview={"quote_id": quote_id, "open_item_id": item_id},
                    output_preview={},
                )
                skipped_missing_destination += 1
                continue

            attempt_number = reminder_count + 1
            job = jobs_by_id.get(job_id, {})
            job_name = str(job.get("name", "")).strip()
            address = str(job.get("address", "")).strip()
            content = await _generate_followup_message(job_name, address, attempt_number)
            logged_preview = _followup_log_preview(content, attempt_number)
            quote = _select_followup_quote(record)

            provider_message_id = ""
            delivery_status = "sent"
            error_message = ""

            try:
                if target["channel"] == "email":
                    pdf_bytes = render_quote_pdf(quote_id, quote)
                    provider_message_id = await _deliver_followup_email(
                        target["destination"],
                        _build_followup_email_subject(quote_id, quote, attempt_number),
                        content,
                        pdf_bytes=pdf_bytes,
                        quote_id=quote_id,
                    )
                else:
                    provider_message_id = await _deliver_followup_message(
                        target["channel"],
                        target["destination"],
                        content,
                    )
            except Exception as exc:
                delivery_status = "failed"
                error_message = str(exc)

            await queries.insert_quote_delivery_log(
                quote_id=quote_id,
                gc_id=contractor_value,
                job_id=str(record.get("job_id", "")).strip() or job_id,
                trace_id=str(record.get("trace_id", "")).strip() or str(item.get("trace_id", "")).strip(),
                channel=target["channel"],
                destination=target["destination"],
                recipient_name=target["recipient_name"],
                message_preview=logged_preview,
                delivery_status=delivery_status,
                provider_message_id=provider_message_id,
                error_message=error_message,
            )

            updated_count = attempt_number
            next_due = current_time + timedelta(hours=FOLLOWUP_INTERVAL_HOURS)
            update_payload: dict[str, Any] = {
                "quote_id": quote_id,
                "reminder_count": updated_count,
                "last_reminder_at": current_time.isoformat(),
                "next_due_at": next_due.isoformat(),
                "due_date": next_due.date().isoformat(),
                "status": "in-progress",
            }
            if updated_count >= MAX_FOLLOWUP_REMINDERS:
                update_payload.update(
                    {
                        "status": "overdue",
                        "stopped_at": current_time.isoformat(),
                        "stop_reason": "max_reminders_reached",
                    }
                )
                stopped_items += 1

            await asyncio.to_thread(
                supabase.update_open_item,
                item_id,
                contractor_value,
                update_payload,
            )

            if delivery_status == "failed":
                failed_attempts += 1
            else:
                sent_reminders += 1
        except Exception as exc:
            failed_attempts += 1
            write_agent_trace(
                trace_id=str(item.get("trace_id", "")).strip(),
                gc_id=contractor_value,
                job_id=job_id,
                input_surface="scheduler",
                flow="followup",
                node_name="process_due_followups",
                status="error",
                error_text=str(exc),
                input_preview={"open_item_id": item_id, "quote_id": quote_id},
                output_preview={},
            )

    return {
        "processed_items": processed_items,
        "sent_reminders": sent_reminders,
        "failed_attempts": failed_attempts,
        "stopped_items": stopped_items,
        "skipped_recent": skipped_recent,
        "skipped_missing_destination": skipped_missing_destination,
    }


async def check_due_followups(
    contractor_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    """Backward-compatible wrapper for the legacy CLI command name."""
    return await process_due_followups(contractor_id, now=now)


__all__ = [
    "followup_trigger",
    "process_due_followups",
    "check_due_followups",
    "ensure_quote_followup",
    "stop_quote_followup",
    "_call_claude",
]
