"""State update node that persists parsed changes."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.state import AgentState, Job, OpenItem

LOGGER = logging.getLogger(__name__)
VALID_OPEN_ITEM_TYPES = {
    "RFI",
    "CO",
    "sub-confirm",
    "material",
    "decision",
    "approval",
    "follow-up",
}
CHANGE_ORDER_HINTS = (
    "change order",
    "change request",
    "scope change",
    "additional work",
    "extra work",
    "added work",
    "revised price",
    "unpriced",
)
APPROVAL_HINTS = (
    "approval",
    "approve",
    "signoff",
    "sign-off",
    "selection",
    "decision",
    "authorization",
)
MATERIAL_HINTS = (
    "material",
    "supplier",
    "vendor",
    "delivery",
    "lead time",
    "order",
)
SUB_CONFIRM_HINTS = (
    "subcontractor",
    "trade partner",
    "crew confirmation",
    "vendor confirmation",
)
RFI_HINTS = (
    "question",
    "clarify",
    "clarification",
    "rfi",
)


def _normalize_text(value: Any) -> str:
    """Normalize free text for safe comparisons and display output."""
    return str(value or "").strip()


def _contains_any(text: str, hints: tuple[str, ...]) -> bool:
    """Return True when any normalized hint appears in the candidate text."""
    lowered = text.strip().lower()
    if not lowered:
        return False
    return any(hint in lowered for hint in hints)


def _normalize_open_item_type(
    explicit_type: Any,
    description: str,
) -> str:
    """Map messy model/open-text item types into the existing tracked open-item set."""
    item_type = _normalize_text(explicit_type)
    if item_type in VALID_OPEN_ITEM_TYPES:
        return item_type

    normalized_description = description.strip().lower()
    if _contains_any(normalized_description, CHANGE_ORDER_HINTS):
        return "CO"
    if _contains_any(normalized_description, APPROVAL_HINTS):
        return "approval"
    if _contains_any(normalized_description, MATERIAL_HINTS):
        return "material"
    if _contains_any(normalized_description, SUB_CONFIRM_HINTS):
        return "sub-confirm"
    if _contains_any(normalized_description, RFI_HINTS):
        return "RFI"
    return "follow-up"


def _parse_due_date(value: Any) -> Optional[date]:
    """Parse due date values from common string formats."""
    if isinstance(value, date):
        return value

    text = _normalize_text(value)
    if not text:
        return None

    candidate = text[:10]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None


def _timestamp_note_line(job_update: dict[str, Any]) -> str:
    """Build a timestamped note line from a parsed job update payload."""
    summary = _normalize_text(
        job_update.get("note")
        or job_update.get("summary")
        or job_update.get("change")
        or job_update.get("description")
    )

    if not summary:
        summary = json.dumps(job_update, ensure_ascii=True)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return f"[{stamp}] {summary}"


def _find_job_for_payload(payload: dict[str, Any], jobs: list[Job]) -> Optional[Job]:
    """Resolve a target job by job_id first, then by case-insensitive job name."""
    job_id = _normalize_text(payload.get("job_id"))
    if job_id:
        return next((job for job in jobs if job.id == job_id), None)

    job_name = _normalize_text(payload.get("job_name") or payload.get("name"))
    if job_name:
        lowered = job_name.lower()
        return next((job for job in jobs if job.name.lower() == lowered), None)

    return None


def _resolved_descriptions(job_update: dict[str, Any]) -> set[str]:
    """Extract normalized resolved-item descriptions from a job update payload."""
    resolved_values: list[Any] = []
    for key in ("resolved_open_items", "resolved_items", "resolved", "closed_items"):
        value = job_update.get(key)
        if isinstance(value, list):
            resolved_values.extend(value)

    normalized: set[str] = set()
    for item in resolved_values:
        if isinstance(item, dict):
            candidate = _normalize_text(item.get("description") or item.get("name") or item.get("item"))
        else:
            candidate = _normalize_text(item)

        if candidate:
            normalized.add(candidate.lower())

    return normalized


def _build_open_item(new_item: dict[str, Any], job_id: str) -> OpenItem:
    """Create an OpenItem model from parsed intent payload data."""
    description = _normalize_text(new_item.get("description") or new_item.get("item") or "New open item")
    item_type = _normalize_open_item_type(new_item.get("type"), description)

    return OpenItem(
        id=uuid4().hex,
        job_id=job_id,
        type=item_type,  # type: ignore[arg-type]
        description=description,
        owner=_normalize_text(new_item.get("owner") or "GC"),
        status="open",
        days_silent=0,
        due_date=_parse_due_date(new_item.get("due_date")),
    )


def _find_duplicate_open_item(target_job: Job, candidate: OpenItem) -> OpenItem | None:
    """Return an unresolved open item when the same issue is already tracked on the job."""
    candidate_description = candidate.description.strip().lower()
    if not candidate_description:
        return None

    for existing in target_job.open_items:
        if existing.description.strip().lower() == candidate_description:
            return existing
    return None


async def update_state(state: AgentState) -> dict[str, object]:
    """Apply parsed intent changes to job state and persist writes to Supabase."""
    if state.parsed_intent is None:
        return {"jobs": state.jobs}

    gc_id = state.gc_id or "gc-demo"
    errors = list(state.errors)
    jobs = [job.model_copy(deep=True) for job in state.jobs]

    for job_update in state.parsed_intent.job_updates:
        if not isinstance(job_update, dict):
            errors.append("update_state skipped non-dict job_update payload")
            continue

        target_job = _find_job_for_payload(job_update, jobs)
        if target_job is None:
            errors.append(f"update_state could not match job for update: {job_update!r}")
            continue

        note_line = _timestamp_note_line(job_update)
        target_job.notes = f"{target_job.notes}\n{note_line}".strip() if target_job.notes else note_line

        resolved = _resolved_descriptions(job_update)
        if resolved:
            retained_items: list[OpenItem] = []
            for item in target_job.open_items:
                if item.description.strip().lower() in resolved:
                    try:
                        LOGGER.debug("resolve_open_item item_id=%s gc_id=%s", item.id, gc_id)
                        await queries.resolve_open_item(item.id, gc_id)
                    except DatabaseError as exc:
                        errors.append(f"resolve_open_item failed for {item.id}: {exc}")
                    continue
                retained_items.append(item)
            target_job.open_items = retained_items

        try:
            LOGGER.debug("upsert_job job_id=%s gc_id=%s", target_job.id, gc_id)
            await queries.upsert_job(target_job, gc_id)
        except DatabaseError as exc:
            errors.append(f"upsert_job failed for {target_job.id}: {exc}")

    for new_item_payload in state.parsed_intent.new_open_items:
        if not isinstance(new_item_payload, dict):
            errors.append("update_state skipped non-dict new_open_item payload")
            continue

        target_job = _find_job_for_payload(new_item_payload, jobs)
        if target_job is None:
            errors.append(f"update_state could not match job for new_open_item: {new_item_payload!r}")
            continue

        open_item = _build_open_item(new_item_payload, target_job.id)
        duplicate = _find_duplicate_open_item(target_job, open_item)
        if duplicate is not None:
            LOGGER.debug(
                "Skipping duplicate open item for job_id=%s description=%s",
                target_job.id,
                open_item.description,
            )
            continue
        target_job.open_items.append(open_item)

        try:
            LOGGER.debug("insert_open_item item_id=%s job_id=%s gc_id=%s", open_item.id, target_job.id, gc_id)
            await queries.insert_open_item(open_item, gc_id)
        except DatabaseError as exc:
            errors.append(f"insert_open_item failed for {open_item.id}: {exc}")

    result: dict[str, object] = {"jobs": jobs}
    if errors != state.errors:
        result["errors"] = errors
    return result


__all__ = ["update_state"]
