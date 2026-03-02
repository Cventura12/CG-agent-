from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from gc_agent.state import AgentState

api_module = import_module("gc_agent.api.main")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_quote_pdf_endpoint_returns_rendered_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")
    api_module.QUOTE_DOCUMENT_CACHE.clear()

    async def _fake_run_single_estimate(
        raw_input: str,
        *,
        session_id: str = "",
        gc_id: str = "",
        approval_status: str = "pending",
        edited_scope_of_work: str = "",
        edited_total_price: float | None = None,
    ) -> AgentState:
        _ = (raw_input, session_id, gc_id, approval_status, edited_scope_of_work, edited_total_price)
        return AgentState(
            mode="estimate",
            active_job_id="job-pdf-1",
            quote_draft={
                "company_name": "GC Agent Roofing",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace shingles at 14 Oak Lane.",
                "line_items": [{"item": "Architectural shingles", "quantity": 32, "unit": "sq", "total_cost": 6400}],
                "total_price": 14250.0,
                "exclusions": ["Decking replacement if hidden damage is found"],
                "approval_notes": "Valid for 14 days.",
            },
            rendered_quote="QUOTE READY",
        )

    def _fake_render_quote_pdf(quote_id: str, quote_draft: dict[str, object]) -> bytes:
        assert quote_id
        assert quote_draft["project_address"] == "14 Oak Lane"
        return b"%PDF-1.4 test quote pdf"

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module, "render_quote_pdf", _fake_render_quote_pdf)

    async with _client() as client:
        quote_response = await client.post(
            "/quote",
            json={"input": "Need a quote for 32 squares at 14 Oak Lane", "contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

        assert quote_response.status_code == 200
        quote_id = quote_response.json()["quote_id"]

        pdf_response = await client.get(
            f"/quote/{quote_id}/pdf",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert pdf_response.status_code == 200
    assert pdf_response.headers["content-type"] == "application/pdf"
    assert pdf_response.content.startswith(b"%PDF-1.4")


@pytest.mark.asyncio
async def test_quote_pdf_endpoint_rejects_wrong_contractor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-a:key-a,gc-b:key-b")
    api_module.QUOTE_DOCUMENT_CACHE.clear()
    api_module.QUOTE_DOCUMENT_CACHE["quote-locked"] = {
        "contractor_id": "gc-a",
        "quote_draft": {"company_name": "GC A"},
    }

    async with _client() as client:
        response = await client.get(
            "/quote/quote-locked/pdf",
            params={"contractor_id": "gc-b"},
            headers={"X-API-Key": "key-b"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "quote does not belong to contractor"
