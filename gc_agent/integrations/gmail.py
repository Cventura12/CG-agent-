"""Gmail inbound capture: poll for new emails and route them into the review queue."""

from __future__ import annotations

import asyncio
import base64
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

LOGGER = logging.getLogger(__name__)

# Only ingest emails that look job-relevant — avoids calendar invites, receipts, etc.
_JOB_KEYWORDS = re.compile(
    r"\b(quote|estimate|change order|scope|job|work|repair|install|replace|fix|"
    r"roof|plumb|electric|concrete|paint|demo|foundation|frame|drywall|hvac|"
    r"approval|invoice|schedule|delay|material|crew|sub|contract|site)\b",
    re.IGNORECASE,
)
_MAX_BODY_CHARS = 3000
_HISTORY_POLL_LIMIT = 25


def _decode_body(part: dict[str, Any]) -> str:
    """Decode a Gmail message part body from base64url."""
    data = part.get("body", {}).get("data", "")
    if not data:
        return ""
    try:
        return base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
    except Exception:
        return ""


def _extract_plain_text(payload: dict[str, Any]) -> str:
    """Recursively extract plain-text content from a Gmail message payload."""
    mime = payload.get("mimeType", "")
    if mime == "text/plain":
        return _decode_body(payload)
    if mime.startswith("multipart/"):
        for part in payload.get("parts", []):
            text = _extract_plain_text(part)
            if text.strip():
                return text
    return ""


def _header(payload: dict[str, Any], name: str) -> str:
    """Return the value of a named header from a Gmail message payload."""
    for h in payload.get("headers", []):
        if str(h.get("name", "")).lower() == name.lower():
            return str(h.get("value", "")).strip()
    return ""


def _is_job_relevant(subject: str, body: str) -> bool:
    """Return True when the email looks like a field communication."""
    combined = f"{subject} {body[:500]}"
    return bool(_JOB_KEYWORDS.search(combined))


async def _get_gmail_service(gc_id: str) -> Optional[Any]:
    """Build an authenticated Gmail API service for gc_id."""
    try:
        from googleapiclient.discovery import build
    except ImportError:
        LOGGER.error("google-api-python-client is not installed")
        return None

    from gc_agent.integrations.google_auth import get_valid_credentials

    creds = await get_valid_credentials(gc_id)
    if creds is None:
        return None

    def _build():
        return build("gmail", "v1", credentials=creds, cache_discovery=False)

    try:
        return await asyncio.to_thread(_build)
    except Exception:
        LOGGER.exception("Failed to build Gmail service for gc_id=%s", gc_id)
        return None


async def _fetch_new_messages(service: Any, history_id: Optional[str]) -> tuple[list[str], str]:
    """Fetch message IDs added since history_id; return (message_ids, new_history_id)."""

    def _list_history(start_id: str) -> tuple[list[str], str]:
        result = (
            service.users()
            .history()
            .list(
                userId="me",
                startHistoryId=start_id,
                historyTypes=["messageAdded"],
                maxResults=_HISTORY_POLL_LIMIT,
            )
            .execute()
        )
        msg_ids: list[str] = []
        for record in result.get("history", []):
            for added in record.get("messagesAdded", []):
                mid = added.get("message", {}).get("id")
                if mid:
                    msg_ids.append(mid)
        new_hid = str(result.get("historyId", start_id))
        return msg_ids, new_hid

    def _list_recent() -> tuple[list[str], str]:
        result = (
            service.users()
            .messages()
            .list(userId="me", labelIds=["INBOX", "UNREAD"], maxResults=_HISTORY_POLL_LIMIT)
            .execute()
        )
        msg_ids = [m["id"] for m in result.get("messages", []) if m.get("id")]
        profile = service.users().getProfile(userId="me").execute()
        hid = str(profile.get("historyId", ""))
        return msg_ids, hid

    try:
        if history_id:
            return await asyncio.to_thread(_list_history, history_id)
        else:
            return await asyncio.to_thread(_list_recent)
    except Exception:
        LOGGER.exception("Failed fetching Gmail messages")
        return [], history_id or ""


async def _fetch_message(service: Any, message_id: str) -> Optional[dict[str, Any]]:
    """Fetch a single Gmail message by ID."""
    def _get() -> dict[str, Any]:
        return (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )

    try:
        return await asyncio.to_thread(_get)
    except Exception:
        LOGGER.exception("Failed fetching Gmail message id=%s", message_id)
        return None


