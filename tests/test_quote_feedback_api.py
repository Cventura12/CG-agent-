from __future__ import annotations

from importlib import import_module
from typing import Any

import httpx
import pytest

from gc_agent.state import AgentState

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_quote_approve_persists_feedback_and_updates_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")
    finalized: list[dict[str, Any]] = []
    memory_calls: list[AgentState] = []
    followup_calls: list[dict[str, Any]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-1":
            return None
        return {
            "id": "quote-1",
            "gc_id": "gc-demo",
            "job_id": "job-11",
            "trace_id": "trace-11",
            "quote_draft": {
                "company_name": "Arbor Roofing",
                "scope_of_work": "Replace shingles on Oak Street",
                "total_price": 12000.0,
                "line_items": [{"item": "shingles", "quantity": 30}],
            },
        }

    async def _fake_update_memory(state: AgentState) -> dict[str, object]:
        memory_calls.append(state)
        return {
            "memory_context": {
                "memory_updated": True,
                "last_change_summary": "Approved without edits.",
            }
        }

    async def _fake_finalize_quote_draft_feedback(**kwargs: Any) -> None:
        finalized.append(dict(kwargs))

    async def _fake_ensure_quote_followup(
        contractor_id: str,
        job_id: str,
        quote_id: str,
        trace_id: str,
        *,
        final_quote: dict[str, Any] | None = None,
        due_in_hours: int = 48,
    ) -> dict[str, Any]:
        followup_calls.append(
            {
                "contractor_id": contractor_id,
                "job_id": job_id,
                "quote_id": quote_id,
                "trace_id": trace_id,
                "final_quote": dict(final_quote or {}),
                "due_in_hours": due_in_hours,
            }
        )
        return {"created": True, "open_item_id": "followup-quote-1", "reason": "created"}

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module, "update_memory", _fake_update_memory)
    monkeypatch.setattr(api_module.queries, "finalize_quote_draft_feedback", _fake_finalize_quote_draft_feedback)
    monkeypatch.setattr(api_module, "ensure_quote_followup", _fake_ensure_quote_followup)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-1/approve",
            json={"contractor_id": "gc-demo", "feedback_note": "Looks good"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status"] == "approved"
    assert payload["memory_updated"] is True
    assert payload["was_edited"] is False
    assert payload["quote_delta"]["changed"] is False
    assert len(memory_calls) == 1
    assert memory_calls[0].approval_status == "approved"
    assert len(finalized) == 1
    assert finalized[0]["approval_status"] == "approved"
    assert finalized[0]["feedback_note"] == "Looks good"
    assert payload["followup_created"] is True
    assert payload["followup_open_item_id"] == "followup-quote-1"
    assert len(followup_calls) == 1
    assert followup_calls[0]["job_id"] == "job-11"
    assert followup_calls[0]["quote_id"] == "quote-1"


@pytest.mark.asyncio
async def test_quote_edit_persists_delta_and_updates_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")
    finalized: list[dict[str, Any]] = []
    memory_calls: list[AgentState] = []
    followup_calls: list[dict[str, Any]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-2":
            return None
        return {
            "id": "quote-2",
            "gc_id": "gc-demo",
            "job_id": "job-22",
            "trace_id": "trace-22",
            "quote_draft": {
                "company_name": "Arbor Roofing",
                "scope_of_work": "Replace shingles",
                "total_price": 15000.0,
                "line_items": [{"item": "shingles", "quantity": 30}],
            },
        }

    async def _fake_update_memory(state: AgentState) -> dict[str, object]:
        memory_calls.append(state)
        return {
            "memory_context": {
                "memory_updated": True,
                "last_change_summary": "Edited before approval.",
            }
        }

    async def _fake_finalize_quote_draft_feedback(**kwargs: Any) -> None:
        finalized.append(dict(kwargs))

    async def _fake_ensure_quote_followup(
        contractor_id: str,
        job_id: str,
        quote_id: str,
        trace_id: str,
        *,
        final_quote: dict[str, Any] | None = None,
        due_in_hours: int = 48,
    ) -> dict[str, Any]:
        followup_calls.append(
            {
                "contractor_id": contractor_id,
                "job_id": job_id,
                "quote_id": quote_id,
                "trace_id": trace_id,
                "final_quote": dict(final_quote or {}),
                "due_in_hours": due_in_hours,
            }
        )
        return {"created": True, "open_item_id": "followup-quote-2", "reason": "created"}

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module, "update_memory", _fake_update_memory)
    monkeypatch.setattr(api_module.queries, "finalize_quote_draft_feedback", _fake_finalize_quote_draft_feedback)
    monkeypatch.setattr(api_module, "ensure_quote_followup", _fake_ensure_quote_followup)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-2/edit",
            json={
                "contractor_id": "gc-demo",
                "edited_scope_of_work": "Replace shingles and upgrade flashing.",
                "edited_total_price": 16500.0,
                "feedback_note": "Added flashing line item",
            },
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status"] == "edited"
    assert payload["was_edited"] is True
    assert payload["memory_updated"] is True
    assert "total_price" in payload["quote_delta"]["changed_fields"]
    assert "scope_of_work" in payload["quote_delta"]["changed_fields"]
    assert len(memory_calls) == 1
    assert memory_calls[0].approval_status == "edited"
    assert memory_calls[0].final_quote_draft["total_price"] == 16500.0
    assert len(finalized) == 1
    assert finalized[0]["was_edited"] is True
    assert finalized[0]["approval_status"] == "edited"
    assert payload["followup_created"] is True
    assert payload["followup_open_item_id"] == "followup-quote-2"
    assert len(followup_calls) == 1
    assert followup_calls[0]["final_quote"]["total_price"] == 16500.0


@pytest.mark.asyncio
async def test_quote_discard_persists_feedback_without_memory_update(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")
    finalized: list[dict[str, Any]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-3":
            return None
        return {
            "id": "quote-3",
            "gc_id": "gc-demo",
            "trace_id": "trace-33",
            "quote_draft": {
                "scope_of_work": "Replace roof",
                "total_price": 10000.0,
            },
        }

    async def _fake_finalize_quote_draft_feedback(**kwargs: Any) -> None:
        finalized.append(dict(kwargs))

    async def _unexpected_update_memory(_: AgentState) -> dict[str, object]:
        raise AssertionError("discard route should not call update_memory")

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module.queries, "finalize_quote_draft_feedback", _fake_finalize_quote_draft_feedback)
    monkeypatch.setattr(api_module, "update_memory", _unexpected_update_memory)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-3/discard",
            json={"contractor_id": "gc-demo", "feedback_note": "Customer paused project"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["approval_status"] == "discarded"
    assert payload["memory_updated"] is False
    assert payload["quote_delta"]["discarded"] is True
    assert len(finalized) == 1
    assert finalized[0]["approval_status"] == "discarded"
    assert finalized[0]["feedback_note"] == "Customer paused project"

