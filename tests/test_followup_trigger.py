from __future__ import annotations

from datetime import datetime, timedelta, timezone
from importlib import import_module

import pytest

from gc_agent.state import AgentState
from gc_agent.tools import supabase

followup_module = import_module("gc_agent.nodes.followup_trigger")


def _install_followup_store(monkeypatch: pytest.MonkeyPatch) -> tuple[list[dict[str, object]], list[dict[str, object]], list[dict[str, object]]]:
    """Install in-memory open_items, drafts, and jobs stores."""
    open_items: list[dict[str, object]] = []
    drafts: list[dict[str, object]] = []
    jobs: list[dict[str, object]] = [
        {
            "id": "estimate-job-001",
            "gc_id": "00000000-0000-0000-0000-000000000001",
            "name": "Oak Meadow Hail Claim",
            "type": "roof estimate",
            "status": "active",
            "address": "500 Oak Meadow",
            "contract_value": 0,
            "contract_type": "TBD",
            "est_completion": None,
            "notes": "",
        }
    ]

    def _list_open_items(gc_id: str, job_id: str | None = None) -> list[dict[str, object]]:
        rows = [row for row in open_items if row["gc_id"] == gc_id]
        if job_id:
            rows = [row for row in rows if row["job_id"] == job_id]
        return [dict(row) for row in rows]

    def _insert_open_item(row: dict[str, object]) -> dict[str, object]:
        open_items.append(dict(row))
        return dict(row)

    def _update_open_item(item_id: str, gc_id: str, fields: dict[str, object]) -> dict[str, object] | None:
        for row in open_items:
            if row["id"] == item_id and row["gc_id"] == gc_id:
                row.update(fields)
                return dict(row)
        return None

    def _list_draft_queue(gc_id: str) -> list[dict[str, object]]:
        return [dict(row) for row in drafts if row["gc_id"] == gc_id]

    def _upsert_draft_queue(row: dict[str, object]) -> dict[str, object]:
        for existing in drafts:
            if existing["id"] == row["id"]:
                existing.update(row)
                return dict(existing)
        drafts.append(dict(row))
        return dict(row)

    def _list_jobs(gc_id: str) -> list[dict[str, object]]:
        return [dict(row) for row in jobs if row["gc_id"] == gc_id]

    monkeypatch.setattr(supabase, "list_open_items", _list_open_items)
    monkeypatch.setattr(supabase, "insert_open_item", _insert_open_item)
    monkeypatch.setattr(supabase, "update_open_item", _update_open_item)
    monkeypatch.setattr(supabase, "list_draft_queue", _list_draft_queue)
    monkeypatch.setattr(supabase, "upsert_draft_queue", _upsert_draft_queue)
    monkeypatch.setattr(supabase, "list_jobs", _list_jobs)
    return open_items, drafts, jobs


def _approved_state() -> AgentState:
    """Build an approved estimate state for follow-up tests."""
    return AgentState(
        mode="estimate",
        gc_id="00000000-0000-0000-0000-000000000001",
        active_job_id="estimate-job-001",
        approval_status="approved",
        quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "project_address": "500 Oak Meadow",
            "scope_of_work": "Replace the hail-damaged roofing system at 500 Oak Meadow.",
            "total_price": 1450.0,
            "exclusions": ["Decking replacement if required"],
        },
        final_quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "project_address": "500 Oak Meadow",
            "scope_of_work": "Replace the hail-damaged roofing system at 500 Oak Meadow.",
            "total_price": 1450.0,
            "exclusions": ["Decking replacement if required"],
        },
        memory_context={},
    )


@pytest.mark.asyncio
async def test_followup_trigger_creates_open_item_after_approved_quote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, drafts, _jobs = _install_followup_store(monkeypatch)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    result = await followup_module.followup_trigger(_approved_state())

    assert len(open_items) == 1
    assert drafts == []
    assert open_items[0]["type"] == "followup"
    assert open_items[0]["job_id"] == "estimate-job-001"
    assert open_items[0]["status"] == "open"
    assert result["followup_count"] == 0
    assert result["stop_following_up"] is False
    assert result["memory_context"]["followup_open_item_created"] is True


@pytest.mark.asyncio
async def test_ensure_quote_followup_avoids_duplicate_open_items_for_same_quote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)

    first = await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-dup-1",
        "trace-dup-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    second = await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-dup-1",
        "trace-dup-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )

    assert len(open_items) == 1
    assert first["created"] is True
    assert second["created"] is False
    assert second["reason"] == "already_exists"
    assert "Quote ID: quote-dup-1" in str(open_items[0]["description"])


@pytest.mark.asyncio
async def test_check_due_followups_creates_pending_drafts_and_stops_after_second_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, drafts, _jobs = _install_followup_store(monkeypatch)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    await followup_module.followup_trigger(_approved_state())
    assert len(open_items) == 1

    first_run = await followup_module.check_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime.now(timezone.utc) + timedelta(days=3),
    )

    assert first_run["created_drafts"] == 1
    assert first_run["followup_count"] == 1
    assert first_run["stop_following_up"] is False
    assert len(drafts) == 1
    assert drafts[0]["status"] == "pending"
    assert drafts[0]["type"] == "follow-up"
    assert open_items[0]["status"] == "in-progress"

    second_run = await followup_module.check_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime.now(timezone.utc) + timedelta(days=6),
    )

    assert second_run["created_drafts"] == 1
    assert second_run["followup_count"] == 2
    assert second_run["stop_following_up"] is True
    assert len(drafts) == 2
    assert open_items[0]["status"] == "overdue"
