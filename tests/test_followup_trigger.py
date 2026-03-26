from __future__ import annotations

from datetime import datetime, timedelta, timezone
from importlib import import_module
from typing import Any

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


def _install_quote_delivery_runtime(
    monkeypatch: pytest.MonkeyPatch,
    *,
    approval_status: str = "approved",
) -> tuple[list[dict[str, Any]], list[tuple[str, str, str]]]:
    """Install quote record + delivery log fakes for reminder execution tests."""
    delivery_logs: list[dict[str, Any]] = [
        {
            "id": "qdl-initial",
            "quote_id": "quote-runtime-1",
            "gc_id": "00000000-0000-0000-0000-000000000001",
            "job_id": "estimate-job-001",
            "trace_id": "trace-runtime-1",
            "channel": "sms",
            "destination": "+14235550000",
            "recipient_name": "Taylor",
            "message_preview": "Initial quote delivery",
            "delivery_status": "delivered",
            "provider_message_id": "SM-initial",
            "error_message": "",
            "created_at": "2026-03-05T12:00:00+00:00",
        }
    ]
    send_calls: list[tuple[str, str, str]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        if quote_id != "quote-runtime-1":
            return None
        return {
            "id": quote_id,
            "gc_id": "00000000-0000-0000-0000-000000000001",
            "job_id": "estimate-job-001",
            "trace_id": "trace-runtime-1",
            "approval_status": approval_status,
            "quote_draft": {
                "company_name": "Arbor Roofing",
                "project_address": "500 Oak Meadow",
                "scope_of_work": "Replace the hail-damaged roofing system at 500 Oak Meadow.",
                "total_price": 1450.0,
                "line_items": [],
                "exclusions": [],
            },
            "final_quote_draft": {},
        }

    async def _fake_get_quote_delivery_attempts(quote_id: str, gc_id: str) -> list[dict[str, Any]]:
        assert quote_id == "quote-runtime-1"
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        return [dict(row) for row in reversed(delivery_logs)]

    async def _fake_insert_quote_delivery_log(**kwargs: Any) -> str:
        entry = dict(kwargs)
        entry.setdefault("id", f"qdl-{len(delivery_logs) + 1}")
        entry.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        delivery_logs.append(entry)
        return str(entry["id"])

    async def _fake_deliver_followup_message(channel: str, destination: str, body: str) -> str:
        send_calls.append((channel, destination, body))
        return f"provider-{len(send_calls)}"

    async def _fake_deliver_followup_email(
        destination: str,
        subject: str,
        body: str,
        *,
        pdf_bytes: bytes,
        quote_id: str,
    ) -> str:
        send_calls.append(("email", destination, body))
        return "<email-message-id>"

    async def _fake_generate_followup_message(job_name: str, address: str, attempt_number: int) -> str:
        return f"Follow up #{attempt_number} for {job_name or address}"

    monkeypatch.setattr(followup_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        followup_module.queries,
        "get_quote_delivery_attempts",
        _fake_get_quote_delivery_attempts,
    )
    monkeypatch.setattr(
        followup_module.queries,
        "insert_quote_delivery_log",
        _fake_insert_quote_delivery_log,
    )
    monkeypatch.setattr(followup_module, "_deliver_followup_message", _fake_deliver_followup_message)
    monkeypatch.setattr(followup_module, "_deliver_followup_email", _fake_deliver_followup_email)
    monkeypatch.setattr(followup_module, "_generate_followup_message", _fake_generate_followup_message)
    monkeypatch.setattr(followup_module, "render_quote_pdf", lambda *_args, **_kwargs: b"%PDF-1.4 followup")
    return delivery_logs, send_calls


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
async def test_stop_quote_followup_marks_open_item_stopped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-stop-1",
        "trace-stop-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )

    result = await followup_module.stop_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "quote-stop-1",
        now=datetime(2026, 3, 5, 13, 0, tzinfo=timezone.utc),
    )

    assert result["stopped"] is True
    assert result["reason"] == "manual_stop"
    assert open_items[0]["status"] == "resolved"
    assert open_items[0]["stop_reason"] == "manual_stop"
    assert open_items[0]["stopped_at"] == "2026-03-05T13:00:00+00:00"


