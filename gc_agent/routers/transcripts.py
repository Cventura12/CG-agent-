"""Transcript API endpoints for internal Clerk-authenticated transcript workflows."""

from __future__ import annotations

from importlib import import_module
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

router = APIRouter(tags=["transcripts"])


class LinkTranscriptJobRequest(BaseModel):
    """Payload for manually linking an inbox transcript to an existing job."""

    job_id: str = Field(min_length=1)


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


async def _link_transcript_to_job(*args: object, **kwargs: object):
    """Lazily import transcript linking service."""
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.link_transcript_to_job(*args, **kwargs)


async def _mark_transcript_reviewed(*args: object, **kwargs: object):
    """Lazily import transcript review state helper."""
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.mark_transcript_reviewed(*args, **kwargs)


async def _discard_transcript(*args: object, **kwargs: object):
    """Lazily import transcript discard helper."""
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.discard_transcript(*args, **kwargs)


async def _log_transcript_as_update(*args: object, **kwargs: object):
    """Lazily import transcript-to-update helper."""
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.log_transcript_as_update(*args, **kwargs)


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


@router.post("/transcripts/{transcript_id}/link-job", response_model=None)
async def link_transcript_job(
    transcript_id: str,
    payload: LinkTranscriptJobRequest,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Link a transcript inbox item to a job and create a job-backed review draft."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        result = await _link_transcript_to_job(transcript_id, gc_id, payload.job_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if result is None:
        return _error(404, "transcript_id not found")

    return _success(result)


@router.post("/transcripts/{transcript_id}/mark-reviewed", response_model=None)
async def mark_transcript_reviewed(
    transcript_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Mark an unlinked transcript inbox item as reviewed."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        result = await _mark_transcript_reviewed(transcript_id, gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if result is None:
        return _error(404, "transcript_id not found")

    return _success({"transcript_id": transcript_id, "review_state": "reviewed"})


@router.post("/transcripts/{transcript_id}/discard", response_model=None)
async def discard_transcript(
    transcript_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Discard an unlinked transcript inbox item."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        result = await _discard_transcript(transcript_id, gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if result is None:
        return _error(404, "transcript_id not found")

    return _success({"transcript_id": transcript_id, "review_state": "discarded"})


@router.post("/transcripts/{transcript_id}/log-update", response_model=None)
async def log_transcript_update(
    transcript_id: str,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Convert a linked transcript into the existing update-log + draft workflow."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        result = await _log_transcript_as_update(transcript_id, gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if result is None:
        return _error(404, "transcript_id not found")

    return _success(result)


__all__ = [
    "router",
    "get_quote_prefill",
    "link_transcript_job",
    "mark_transcript_reviewed",
    "discard_transcript",
    "log_transcript_update",
]
