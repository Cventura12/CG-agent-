"""Authentication and onboarding API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError

router = APIRouter(tags=["auth"])


class RegisterRequest(BaseModel):
    """Payload for first-time profile registration."""

    phone_number: str = Field(min_length=7)


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for auth endpoints."""
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


@router.get("/auth/me", response_model=None)
async def auth_me(current_gc: str = Depends(get_current_gc)) -> dict[str, Any] | JSONResponse:
    """Return profile for currently authenticated Clerk user."""
    try:
        profile = await queries.get_gc_profile_by_clerk_user_id(current_gc)
    except DatabaseError as exc:
        return _error(500, str(exc))

    if profile is None:
        return _error(404, "GC profile not found")

    return _success(
        {
            "gc_id": current_gc,
            "name": profile["name"],
            "phone_number": profile["phone_number"],
        }
    )


@router.post("/auth/register", response_model=None)
async def auth_register(
    payload: RegisterRequest,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Create or update GC profile linking Clerk user ID to phone number."""
    phone_number = payload.phone_number.strip()
    if not phone_number:
        return _error(400, "phone_number is required")

    try:
        profile = await queries.upsert_gc_registration(
            clerk_user_id=current_gc,
            phone_number=phone_number,
        )
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success(
        {
            "gc_id": current_gc,
            "name": profile["name"],
            "phone_number": profile["phone_number"],
        }
    )


__all__ = ["router", "auth_me", "auth_register"]
