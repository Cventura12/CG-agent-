"""Referral invite endpoints for contractor-driven growth workflows."""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

router = APIRouter(tags=["referrals"])

VALID_CHANNELS = {"link", "sms", "email", "whatsapp"}


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for referral endpoints."""
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


def _web_app_base_url() -> str:
    """Resolve the web app URL used in referral share links."""
    return (
        os.getenv("WEB_APP_URL", "").strip()
        or os.getenv("FRONTEND_URL", "").strip()
        or "http://localhost:5173"
    )


def _share_url(invite_code: str) -> str:
    """Build a referral link that can be copied/sent by the contractor."""
    return f"{_web_app_base_url().rstrip('/')}/referral/{invite_code.strip().upper()}"


def _share_message(invite_code: str, invitee_name: str = "") -> str:
    """Build a short referral message contractors can send in one tap."""
    greeting = f"Hey {invitee_name.strip()}," if invitee_name.strip() else "Hey,"
    return (
        f"{greeting} I use GC Agent to turn field notes into quotes and manage my queue. "
        f"Use my referral link to check it out: {_share_url(invite_code)}"
    ).strip()


async def _resolve_gc_id(clerk_user_id: str) -> tuple[str | None, JSONResponse | None]:
    """Resolve internal gc_users.id for authenticated Clerk user."""
    try:
        gc_id = await queries.get_gc_by_clerk_user_id(clerk_user_id)
    except DatabaseError as exc:
        return None, _error(500, str(exc))

    if not gc_id:
        return None, _error(403, "GC profile not registered")

    return gc_id, None


class ReferralInviteRequest(BaseModel):
    """Payload for creating one referral invite."""

    channel: str = Field(default="link", min_length=1)
    destination: str = ""
    invitee_name: str = ""
    note: str = ""


@router.get("/referrals", response_model=None)
async def list_referrals(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return referral dashboard data for the authenticated contractor."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    try:
        invites = await queries.list_referral_invites(gc_id, limit=40)
        leads = await queries.list_referral_leads(gc_id, limit=40)
    except DatabaseError as exc:
        return _error(500, str(exc))

    accepted_count = sum(1 for invite in invites if str(invite.get("status", "")).lower() == "accepted")
    pending_count = sum(1 for invite in invites if str(invite.get("status", "")).lower() == "pending")

    return _success(
        {
            "summary": {
                "invites_total": len(invites),
                "invites_pending": pending_count,
                "invites_accepted": accepted_count,
                "leads_total": len(leads),
            },
            "share_base_url": f"{_web_app_base_url().rstrip('/')}/referral/",
            "invites": invites,
            "leads": leads,
        }
    )


@router.post("/referrals/invite", response_model=None)
async def create_referral_invite(
    payload: ReferralInviteRequest,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Create one referral invite and return a shareable link + message."""
    gc_id, gc_error = await _resolve_gc_id(current_gc)
    if gc_error is not None or gc_id is None:
        return gc_error  # type: ignore[return-value]

    channel = payload.channel.strip().lower() or "link"
    if channel not in VALID_CHANNELS:
        return _error(422, f"channel must be one of: {', '.join(sorted(VALID_CHANNELS))}")

    try:
        invite = await queries.insert_referral_invite(
            gc_id=gc_id,
            channel=channel,
            destination=payload.destination,
            invitee_name=payload.invitee_name,
            note=payload.note,
        )
    except DatabaseError as exc:
        return _error(500, str(exc))

    invite_code = str(invite.get("invite_code", "")).strip()
    return _success(
        {
            "invite": invite,
            "share_url": _share_url(invite_code),
            "share_message": _share_message(invite_code, payload.invitee_name),
        }
    )


__all__ = ["router", "list_referrals", "create_referral_invite"]
