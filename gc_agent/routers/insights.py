"""Cross-job insight endpoints for operational savings opportunities."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

router = APIRouter(tags=["insights"])


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for insight endpoints."""
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


@router.get("/insights/multi-job", response_model=None)
async def multi_job_insights(
    horizon_days: int = Query(default=14, ge=3, le=60),
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Return grouped material-order opportunities across active jobs."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        payload = await queries.get_multi_job_insights(gc_id, horizon_days=horizon_days)
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success(payload)


__all__ = ["router", "multi_job_insights"]
