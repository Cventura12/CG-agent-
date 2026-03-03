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


def _due_date_iso(now: datetime | None = None) -> str:
    """Return the next follow-up due date, 48 hours out, in ISO format."""
    current = now or _utc_now()
    return (current + timedelta(hours=48)).date().isoformat()


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


def _build_open_item_description(final_quote: dict[str, object], address: str) -> str:
    """Build the reminder description for the stored open item."""
    total_price = final_quote.get("total_price")
    if total_price:
        return f"Quote follow-up due for {address or 'recent estimate'} at total {total_price}."
    return f"Quote follow-up due for {address or 'recent estimate'}."


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

    existing_items = await asyncio.to_thread(
        supabase.list_open_items,
        state.gc_id,
        state.active_job_id,
    )
    active_items = [row for row in existing_items if _is_active_followup_item(dict(row))]

    all_drafts = await asyncio.to_thread(supabase.list_draft_queue, state.gc_id)
    followup_count = _followup_draft_count([dict(row) for row in all_drafts], state.active_job_id)

    memory_context = dict(state.memory_context)
    if active_items:
        open_item_id = str(active_items[0].get("id", "")).strip()
        memory_context["followup_open_item_id"] = open_item_id
        memory_context["followup_open_item_created"] = True
        return {
            "followup_count": followup_count,
            "stop_following_up": followup_count >= 2 or state.stop_following_up,
            "memory_context": memory_context,
        }

    final_quote = dict(state.final_quote_draft) or dict(state.quote_draft)
    address = (
        str(final_quote.get("project_address") or state.job_scope.get("address") or "").strip()
    )

    open_item_id = f"followup-{uuid4().hex[:12]}"
    payload = {
        "id": open_item_id,
        "job_id": state.active_job_id,
        "gc_id": state.gc_id,
        "type": "followup",
        "description": _build_open_item_description(final_quote, address),
        "owner": "GC Agent",
        "status": "open",
        "days_silent": 0,
        "due_date": _due_date_iso(),
        "trace_id": state.trace_id,
    }

    try:
        await asyncio.to_thread(supabase.insert_open_item, payload)
    except Exception as exc:
        LOGGER.warning("followup_trigger open item write failed: %s", exc)
        errors = list(state.errors)
        errors.append(f"followup_trigger open item write failed: {exc}")
        return {"errors": errors}

    memory_context["followup_open_item_id"] = open_item_id
    memory_context["followup_open_item_created"] = True
    return {
        "followup_count": followup_count,
        "stop_following_up": False,
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


__all__ = ["followup_trigger", "check_due_followups", "_call_claude"]
