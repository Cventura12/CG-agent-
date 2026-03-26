from __future__ import annotations

import io
import zipfile
from importlib import import_module

import httpx
import pytest

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def _sheet_text(payload: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        return archive.read("xl/worksheets/sheet1.xml").decode("utf-8")


@pytest.mark.asyncio
async def test_quote_export_xlsx_returns_workbook_from_final_quote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_get_quote_draft_record(quote_id: str):
        if quote_id != "quote-export-1":
            return None
        return {
            "id": quote_id,
            "gc_id": "gc-demo",
            "job_id": "job-12",
            "trace_id": "trace-export-1",
            "approval_status": "edited",
            "quote_draft": {
                "company_name": "Arbor Roofing",
                "customer_name": "Taylor Brooks",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Original scope",
                "total_price": 14350.0,
                "line_items": [],
                "exclusions": [],
            },
            "final_quote_draft": {
                "company_name": "Arbor Roofing",
                "customer_name": "Taylor Brooks",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Edited scope ready for workbook export",
                "total_price": 14900.0,
                "line_items": [
                    {
                        "item": "Architectural shingles",
                        "quantity": 24,
                        "unit": "sq",
                        "unit_cost": 480,
                        "total_cost": 11520,
                    }
                ],
                "exclusions": ["Decking replacement beyond 6 sheets"],
            },
        }

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)

    async with _client() as client:
        response = await client.get(
            "/quote/quote-export-1/export/xlsx",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "gc-agent-quote-quote-export-1.xlsx" in response.headers["content-disposition"]
    sheet_xml = _sheet_text(response.content)
    assert "Edited scope ready for workbook export" in sheet_xml
    assert "Architectural shingles" in sheet_xml
    assert "Decking replacement beyond 6 sheets" in sheet_xml
    assert "14900.0" in sheet_xml


