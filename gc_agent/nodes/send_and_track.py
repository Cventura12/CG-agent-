"""Send-and-track placeholder used by Day 16 queue approvals."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.state import Draft, OpenItem


async def send_and_track(draft: Draft) -> dict[str, Any]:
    """Record a tracked outbound quote/follow-up item after approval."""
    open_item_id = ""
    follow_up_due_date = (datetime.now(timezone.utc) + timedelta(hours=48)).date()

    try:
        record = await queries.get_draft_record(draft.id)
        gc_id = str((record or {}).get("gc_id", "")).strip()
        if gc_id:
            open_item_id = f"oi-{uuid4().hex[:12]}"
            await queries.insert_open_item(
                OpenItem(
                    id=open_item_id,
                    job_id=draft.job_id,
                    type="quote",
                    description=f"Awaiting customer response to approved draft: {draft.title}",
                    owner="Customer",
                    status="open",
                    days_silent=0,
                    due_date=follow_up_due_date,
                ),
                gc_id,
            )
    except DatabaseError:
        open_item_id = ""

    return {
        "status": "queued-for-send",
        "draft_id": draft.id,
        "job_id": draft.job_id,
        "channel": "email-or-sms-placeholder",
        "open_item_id": open_item_id,
        "follow_up_due_date": follow_up_due_date.isoformat(),
    }


__all__ = ["send_and_track"]
