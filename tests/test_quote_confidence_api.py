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
async def test_quote_response_includes_high_confidence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_run_single_estimate(*_: object, **__: object) -> AgentState:
        return AgentState(
            mode="estimate",
            gc_id="gc-demo",
            active_job_id="job-high-1",
            quote_draft={
                "company_name": "Arbor Roofing",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace shingles",
                "total_price": 12000.0,
                "exclusions": ["Decking not included"],
            },
            rendered_quote="QUOTE",
            job_scope={
                "extraction_confidence": "high",
                "missing_fields": [],
            },
            materials={"missing_prices": []},
            clarification_needed=False,
            errors=[],
        )

    async def _fake_upsert_quote_draft(**kwargs: object) -> None:
        assert isinstance(kwargs.get("estimate_confidence"), dict)

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)

    async with _client() as client:
        response = await client.post(
            "/quote",
            json={"input": "test", "contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["estimate_confidence"]["level"] == "high"
    assert payload["estimate_confidence"]["score"] >= 80


@pytest.mark.asyncio
async def test_quote_response_includes_low_confidence_when_missing_inputs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_run_single_estimate(*_: object, **__: object) -> AgentState:
        return AgentState(
            mode="estimate",
            gc_id="gc-demo",
            active_job_id="job-low-1",
            quote_draft={
                "company_name": "Arbor Roofing",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace shingles",
                "total_price": 12000.0,
                "exclusions": ["Decking not included"],
            },
            rendered_quote="QUOTE",
            job_scope={
                "extraction_confidence": "low",
                "missing_fields": ["pitch", "stories", "layer count"],
            },
            materials={"missing_prices": ["tear_off_per_square", "laminated_shingles_per_square"]},
            clarification_needed=True,
            errors=["partial parse"],
        )

    async def _fake_upsert_quote_draft(**_: object) -> None:
        return None

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)

    async with _client() as client:
        response = await client.post(
            "/quote",
            json={"input": "test", "contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["estimate_confidence"]["level"] == "low"
    assert payload["estimate_confidence"]["score"] < 60
    assert len(payload["estimate_confidence"]["missing_fields"]) == 3

