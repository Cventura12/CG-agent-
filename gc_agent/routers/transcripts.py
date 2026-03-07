"""Transcript API endpoints for internal Clerk-authenticated transcript workflows."""

from __future__ import annotations

from importlib import import_module
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

router = APIRouter(tags=["transcripts"])


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for transcript endpoints."""
    return {
        "success": True,
        "data": data,
        "error": None,
    }


def _error(status_code: int, message: str) -> JSONResponse:
    """Return a standard error envelope."""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": message,
        },
    )


async def _resolve_gc_id(clerk_user_id: str) -> tuple[str | None, JSONResponse | None]:
    """Resolve internal gc_users.id for the authenticated Clerk user."""
    try:
        gc_id = await queries.get_gc_by_clerk_user_id(clerk_user_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))

    if not gc_id:
        return None, _error(403, "GC profile not registered")

    return gc_id, None


async def _get_transcript_quote_prefill(*args: object, **kwargs: object):
    """Lazily import transcript prefill service to keep import path light."""
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.get_transcript_quote_prefill(*args, **kwargs)


@router.get("/transcripts/{transcript_id}/quote-prefill", response_model=None)
async def get_quote_prefill(
    transcript_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Return a quote-workspace prefill payload derived from one transcript."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        prefill = await _get_transcript_quote_prefill(transcript_id, gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if prefill is None:
        return _error(404, "transcript_id not found")

    return _success(prefill.model_dump(mode="json"))


__all__ = ["router", "get_quote_prefill"]
