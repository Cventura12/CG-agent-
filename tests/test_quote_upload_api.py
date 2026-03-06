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
async def test_quote_upload_pdf_routes_through_storage_and_persists_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
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
        uploaded_files: list[dict[str, object]] | None = None,
    ) -> AgentState:
        _ = (session_id, gc_id, approval_status, edited_scope_of_work, edited_total_price)
        assert raw_input == "Need a quote for this insurance packet"
        assert uploaded_files
        assert uploaded_files[0]["storage_ref"] == "supabase://quote-intake/quotes/gc-demo/scope.pdf"
        return AgentState(
            mode="estimate",
            raw_input=raw_input,
            active_job_id="job-upload-pdf-1",
            trace_id="trace-upload-pdf-1",
            uploaded_files=[dict(item) for item in uploaded_files or []],
            quote_draft={
                "company_name": "GC Agent",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace roof system per uploaded scope.",
                "total_price": 14600.0,
                "exclusions": [],
            },
            rendered_quote="QUOTE READY",
        )

    def _fake_upload_quote_source_file(**kwargs: object) -> dict[str, object]:
        assert kwargs["filename"] == "scope.pdf"
        assert kwargs["content_type"] == "application/pdf"
        return {
            "storage_ref": "supabase://quote-intake/quotes/gc-demo/scope.pdf",
            "bucket": "quote-intake",
            "path": "quotes/gc-demo/scope.pdf",
            "filename": "scope.pdf",
            "content_type": "application/pdf",
            "size_bytes": 4,
        }

    async def _fake_upsert_quote_draft(**kwargs: object) -> None:
        persisted.append(dict(kwargs))

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module, "upload_quote_source_file", _fake_upload_quote_source_file)
    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)

    async with _client() as client:
        response = await client.post(
            "/quote/upload",
            data={
                "input": "Need a quote for this insurance packet",
                "contractor_id": "00000000-0000-0000-0000-000000000001",
            },
            files={"file": ("scope.pdf", b"%PDF", "application/pdf")},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_draft"]["project_address"] == "14 Oak Lane"
    assert payload["source_files"][0]["storage_ref"] == "supabase://quote-intake/quotes/gc-demo/scope.pdf"
    assert len(persisted) == 1
    assert persisted[0]["source_files"][0]["filename"] == "scope.pdf"


@pytest.mark.asyncio
async def test_quote_upload_image_routes_through_storage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

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
        _ = (raw_input, session_id, gc_id, approval_status, edited_scope_of_work, edited_total_price)
        assert uploaded_files
        assert uploaded_files[0]["content_type"] == "image/png"
        return AgentState(
            mode="estimate",
            active_job_id="job-upload-img-1",
            trace_id="trace-upload-img-1",
            uploaded_files=[dict(item) for item in uploaded_files or []],
            quote_draft={
                "company_name": "GC Agent",
                "project_address": "72 Pine Street",
                "scope_of_work": "Repair flashing and ridge cap based on uploaded photo.",
                "total_price": 2800.0,
                "exclusions": [],
            },
            rendered_quote="IMAGE QUOTE READY",
        )

    def _fake_upload_quote_source_file(**_: object) -> dict[str, object]:
        return {
            "storage_ref": "supabase://quote-intake/quotes/gc-demo/photo.png",
            "bucket": "quote-intake",
            "path": "quotes/gc-demo/photo.png",
            "filename": "photo.png",
            "content_type": "image/png",
            "size_bytes": 7,
        }

    async def _fake_upsert_quote_draft(**_: object) -> None:
        return None

    monkeypatch.setattr(api_module, "run_single_estimate", _fake_run_single_estimate)
    monkeypatch.setattr(api_module, "upload_quote_source_file", _fake_upload_quote_source_file)
    monkeypatch.setattr(api_module.queries, "upsert_quote_draft", _fake_upsert_quote_draft)

    async with _client() as client:
        response = await client.post(
            "/quote/upload",
            data={"contractor_id": "gc-demo"},
            files={"file": ("photo.png", b"\x89PNG\r\n", "image/png")},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["source_files"][0]["filename"] == "photo.png"
    assert payload["rendered_quote"] == "IMAGE QUOTE READY"


@pytest.mark.asyncio
async def test_quote_upload_rejects_invalid_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async with _client() as client:
        response = await client.post(
            "/quote/upload",
            data={"contractor_id": "gc-demo"},
            files={"file": ("notes.txt", b"hello", "text/plain")},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 422
    assert response.json()["detail"] == "Only PDF, JPG, and PNG uploads are supported"
