"""Google OAuth2 flow and credential management for Gmail and Calendar access."""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

LOGGER = logging.getLogger(__name__)

GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"
SCOPES = [GMAIL_SCOPE, CALENDAR_SCOPE]

_GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _client_id() -> str:
    return os.getenv("GOOGLE_CLIENT_ID", "").strip()


def _client_secret() -> str:
    return os.getenv("GOOGLE_CLIENT_SECRET", "").strip()


def _redirect_uri() -> str:
    return os.getenv("GOOGLE_REDIRECT_URI", "").strip()


def _configured() -> bool:
    return bool(_client_id() and _client_secret() and _redirect_uri())


def get_auth_url(gc_id: str) -> str:
    """Return the Google OAuth consent URL for the given gc_id."""
    if not _configured():
        raise RuntimeError("Google OAuth is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)")

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError as exc:
        raise RuntimeError("google-auth-oauthlib is not installed") from exc

    flow = Flow.from_client_config(
        client_config={
            "web": {
                "client_id": _client_id(),
                "client_secret": _client_secret(),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": _GOOGLE_TOKEN_URI,
                "redirect_uris": [_redirect_uri()],
            }
        },
        scopes=SCOPES,
        redirect_uri=_redirect_uri(),
    )
    auth_url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=gc_id,
    )
    return auth_url


async def exchange_code(gc_id: str, code: str) -> dict[str, Any]:
    """Exchange an OAuth authorization code for tokens and persist them."""
    if not _configured():
        raise RuntimeError("Google OAuth is not configured")

    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError as exc:
        raise RuntimeError("google-auth-oauthlib is not installed") from exc

    def _exchange() -> dict[str, Any]:
        flow = Flow.from_client_config(
            client_config={
                "web": {
                    "client_id": _client_id(),
                    "client_secret": _client_secret(),
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": _GOOGLE_TOKEN_URI,
                    "redirect_uris": [_redirect_uri()],
                }
            },
            scopes=SCOPES,
            redirect_uri=_redirect_uri(),
        )
        flow.fetch_token(code=code)
        creds = flow.credentials
        return {
            "access_token": creds.token or "",
            "refresh_token": creds.refresh_token or "",
            "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
            "scopes": list(creds.scopes or SCOPES),
        }

    token_data = await asyncio.to_thread(_exchange)
    await _save_tokens(gc_id, token_data)
    return token_data


async def _save_tokens(gc_id: str, token_data: dict[str, Any]) -> None:
    """Upsert OAuth tokens into google_integrations."""
    from gc_agent.db.client import get_client

    scopes = token_data.get("scopes") or SCOPES
    payload = {
        "gc_id": gc_id,
        "access_token": token_data["access_token"],
        "refresh_token": token_data["refresh_token"],
        "token_expiry": token_data.get("token_expiry"),
        "scopes": scopes,
        "gmail_enabled": GMAIL_SCOPE in scopes,
        "calendar_enabled": CALENDAR_SCOPE in scopes,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    def _upsert() -> None:
        get_client().table("google_integrations").upsert(
            payload,
            on_conflict="gc_id",
        ).execute()

    await asyncio.to_thread(_upsert)


async def get_valid_credentials(gc_id: str) -> Optional[Any]:
    """Return a valid Credentials object for gc_id, refreshing if needed."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
    except ImportError:
        LOGGER.error("google-auth is not installed")
        return None

    from gc_agent.db.client import get_client

    def _load() -> Optional[dict[str, Any]]:
        resp = (
            get_client()
            .table("google_integrations")
            .select("access_token,refresh_token,token_expiry,scopes")
            .eq("gc_id", gc_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return dict(rows[0]) if rows else None

    row = await asyncio.to_thread(_load)
    if not row:
        return None

    expiry: Optional[datetime] = None
    if row.get("token_expiry"):
        try:
            expiry_str = str(row["token_expiry"]).strip()
            if expiry_str.endswith("Z"):
                expiry_str = expiry_str[:-1] + "+00:00"
            expiry = datetime.fromisoformat(expiry_str)
        except Exception:
            expiry = None

    creds = Credentials(
        token=row["access_token"],
        refresh_token=row["refresh_token"],
        expiry=expiry,
        client_id=_client_id(),
        client_secret=_client_secret(),
        token_uri=_GOOGLE_TOKEN_URI,
        scopes=row.get("scopes") or SCOPES,
    )

    if creds.expired and creds.refresh_token:
        def _refresh() -> None:
            creds.refresh(Request())

        try:
            await asyncio.to_thread(_refresh)
            await _save_tokens(
                gc_id,
                {
                    "access_token": creds.token or "",
                    "refresh_token": creds.refresh_token or "",
                    "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
                    "scopes": list(creds.scopes or SCOPES),
                },
            )
        except Exception:
            LOGGER.exception("Failed to refresh Google token for gc_id=%s", gc_id)
            return None

    return creds


async def disconnect(gc_id: str) -> None:
    """Remove Google integration tokens for gc_id."""
    from gc_agent.db.client import get_client

    def _delete() -> None:
        get_client().table("google_integrations").delete().eq("gc_id", gc_id).execute()

    await asyncio.to_thread(_delete)


async def get_status(gc_id: str) -> dict[str, Any]:
    """Return the current Google integration status for gc_id."""
    from gc_agent.db.client import get_client

    def _load() -> Optional[dict[str, Any]]:
        resp = (
            get_client()
            .table("google_integrations")
            .select("gmail_enabled,calendar_enabled,scopes,gmail_last_checked,updated_at")
            .eq("gc_id", gc_id)
            .limit(1)
            .execute()
        )
        rows = resp.data or []
        return dict(rows[0]) if rows else None

    row = await asyncio.to_thread(_load)
    if not row:
        return {"connected": False, "gmail_enabled": False, "calendar_enabled": False}

    return {
        "connected": True,
        "gmail_enabled": bool(row.get("gmail_enabled")),
        "calendar_enabled": bool(row.get("calendar_enabled")),
        "scopes": row.get("scopes") or [],
        "gmail_last_checked": row.get("gmail_last_checked"),
        "updated_at": row.get("updated_at"),
    }


__all__ = [
    "get_auth_url",
    "exchange_code",
    "get_valid_credentials",
    "disconnect",
    "get_status",
    "GMAIL_SCOPE",
    "CALENDAR_SCOPE",
]
