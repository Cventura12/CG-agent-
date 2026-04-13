"""Integrations API: Google OAuth connect/disconnect and status endpoints."""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse, RedirectResponse

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

LOGGER = logging.getLogger(__name__)

router = APIRouter(tags=["integrations"])


def _success(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "data": None, "error": message},
    )


async def _resolve_gc_id(clerk_user_id: str) -> tuple[str | None, JSONResponse | None]:
    try:
        gc_id = await queries.get_gc_by_clerk_user_id(clerk_user_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))
    if not gc_id:
        return None, _error(403, "GC profile not registered")
    return gc_id, None


@router.get("/integrations/google/auth-url", response_model=None)
async def google_auth_url(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return the Google OAuth consent URL for the authenticated GC."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        from gc_agent.integrations.google_auth import get_auth_url
        url = get_auth_url(gc_id)
    except RuntimeError as exc:
        return _error(503, str(exc))
    except Exception:
        LOGGER.exception("Failed generating Google auth URL gc_id=%s", gc_id)
        return _error(500, "Failed to generate Google auth URL")

    return _success({"url": url})


@router.get("/integrations/google/callback", response_model=None, include_in_schema=False)
async def google_oauth_callback(code: str = "", state: str = "", error: str = "") -> RedirectResponse:
    """Handle the Google OAuth redirect callback. Exchanges code and redirects to frontend."""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    integrations_path = "/integrations"

    if error or not code or not state:
        LOGGER.warning("Google OAuth callback error: error=%s code_present=%s state_present=%s", error, bool(code), bool(state))
        return RedirectResponse(url=f"{frontend_url}{integrations_path}?google_error=1")

    gc_id = state.strip()
    if not gc_id:
        return RedirectResponse(url=f"{frontend_url}{integrations_path}?google_error=1")

    try:
        from gc_agent.integrations.google_auth import exchange_code
        await exchange_code(gc_id, code)
        LOGGER.info("Google OAuth connected gc_id=%s", gc_id)
    except Exception:
        LOGGER.exception("Google OAuth token exchange failed gc_id=%s", gc_id)
        return RedirectResponse(url=f"{frontend_url}{integrations_path}?google_error=1")

    return RedirectResponse(url=f"{frontend_url}{integrations_path}?google_connected=1")


@router.get("/integrations/google/status", response_model=None)
async def google_integration_status(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return the current Google integration connection status."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        from gc_agent.integrations.google_auth import get_status
        status = await get_status(gc_id)
    except Exception:
        LOGGER.exception("Failed getting Google integration status gc_id=%s", gc_id)
        return _error(500, "Failed to check integration status")

    return _success(status)


@router.delete("/integrations/google/disconnect", response_model=None)
async def google_disconnect(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Disconnect Google integration and remove stored tokens."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        from gc_agent.integrations.google_auth import disconnect
        await disconnect(gc_id)
        LOGGER.info("Google integration disconnected gc_id=%s", gc_id)
    except Exception:
        LOGGER.exception("Failed disconnecting Google integration gc_id=%s", gc_id)
        return _error(500, "Failed to disconnect Google integration")

    return _success({"disconnected": True})


@router.post("/integrations/google/sync-calendar/{job_id}", response_model=None)
async def sync_job_calendar(job_id: str, current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Manually trigger a Google Calendar sync for one job."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        jobs = await queries.get_active_jobs(gc_id)
    except DatabaseError as exc:
        return _error(500, str(exc))

    job = next((j for j in jobs if j.id == job_id), None)
    if job is None:
        return _error(404, "job_id not found")

    try:
        from gc_agent.integrations.gcal import sync_job_to_calendar
        event_id = await sync_job_to_calendar(gc_id, job.model_dump(mode="json"))
    except Exception:
        LOGGER.exception("Calendar sync failed job_id=%s gc_id=%s", job_id, gc_id)
        return _error(500, "Calendar sync failed")

    if event_id is None:
        return _error(400, "Calendar sync skipped — job has no completion target date set")

    return _success({"event_id": event_id})


__all__ = ["router"]
