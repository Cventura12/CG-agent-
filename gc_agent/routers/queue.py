"""Draft queue API endpoints for read and action workflows."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.state import Draft

router = APIRouter(tags=["queue"])


class EditDraftRequest(BaseModel):
    """Payload for editing a queued draft before approval."""

    content: str = Field(min_length=1)


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for queue endpoints."""
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


def _serialize_draft(draft: Draft) -> dict[str, Any]:
    """Serialize Draft model into JSON-safe dictionary payload."""
    return draft.model_dump(mode="json")


async def _resolve_gc_id(clerk_user_id: str) -> tuple[str | None, JSONResponse | None]:
    """Resolve internal gc_users.id for authenticated Clerk user."""
    try:
        gc_id = await queries.get_gc_by_clerk_user_id(clerk_user_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))

    if not gc_id:
        return None, _error(403, "GC profile not registered")

    return gc_id, None


async def _authorized_draft_or_error(
    draft_id: str,
    gc_id: str,
) -> tuple[dict[str, Any] | None, JSONResponse | None]:
    """Validate draft existence and ownership before state-changing actions."""
    try:
        record = await queries.get_draft_record(draft_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))

    if record is None:
        return None, _error(404, "draft_id not found")

    draft_gc_id = str(record.get("gc_id", "")).strip()
    if draft_gc_id != gc_id:
        return None, _error(403, "draft does not belong to authenticated GC")

    return record, None


@router.get("/queue", response_model=None)
async def get_queue(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return queued drafts grouped by job for authenticated GC account."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        queued_drafts = await queries.get_queued_drafts(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    grouped: OrderedDict[str, dict[str, Any]] = OrderedDict()
    for draft in queued_drafts:
        if draft.job_id not in grouped:
            grouped[draft.job_id] = {
                "job_id": draft.job_id,
                "job_name": draft.job_name,
                "drafts": [],
            }
        grouped[draft.job_id]["drafts"].append(_serialize_draft(draft))

    return _success({"jobs": list(grouped.values())})


@router.post("/queue/{draft_id}/approve", response_model=None)
async def approve_draft(
    draft_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Approve a queued draft and return the updated draft representation."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    _, auth_error = await _authorized_draft_or_error(draft_id, gc_id)
    if auth_error is not None:
        return auth_error

    try:
        await queries.update_draft_status(draft_id, "approved")
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if updated is None:
        return _error(404, "draft_id not found")

    return _success(_serialize_draft(updated))


@router.post("/queue/{draft_id}/edit", response_model=None)
async def edit_draft(
    draft_id: str,
    payload: EditDraftRequest,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Save edited draft content, approve it, and return updated draft data."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    _, auth_error = await _authorized_draft_or_error(draft_id, gc_id)
    if auth_error is not None:
        return auth_error

    try:
        await queries.update_draft_status(draft_id, "approved", edited_content=payload.content)
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if updated is None:
        return _error(404, "draft_id not found")

    return _success(_serialize_draft(updated))


@router.post("/queue/{draft_id}/discard", response_model=None)
async def discard_draft(
    draft_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Discard a queued draft and return the updated draft representation."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    _, auth_error = await _authorized_draft_or_error(draft_id, gc_id)
    if auth_error is not None:
        return auth_error

    try:
        await queries.update_draft_status(draft_id, "discarded")
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if updated is None:
        return _error(404, "draft_id not found")

    return _success(_serialize_draft(updated))


@router.post("/queue/approve-all", response_model=None)
async def approve_all(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Approve all currently queued drafts for authenticated GC account."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        approved_count = await queries.approve_all_queued_drafts(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success({"approved_count": approved_count})


@router.get("/queue/history", response_model=None)
async def queue_history(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return the last 50 actioned drafts for authenticated GC account."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        history = await queries.get_actioned_drafts(gc_id, limit=50)
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success({"drafts": [_serialize_draft(draft) for draft in history]})


__all__ = [
    "router",
    "get_queue",
    "approve_draft",
    "edit_draft",
    "discard_draft",
    "approve_all",
    "queue_history",
]