async def _route_email_to_queue(gc_id: str, subject: str, sender: str, body: str) -> bool:
    """Parse an inbound email and insert resulting drafts into draft_queue."""
    from gc_agent.db import queries
    from gc_agent.nodes.parse_update import parse_update
    from gc_agent.state import AgentState

    raw_input = (
        f"[Email from: {sender}]\n"
        f"Subject: {subject}\n\n"
        f"{body[:_MAX_BODY_CHARS]}"
    )

    state = AgentState(
        gc_id=gc_id,
        raw_input=raw_input,
        trace_id=uuid4().hex,
    )

    try:
        updated_state = await parse_update(state)
    except Exception:
        LOGGER.exception("parse_update failed for email from=%s gc_id=%s", sender, gc_id)
        return False

    parsed = updated_state.parsed_intent
    if not parsed or not parsed.drafts:
        return False

    try:
        await queries.insert_drafts(parsed.drafts, gc_id)
        LOGGER.info(
            "Gmail: inserted %s draft(s) from email sender=%s gc_id=%s",
            len(parsed.drafts),
            sender,
            gc_id,
        )
        return True
    except Exception:
        LOGGER.exception("Failed inserting email-sourced drafts gc_id=%s", gc_id)
        return False


async def _update_gmail_state(gc_id: str, history_id: str) -> None:
    """Persist the latest Gmail history_id and last_checked timestamp."""
    from gc_agent.db.client import get_client

    payload = {
        "gmail_last_checked": datetime.now(timezone.utc).isoformat(),
        "gmail_history_id": history_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }

    def _update() -> None:
        get_client().table("google_integrations").update(payload).eq("gc_id", gc_id).execute()

    await asyncio.to_thread(_update)


async def poll_gmail_for_gc(gc_id: str, history_id: Optional[str] = None) -> dict[str, int]:
    """Poll Gmail for new job-relevant emails and route them into the review queue.

    Returns counts: {"checked": N, "routed": N}
    """
    service = await _get_gmail_service(gc_id)
    if service is None:
        return {"checked": 0, "routed": 0}

    message_ids, new_history_id = await _fetch_new_messages(service, history_id)

    checked = 0
    routed = 0
    for mid in message_ids:
        msg = await _fetch_message(service, mid)
        if msg is None:
            continue

        payload = msg.get("payload", {})
        subject = _header(payload, "subject") or "(no subject)"
        sender = _header(payload, "from") or "unknown"
        body = _extract_plain_text(payload)

        if not _is_job_relevant(subject, body):
            continue

        checked += 1
        routed_ok = await _route_email_to_queue(gc_id, subject, sender, body)
        if routed_ok:
            routed += 1

    if new_history_id:
        await _update_gmail_state(gc_id, new_history_id)

    return {"checked": checked, "routed": routed}


async def poll_all_gmail_connections() -> None:
    """Scheduled job: poll Gmail for all GCs with an active Gmail integration."""
    from gc_agent.db.client import get_client

    def _load_connections() -> list[dict[str, Any]]:
        resp = (
            get_client()
            .table("google_integrations")
            .select("gc_id,gmail_history_id")
            .eq("gmail_enabled", True)
            .execute()
        )
        return [dict(row) for row in (resp.data or [])]

    try:
        connections = await asyncio.to_thread(_load_connections)
    except Exception:
        LOGGER.exception("Failed loading Gmail connections for scheduled poll")
        return

    if not connections:
        return

    LOGGER.info("Gmail poll: checking %s connection(s)", len(connections))
    for conn in connections:
        gc_id = str(conn.get("gc_id", "")).strip()
        history_id = str(conn.get("gmail_history_id") or "").strip() or None
        if not gc_id:
            continue
        try:
            result = await poll_gmail_for_gc(gc_id, history_id=history_id)
            if result["checked"] > 0:
                LOGGER.info(
                    "Gmail poll gc_id=%s checked=%s routed=%s",
                    gc_id,
                    result["checked"],
                    result["routed"],
                )
        except Exception:
            LOGGER.exception("Gmail poll failed gc_id=%s", gc_id)


__all__ = ["poll_gmail_for_gc", "poll_all_gmail_connections"]
