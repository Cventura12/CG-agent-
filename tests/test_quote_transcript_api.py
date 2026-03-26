from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from gc_agent.state import AgentState

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_quote_route_links_transcript_and_prefills_customer_name(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")
    persisted: list[dict[str, object]] = []
    transcript_updates: list[dict[str, object]] = []

    async def _fake_run_single_estimate(
        raw_input: str,
        *,
        session_id: str = "",
        gc_id: str = "",
        approval_status: str = "pending",
        edited_scope_of_work: str = "",
        edited_total_price: float | None = None,
        uploaded_files: list[dict[str, object]] | None = None,
    ) -> AgentState:
        _ = (session_id, gc_id, approval_status, edited_scope_of_work, edited_total_price, uploaded_files)
        assert "Call transcript estimate request" in raw_input
        return AgentState(
            mode="estimate",
            active_job_id="",
            trace_id="trace-quote-from-transcript",
            quote_draft={
                "company_name": "Arbor Agent",
                "scope_of_work": "Prepare an exterior paint estimate.",
                "total_price": 9800.0,
                "exclusions": [],
            },
            rendered_quote="Transcript-derived quote",
        )

    async def _fake_upsert_quote_draft(**kwargs: object) -> None:
        persisted.append(dict(kwargs))

    async def _fake_get_call_transcript_by_id(transcript_id: str, gc_id: str):
        assert transcript_id == "ct-1"
        assert gc_id == "gc-demo"
        return {
            "id": "ct-1",
            "gc_id": "gc-demo",
            "job_id": "job-9",
            "quote_id": "",
            "caller_name": "Taylor Brooks",
            "metadata": {"match_source": "explicit_job"},
        }

    async def _fake_update_call_transcript(
        transcript_id: str,
        gc_id: str,
        **kwargs: object,
    ) -> None:
        transcript_updates.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)
    monkeypatch.setattr(api_module.queries, "get_call_transcript_by_id", _fake_get_call_transcript_by_id)
    monkeypatch.setattr(api_module.queries, "update_call_transcript", _fake_update_call_transcript)

    async with _client() as client:
        response = await client.post(
            "/quote",
            json={
                "input": "Call transcript estimate request\nSummary: Caller wants a first-pass estimate.",
                "contractor_id": "gc-demo",
                "transcript_id": "ct-1",
                "job_id": "job-9",
            },
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["active_job_id"] == "job-9"
    assert payload["quote_draft"]["customer_name"] == "Taylor Brooks"
    assert len(persisted) == 1
    assert persisted[0]["job_id"] == "job-9"
    assert persisted[0]["quote_draft"]["customer_name"] == "Taylor Brooks"
    assert len(transcript_updates) == 1
    assert transcript_updates[0]["transcript_id"] == "ct-1"
    assert transcript_updates[0]["job_id"] == "job-9"
    assert transcript_updates[0]["quote_id"] == payload["quote_id"]
    assert transcript_updates[0]["metadata"]["quote_prefill_used"] is True