@pytest.mark.asyncio
async def test_process_due_followups_sends_due_reminder_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)
    delivery_logs, send_calls = _install_quote_delivery_runtime(monkeypatch)

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-runtime-1",
        "trace-runtime-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    open_items[0]["next_due_at"] = "2026-03-05T10:00:00+00:00"
    open_items[0]["due_date"] = "2026-03-05"

    result = await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert result["processed_items"] == 1
    assert result["sent_reminders"] == 1
    assert result["failed_attempts"] == 0
    assert send_calls == [("sms", "+14235550000", "Follow up #1 for Oak Meadow Hail Claim")]
    assert len(delivery_logs) == 2
    assert str(delivery_logs[-1]["message_preview"]).startswith("[FOLLOWUP #1]")
    assert open_items[0]["reminder_count"] == 1
    assert open_items[0]["last_reminder_at"] == "2026-03-05T12:00:00+00:00"
    assert open_items[0]["status"] == "in-progress"


@pytest.mark.asyncio
async def test_process_due_followups_skips_manually_stopped_item(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)
    delivery_logs, send_calls = _install_quote_delivery_runtime(monkeypatch)

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-runtime-1",
        "trace-runtime-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    open_items[0]["next_due_at"] = "2026-03-05T10:00:00+00:00"
    open_items[0]["due_date"] = "2026-03-05"

    await followup_module.stop_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "quote-runtime-1",
        now=datetime(2026, 3, 5, 11, 0, tzinfo=timezone.utc),
    )

    result = await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert result["processed_items"] == 0
    assert result["sent_reminders"] == 0
    assert result["stopped_items"] == 0
    assert send_calls == []
    assert len(delivery_logs) == 1


@pytest.mark.asyncio
async def test_process_due_followups_does_not_duplicate_within_24_hours(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)
    delivery_logs, send_calls = _install_quote_delivery_runtime(monkeypatch)

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-runtime-1",
        "trace-runtime-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    open_items[0]["next_due_at"] = "2026-03-05T10:00:00+00:00"
    open_items[0]["due_date"] = "2026-03-05"

    await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc),
    )

    open_items[0]["next_due_at"] = "2026-03-05T12:30:00+00:00"
    second = await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 13, 0, tzinfo=timezone.utc),
    )

    assert second["processed_items"] == 1
    assert second["sent_reminders"] == 0
    assert second["skipped_recent"] == 1
    assert len(send_calls) == 1
    assert len(delivery_logs) == 2


@pytest.mark.asyncio
async def test_process_due_followups_stops_after_max_reminders(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)
    _delivery_logs, send_calls = _install_quote_delivery_runtime(monkeypatch)

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-runtime-1",
        "trace-runtime-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    open_items[0]["reminder_count"] = 1
    open_items[0]["next_due_at"] = "2026-03-05T10:00:00+00:00"
    open_items[0]["due_date"] = "2026-03-05"

    result = await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert result["processed_items"] == 1
    assert result["sent_reminders"] == 1
    assert result["stopped_items"] == 1
    assert len(send_calls) == 1
    assert open_items[0]["reminder_count"] == 2
    assert open_items[0]["stop_reason"] == "max_reminders_reached"
    assert open_items[0]["stopped_at"] == "2026-03-05T12:00:00+00:00"
    assert open_items[0]["status"] == "overdue"


@pytest.mark.asyncio
async def test_process_due_followups_stops_when_quote_discarded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    open_items, _drafts, _jobs = _install_followup_store(monkeypatch)
    _delivery_logs, send_calls = _install_quote_delivery_runtime(
        monkeypatch,
        approval_status="discarded",
    )

    await followup_module.ensure_quote_followup(
        "00000000-0000-0000-0000-000000000001",
        "estimate-job-001",
        "quote-runtime-1",
        "trace-runtime-1",
        final_quote={"project_address": "500 Oak Meadow", "total_price": 1450.0},
    )
    open_items[0]["next_due_at"] = "2026-03-05T10:00:00+00:00"
    open_items[0]["due_date"] = "2026-03-05"

    result = await followup_module.process_due_followups(
        "00000000-0000-0000-0000-000000000001",
        now=datetime(2026, 3, 5, 12, 0, tzinfo=timezone.utc),
    )

    assert result["processed_items"] == 1
    assert result["sent_reminders"] == 0
    assert result["stopped_items"] == 1
    assert send_calls == []
    assert open_items[0]["stop_reason"] == "quote_discarded"
    assert open_items[0]["status"] == "resolved"

