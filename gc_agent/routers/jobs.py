"""Jobs API endpoints for active jobs, detail views, and briefings."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from fastapi_cache.decorator import cache

from gc_agent import graph
from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.state import Job

router = APIRouter(tags=["jobs"])


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
    if len(job.open_items) > 0:
        return "at-risk"
    return "on-track"


def _serialize_job(job: Job) -> dict[str, Any]:
    """Serialize Job model into JSON-safe payload including health field."""
    payload = job.model_dump(mode="json")
    payload["health"] = _compute_health(job)
    return payload


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
            "audit_timeline": audit_timeline,
            "followup_state": followup_state,
        }
    )


__all__ = ["router", "list_jobs", "job_detail", "refresh_briefing"]
