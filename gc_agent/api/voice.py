"""Public beta voice-session API for the Arbor workspace."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from gc_agent.api.auth import require_api_key
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.tools.call_recordings import download_call_recording_file
from gc_agent.webhooks.twilio import request_voice_session_transfer

router = APIRouter(dependencies=[Depends(require_api_key)], tags=["public-voice"])


class TransferVoiceSessionRequest(BaseModel):
    """Payload for a manual operator transfer request via the public API."""

    contractor_id: str = Field(min_length=1)
    target_number: str = ""
    note: str = Field(default="", max_length=500)


def _success(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"success": False, "data": None, "error": message})


@router.get("/voice/sessions", response_model=None)
async def list_recent_voice_sessions(
    contractor_id: str = Query(..., min_length=1),
    limit: int = 25,
) -> dict[str, Any] | JSONResponse:
    """Return recent live-call sessions for one contractor workspace."""
    try:
        sessions = await queries.list_voice_call_sessions(contractor_id, limit=max(limit, 1))
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success({"sessions": sessions})


@router.get("/voice/sessions/{session_id}", response_model=None)
async def get_voice_session_detail(
    session_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any] | JSONResponse:
    """Return one persisted voice session scoped to the requested contractor."""
    try:
        session = await queries.get_voice_call_session_for_gc(session_id, contractor_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if session is None:
        return _error(404, "voice session not found")

    return _success(session)


@router.post("/voice/sessions/{session_id}/transfer", response_model=None)
async def transfer_voice_session(
    session_id: str,
    payload: TransferVoiceSessionRequest,
) -> dict[str, Any] | JSONResponse:
    """Request a human transfer for one voice session from the public workspace."""
    try:
        existing = await queries.get_voice_call_session_for_gc(session_id, payload.contractor_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if existing is None:
        return _error(404, "voice session not found")

    try:
        session = await request_voice_session_transfer(
            session_id,
            target_number=payload.target_number,
            note=payload.note,
            initiated_by="beta-api",
        )
    except ValueError as exc:
        return _error(400, str(exc))
    except Exception as exc:
        return _error(500, str(exc))

    return _success(session.model_dump(mode="json"))


@router.get("/voice/sessions/{session_id}/recording", response_model=None)
async def get_voice_session_recording(
    session_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> Response | JSONResponse:
    """Stream one persisted voice session recording back to the workspace."""
    try:
        session = await queries.get_voice_call_session_for_gc(session_id, contractor_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if session is None:
        return _error(404, "voice session not found")

    storage_ref = str(session.get("recording_storage_ref", "")).strip()
    if not storage_ref:
        return _error(404, "recording not available")

    try:
        payload, content_type = download_call_recording_file(storage_ref)
    except Exception as exc:
        return _error(500, f"failed to load recording: {exc}")

    filename = f"{session_id}.wav" if content_type == "audio/wav" else f"{session_id}.mp3"
    return Response(
        content=payload,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


__all__ = [
    "router",
    "list_recent_voice_sessions",
    "get_voice_session_detail",
    "transfer_voice_session",
    "get_voice_session_recording",
]
