"""Jobs API endpoints for active jobs, detail views, and briefings."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi_cache.decorator import cache
from pydantic import BaseModel

from gc_agent import graph
from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.state import Draft, Job, OpenItem

router = APIRouter(tags=["jobs"])
FINANCIAL_OPEN_ITEM_KEYWORDS = (
    "change order",
    "change request",
    "scope change",
    "additional work",
    "extra work",
    "added work",
    "revised price",
    "cost",
    "allowance",
    "approval",
    "signoff",
    "sign-off",
)
CHANGE_OPEN_ITEM_KEYWORDS = (
    "change order",
    "change request",
    "scope change",
    "additional work",
    "extra work",
    "added work",
    "revised price",
)
OPEN_ITEM_ACTION_TRACE_PREFIX = "open-item-action:"
OPEN_ITEM_ACTION_STAGE_LABELS = {
    "drafted": "Drafted",
    "approved": "Office approved",
    "sent": "Sent",
    "customer-approved": "Customer approved",
    "completed": "Completed",
}
OPEN_ITEM_ACTION_STAGE_SUMMARIES = {
    "drafted": "Draft is waiting on office review.",
    "approved": "Office review is done. Next step is to send it out.",
    "sent": "Sent out and waiting on the customer.",
    "customer-approved": "Customer approved. Finish the work or paperwork to close the loop.",
    "completed": "Closed out.",
}


class OpenItemDraftActionResponse(BaseModel):
    """Response payload for one generated unresolved-item follow-through draft."""

    draft: dict[str, Any]
    open_item: dict[str, Any]


class OpenItemLifecycleRequest(BaseModel):
    """Request payload for advancing one unresolved item's follow-through stage."""

    stage: str


