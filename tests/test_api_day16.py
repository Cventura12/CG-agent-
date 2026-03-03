from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from gc_agent.state import AgentState, Draft

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


@pytest.mark.asyncio
async def test_post_quote_returns_quote_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "00000000-0000-0000-0000-000000000001:test-key")
    persisted: list[dict[str, object]] = []

    async def _fake_run_single_estimate(
        raw_input: str,
        *,
        session_id: str = "",
        gc_id: str = "",
        approval_status: str = "pending",
        edited_scope_of_work: str = "",
        edited_total_price: float | None = None,
    ) -> AgentState:
        _ = (session_id, gc_id, approval_status, edited_scope_of_work, edited_total_price)
        return AgentState(
            mode="estimate",
            raw_input=raw_input,
            active_job_id="job-api-quote-1",
            quote_draft={
                "company_name": "GC Agent Roofing",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace shingles at 14 Oak Lane.",
                "total_price": 14250.0,
                "exclusions": ["Decking replacement if hidden damage is found"],
            },
            rendered_quote="QUOTE READY",
        )

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)

    async def _fake_upsert_quote_draft(**kwargs: object) -> None:
        persisted.append(dict(kwargs))

    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)

    transport = httpx.ASGITransport(app=api_app_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/quote",
            json={"input": "Need a quote for 32 squares at 14 Oak Lane"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_draft"]["project_address"] == "14 Oak Lane"
    assert payload["quote_draft"]["total_price"] == 14250.0
    assert payload["rendered_quote"] == "QUOTE READY"
    assert len(persisted) == 1
    assert persisted[0]["gc_id"] == "00000000-0000-0000-0000-000000000001"
    assert persisted[0]["job_id"] == "job-api-quote-1"


@pytest.mark.asyncio
async def test_get_queue_returns_pending_items(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_get_pending_drafts(gc_id: str) -> list[Draft]:
        assert gc_id == "gc-demo"
        return [
            Draft(
                id="draft-queued-1",
                job_id="job-1",
                job_name="Miller Job",
                type="owner-update",
                title="Reschedule inspection",
                content="Move the inspection to Thursday.",
                why="Crew delay reported.",
                status="queued",
            ),
            Draft(
                id="draft-pending-2",
                job_id="job-2",
                job_name="Oak Project",
                type="follow-up",
                title="Customer follow-up",
                content="Checking in on quote approval.",
                why="48-hour follow-up trigger fired.",
                status="pending",
            ),
        ]

    monkeypatch.setattr(api_module.queries, "get_pending_drafts", _fake_get_pending_drafts)

    transport = httpx.ASGITransport(app=api_app_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(
            "/queue",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert [item["status"] for item in payload["items"]] == ["queued", "pending"]


@pytest.mark.asyncio
async def test_post_queue_approve_updates_status_and_triggers_send(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    updated_statuses: list[tuple[str, str]] = []
    send_calls: list[str] = []

    async def _fake_get_draft_record(draft_id: str) -> dict[str, str] | None:
        assert draft_id == "draft-123"
        return {"id": draft_id, "gc_id": "gc-demo"}

    async def _fake_update_draft_status(
        draft_id: str,
        status: str,
        edited_content: str | None = None,
    ) -> None:
        _ = edited_content
        updated_statuses.append((draft_id, status))

    async def _fake_get_draft_by_id(draft_id: str) -> Draft | None:
        assert draft_id == "draft-123"
        return Draft(
            id=draft_id,
            job_id="job-1",
            job_name="Miller Job",
            type="owner-update",
            title="Reschedule inspection",
            content="Move the inspection to Thursday.",
            why="Crew delay reported.",
            status="approved",
        )

    async def _fake_send_and_track(draft: Draft) -> dict[str, str]:
        send_calls.append(draft.id)
        return {"status": "queued-for-send", "draft_id": draft.id}

    monkeypatch.setattr(api_module.queries, "get_draft_record", _fake_get_draft_record)
    monkeypatch.setattr(api_module.queries, "update_draft_status", _fake_update_draft_status)
    monkeypatch.setattr(api_module.queries, "get_draft_by_id", _fake_get_draft_by_id)
    monkeypatch.setattr(api_module, "send_and_track", _fake_send_and_track)

    transport = httpx.ASGITransport(app=api_app_module.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/queue/draft-123/approve",
            json={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["draft"]["status"] == "approved"
    assert payload["send_result"]["status"] == "queued-for-send"
    assert updated_statuses == [("draft-123", "approved")]
    assert send_calls == ["draft-123"]
