from __future__ import annotations

import pytest

from gc_agent.nodes.send_and_track import send_and_track
from gc_agent.state import Draft, OpenItem
from gc_agent.db import queries


@pytest.mark.asyncio
async def test_send_and_track_creates_quote_tracking_open_item(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded: dict[str, object] = {}

    async def _fake_get_draft_record(draft_id: str) -> dict[str, object]:
        assert draft_id == "draft-001"
        return {"gc_id": "00000000-0000-0000-0000-000000000001"}

    async def _fake_insert_open_item(item: OpenItem, gc_id: str) -> None:
        recorded["item"] = item
        recorded["gc_id"] = gc_id

    monkeypatch.setattr(queries, "get_draft_record", _fake_get_draft_record)
    monkeypatch.setattr(queries, "insert_open_item", _fake_insert_open_item)

    draft = Draft(
        id="draft-001",
        job_id="job-001",
        job_name="Riverside Medical TI",
        type="follow-up",
        title="Quote ready to send",
        content="Please review the attached quote.",
        why="Approved by contractor",
    )

    result = await send_and_track(draft)

    assert result["status"] == "queued-for-send"
    assert result["channel"] == "email-or-sms-placeholder"
    assert result["open_item_id"]
    assert result["follow_up_due_date"]
    assert recorded["gc_id"] == "00000000-0000-0000-0000-000000000001"
    assert recorded["item"].type == "quote"