class OpenItemLifecycleResponse(BaseModel):
    """Response payload for one updated unresolved-item lifecycle transition."""

    open_item: dict[str, Any]


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for jobs endpoints."""
    return {
        "success": True,
        "data": data,
        "error": None,
    }


def _error(status_code: int, message: str) -> JSONResponse:
    """Return a standard error envelope with explicit HTTP status code."""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": message,
        },
    )


async def _resolve_gc_id(clerk_user_id: str) -> tuple[str | None, JSONResponse | None]:
    """Resolve internal gc_users.id for authenticated Clerk user."""
    try:
        gc_id = await queries.get_gc_by_clerk_user_id(clerk_user_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))

    if not gc_id:
        return None, _error(403, "GC profile not registered")

    return gc_id, None


def _compute_health(job: Job) -> str:
    """Compute job health from open-item backlog and silence windows."""
    if any(item.days_silent >= 7 for item in job.open_items):
        return "blocked"
    if any(_is_financial_open_item(item) for item in job.open_items):
        return "at-risk"
    if len(job.open_items) > 0:
        return "at-risk"
    return "on-track"


def _contains_any(text: str, hints: tuple[str, ...]) -> bool:
    """Return True when the text includes one of the tracked hint fragments."""
    lowered = text.strip().lower()
    if not lowered:
        return False
    return any(hint in lowered for hint in hints)


def _is_followthrough_open_item(item: OpenItem) -> bool:
    """Return True when the open item represents quote/customer follow-through."""
    return str(item.type).strip().lower() in {"follow-up", "followup"}


def _is_change_open_item(item: OpenItem) -> bool:
    """Return True when the open item likely represents an unresolved change in scope/value."""
    normalized_type = str(item.type).strip().lower()
    if normalized_type == "co":
        return True
    return _contains_any(item.description, CHANGE_OPEN_ITEM_KEYWORDS)


def _is_financial_open_item(item: OpenItem) -> bool:
    """Return True when the open item likely puts quote or margin follow-through at risk."""
    normalized_type = str(item.type).strip().lower()
    if normalized_type in {"co", "approval", "quote"}:
        return True
    return _contains_any(item.description, FINANCIAL_OPEN_ITEM_KEYWORDS)


def _open_item_kind_label(item: OpenItem) -> str:
    """Return one contractor-facing label for the unresolved item card."""
    if _is_financial_open_item(item):
        return "Money at risk"
    if _is_change_open_item(item):
        return "Change to review"
    if _is_followthrough_open_item(item):
        return "Follow-through"
    normalized_type = str(item.type).strip()
    return normalized_type.replace("-", " ").upper() if normalized_type else "Open item"


def _serialize_open_item(item: OpenItem) -> dict[str, Any]:
    """Serialize an open item with derived operational flags used by the frontend."""
    payload = item.model_dump(mode="json")
    payload["financial_exposure"] = _is_financial_open_item(item)
    payload["change_related"] = _is_change_open_item(item)
    payload["followthrough_related"] = _is_followthrough_open_item(item)
    payload["stalled"] = item.days_silent >= 3
    payload["kind_label"] = _open_item_kind_label(item)
    action = _open_item_action_definition(item)
    if action is not None:
        payload["action_trace_id"] = _action_trace_id(item.id)
        payload["action_draft_type"] = action["draft_type"]
        payload["action_label"] = action["label"]
    if item.action_stage:
        payload["action_stage_label"] = OPEN_ITEM_ACTION_STAGE_LABELS.get(
            item.action_stage,
            item.action_stage.replace("-", " "),
        )
        payload["action_stage_summary"] = OPEN_ITEM_ACTION_STAGE_SUMMARIES.get(item.action_stage)
    return payload


def _operational_summary(job: Job) -> dict[str, int]:
    """Return a compact unresolved-work summary for jobs list and detail views."""
    open_item_count = len(job.open_items)
    financial_exposure_count = sum(1 for item in job.open_items if _is_financial_open_item(item))
    unresolved_change_count = sum(1 for item in job.open_items if _is_change_open_item(item))
    approval_count = sum(1 for item in job.open_items if str(item.type).strip().lower() == "approval")
    followthrough_count = sum(1 for item in job.open_items if _is_followthrough_open_item(item))
    stalled_count = sum(1 for item in job.open_items if item.days_silent >= 3)
    return {
        "open_item_count": open_item_count,
        "financial_exposure_count": financial_exposure_count,
        "unresolved_change_count": unresolved_change_count,
        "approval_count": approval_count,
        "followthrough_count": followthrough_count,
        "stalled_count": stalled_count,
    }


def _serialize_job(job: Job) -> dict[str, Any]:
    """Serialize Job model into JSON-safe payload including health field."""
    payload = job.model_dump(mode="json")
    payload["open_items"] = [_serialize_open_item(item) for item in job.open_items]
    payload["operational_summary"] = _operational_summary(job)
    payload["health"] = _compute_health(job)
    return payload


def _action_trace_id(item_id: str) -> str:
    """Build the trace marker used to dedupe active unresolved-item drafts."""
    return f"{OPEN_ITEM_ACTION_TRACE_PREFIX}{item_id.strip()}"


def _open_item_action_definition(item: OpenItem) -> dict[str, str] | None:
    """Return the suggested draft action for an unresolved financial item."""
    normalized_type = str(item.type).strip().lower()
    item_id = item.id.strip()
    if not item_id:
        return None
    if normalized_type == "approval":
        return {
            "draft_type": "owner-update",
            "label": "Draft approval request",
        }
    if _is_change_open_item(item):
        return {
            "draft_type": "CO",
            "label": "Draft change order",
        }
    return None


def _build_open_item_followthrough_draft(job: Job, item: OpenItem) -> Draft | None:
    """Build a queued draft from one unresolved change or approval item."""
    action = _open_item_action_definition(item)
    if action is None:
        return None

    description = item.description.strip() or "Unresolved job item needs review."
    if action["draft_type"] == "CO":
        title = f"Draft change order for {job.name}"
        content = (
            f"Proposed change order for {job.name}\n\n"
            f"Reason for change:\n{description}\n\n"
            "Before sending:\n"
            "- confirm the added scope\n"
            "- confirm price impact\n"
            "- confirm schedule impact\n\n"
            "Suggested owner message:\n"
            f"Hi, we identified additional work on {job.name} that needs approval before crews proceed: "
            f"{description} I can send over the formal change order with pricing and schedule impact for review."
        )
        why = "Generated from an unresolved change item that is putting money at risk."
    else:
        title = f"Request approval for {job.name}"
        content = (
            f"Approval follow-through for {job.name}\n\n"
            f"Pending approval:\n{description}\n\n"
            "Suggested owner message:\n"
            f"Hi, following up on the pending approval for {job.name}: {description} "
            "Once you confirm, we can keep the schedule moving and document the next step."
        )
        why = "Generated from an unresolved approval item that needs owner follow-through."

    return Draft(
        id=str(uuid4().hex),
        job_id=job.id,
        job_name=job.name,
        type=action["draft_type"],  # type: ignore[arg-type]
        title=title,
        content=content,
        why=why,
        status="queued",
        created_at=datetime.now(timezone.utc),
        trace_id=_action_trace_id(item.id),
    )


async def _find_existing_open_item_draft(gc_id: str, item_id: str) -> Draft | None:
    """Return an active draft already created for one unresolved open item."""
    trace_id = _action_trace_id(item_id)
    pending_drafts = await queries.get_pending_drafts(gc_id)
    return next((draft for draft in pending_drafts if draft.trace_id.strip() == trace_id), None)


def _updated_open_item_for_stage(item: OpenItem, stage: str) -> OpenItem:
    """Return an updated open item model for one lifecycle transition response."""
    if stage == "completed":
        return item.model_copy(update={"status": "resolved", "action_stage": "completed"})
    return item.model_copy(update={"status": "in-progress", "action_stage": stage})


def _validate_open_item_lifecycle_stage(item: OpenItem, stage: str) -> str | None:
    """Return an error message when a lifecycle stage transition is invalid."""
    normalized = stage.strip().lower()
    if normalized not in {"sent", "customer-approved", "completed"}:
        return "stage must be sent, customer-approved, or completed"

    if _open_item_action_definition(item) is None:
        return "open item does not support follow-through lifecycle"

    current_stage = (item.action_stage or "").strip().lower()
    if normalized == "sent" and current_stage not in {"approved", "sent"}:
        return "open item must be office approved before it can be marked sent"
    if normalized == "customer-approved" and current_stage not in {"sent", "customer-approved"}:
        return "open item must be sent before it can be marked customer approved"
    if normalized == "completed" and current_stage not in {"customer-approved", "completed"}:
        return "open item must be customer approved before it can be marked completed"

    return None


@router.get("/jobs/briefing", response_model=None)
async def refresh_briefing(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Trigger briefing generation and return latest briefing text."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        briefing_text = await graph.run_briefing(gc_id)
    except Exception as exc:
        return _error(500, str(exc))

    return _success({"briefing": briefing_text})


@router.get("/jobs", response_model=None)
@cache(expire=30)
async def list_jobs(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return all active jobs for a GC account with open items and health."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        jobs = await queries.get_active_jobs(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success({"jobs": [_serialize_job(job) for job in jobs]})


@router.get("/jobs/{job_id}", response_model=None)
async def job_detail(job_id: str, current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return a single job with open items and recent update log entries."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        jobs = await queries.get_active_jobs(gc_id)
        recent_updates = await queries.get_recent_update_logs(gc_id, job_id, limit=10)
        call_history = await queries.get_job_call_history(gc_id, job_id, limit=12)
        audit_timeline = await queries.get_job_audit_timeline(gc_id, job_id, limit=80)
        followup_state = await queries.get_job_followup_state(gc_id, job_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    job = next((item for item in jobs if item.id == job_id), None)
    if job is None:
        return _error(404, "job_id not found")

    return _success(
        {
            "job": _serialize_job(job),
            "recent_updates": recent_updates,
            "call_history": call_history,
            "audit_timeline": audit_timeline,
            "followup_state": followup_state,
        }
    )


@router.post("/jobs/{job_id}/open-items/{open_item_id}/draft-action", response_model=None)
async def draft_open_item_action(
    job_id: str,
    open_item_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Turn an unresolved change or approval item into a queued follow-through draft."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        jobs = await queries.get_active_jobs(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    job = next((item for item in jobs if item.id == job_id), None)
    if job is None:
        return _error(404, "job_id not found")

    open_item = next((item for item in job.open_items if item.id == open_item_id), None)
    if open_item is None:
        return _error(404, "open_item_id not found")

    action = _open_item_action_definition(open_item)
    if action is None:
        return _error(400, "open item does not support a follow-through draft")

    try:
        existing_draft = await _find_existing_open_item_draft(gc_id, open_item.id)
        if existing_draft is None:
            draft = _build_open_item_followthrough_draft(job, open_item)
            if draft is None:
                return _error(400, "open item does not support a follow-through draft")
            await queries.insert_drafts([draft], gc_id)
            existing_draft = draft
        await queries.update_open_item_status(open_item.id, gc_id, "in-progress", action_stage="drafted")
    except DatabaseError as exc:
        return _error(500, str(exc))

    updated_open_item = open_item.model_copy(update={"status": "in-progress", "action_stage": "drafted"})
    payload = OpenItemDraftActionResponse(
        draft=existing_draft.model_dump(mode="json"),
        open_item=_serialize_open_item(updated_open_item),
    )
    return _success(payload.model_dump(mode="json"))


@router.post("/jobs/{job_id}/open-items/{open_item_id}/lifecycle", response_model=None)
async def advance_open_item_lifecycle(
    job_id: str,
    open_item_id: str,
    payload: OpenItemLifecycleRequest,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Advance one unresolved change or approval item after office review."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        jobs = await queries.get_active_jobs(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    job = next((item for item in jobs if item.id == job_id), None)
    if job is None:
        return _error(404, "job_id not found")

    open_item = next((item for item in job.open_items if item.id == open_item_id), None)
    if open_item is None:
        return _error(404, "open_item_id not found")

    normalized_stage = payload.stage.strip().lower()
    validation_error = _validate_open_item_lifecycle_stage(open_item, normalized_stage)
    if validation_error is not None:
        return _error(400, validation_error)

    try:
        if normalized_stage == "completed":
            await queries.resolve_open_item(open_item.id, gc_id, action_stage="completed")
        else:
            await queries.update_open_item_status(
                open_item.id,
                gc_id,
                "in-progress",
                action_stage=normalized_stage,
            )
    except DatabaseError as exc:
        return _error(500, str(exc))

    updated_open_item = _updated_open_item_for_stage(open_item, normalized_stage)
    response_payload = OpenItemLifecycleResponse(open_item=_serialize_open_item(updated_open_item))
    return _success(response_payload.model_dump(mode="json"))


__all__ = [
    "router",
    "list_jobs",
    "job_detail",
    "refresh_briefing",
    "draft_open_item_action",
    "advance_open_item_lifecycle",
]
