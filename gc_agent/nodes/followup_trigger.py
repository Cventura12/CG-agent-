"""Create and process follow-up reminders for approved quotes."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState
from gc_agent.telemetry import record_model_usage

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"
_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


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


def _due_date_iso(now: datetime | None = None, *, due_in_hours: int = 48) -> str:
    """Return the next follow-up due date in ISO format."""
    current = now or _utc_now()
    return (current + timedelta(hours=max(int(due_in_hours or 48), 1))).date().isoformat()


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
        "type": "followup",
        "description": _build_open_item_description(final_quote_payload, address, quote_value),
        "owner": "GC Agent",
        "status": "open",
        "days_silent": 0,
        "due_date": _due_date_iso(due_in_hours=due_in_hours),
        "trace_id": trace_value or None,
    }
    await asyncio.to_thread(supabase.insert_open_item, payload)
    return {
        "created": True,
        "open_item_id": open_item_id,
        "quote_id": quote_value,
        "reason": "created",
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


async def check_due_followups(
    contractor_id: str,
    *,
    now: datetime | None = None,
) -> dict[str, object]:
    """Create pending follow-up drafts for due open items."""
    from gc_agent.tools import supabase

    contractor_value = contractor_id.strip()
    if not contractor_value:
        return {
            "processed_items": 0,
            "created_drafts": 0,
            "followup_count": 0,
            "stop_following_up": False,
        }

    current_time = now or _utc_now()
    due_cutoff = current_time.date()

    open_items = await asyncio.to_thread(supabase.list_open_items, contractor_value, None)
    drafts = [dict(row) for row in await asyncio.to_thread(supabase.list_draft_queue, contractor_value)]
    jobs = [dict(row) for row in await asyncio.to_thread(supabase.list_jobs, contractor_value)]
    jobs_by_id = {str(row.get("id", "")).strip(): row for row in jobs}

    processed_items = 0
    created_drafts = 0
    max_followup_count = 0
    stop_following_up = False

    for item in [dict(row) for row in open_items]:
        if not _is_active_followup_item(item):
            continue

        due_date = _parse_due_date(item.get("due_date"))
        if due_date is None or due_date > due_cutoff:
            continue

        processed_items += 1
        job_id = str(item.get("job_id", "")).strip()
        existing_count = _followup_draft_count(drafts, job_id)
        max_followup_count = max(max_followup_count, existing_count)

        if existing_count >= 2:
            stop_following_up = True
            await asyncio.to_thread(
                supabase.update_open_item,
                str(item.get("id", "")).strip(),
                contractor_value,
                {"status": "overdue"},
            )
            continue

        attempt_number = existing_count + 1
        job = jobs_by_id.get(job_id, {})
        job_name = str(job.get("name", "")).strip()
        address = str(job.get("address", "")).strip()
        content = await _generate_followup_message(job_name, address, attempt_number)

        draft_payload = {
            "id": f"followup-draft-{uuid4().hex[:12]}",
            "job_id": job_id,
            "gc_id": contractor_value,
            "type": "follow-up",
            "title": f"Follow-up #{attempt_number}: {job_name or address or 'Quote'}",
            "content": content,
            "why": "Quote follow-up is due after 48 hours with no response.",
            "status": "pending",
            "trace_id": str(item.get("trace_id", "")).strip() or None,
        }
        await asyncio.to_thread(supabase.upsert_draft_queue, draft_payload)
        drafts.append(draft_payload)
        created_drafts += 1
        max_followup_count = max(max_followup_count, attempt_number)

        should_stop = attempt_number >= 2
        if should_stop:
            stop_following_up = True

        await asyncio.to_thread(
            supabase.update_open_item,
            str(item.get("id", "")).strip(),
            contractor_value,
            {
                "status": "overdue" if should_stop else "in-progress",
                "due_date": _due_date_iso(current_time),
            },
        )

    return {
        "processed_items": processed_items,
        "created_drafts": created_drafts,
        "followup_count": max_followup_count,
        "stop_following_up": stop_following_up,
    }


__all__ = ["followup_trigger", "check_due_followups", "ensure_quote_followup", "_call_claude"]
