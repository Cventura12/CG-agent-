from __future__ import annotations

from importlib import import_module
from typing import Any

import httpx
import pytest

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_quote_send_whatsapp_logs_delivery(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    send_calls: list[tuple[str, str]] = []
    delivery_logs: list[dict[str, Any]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-send-1":
            return None
        return {
            "id": quote_id,
            "gc_id": "gc-demo",
            "job_id": "job-88",
            "trace_id": "trace-send-1",
            "quote_draft": {
                "company_name": "GC Agent Roofing",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Replace roof shingles and underlayment.",
                "total_price": 14350.0,
            },
            "final_quote_draft": {},
        }

    async def _fake_deliver(channel: str, destination: str, body: str) -> str:
        assert channel == "whatsapp"
        send_calls.append((destination, body))
        return "SM123"

    async def _fake_insert_quote_delivery_log(**kwargs: Any) -> str:
        delivery_logs.append(dict(kwargs))
        return "qdl-1"

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module, "_deliver_quote_message", _fake_deliver)
    monkeypatch.setattr(api_module.queries, "insert_quote_delivery_log", _fake_insert_quote_delivery_log)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-send-1/send",
            json={
                "contractor_id": "gc-demo",
                "channel": "whatsapp",
                "destination": "+14235551234",
                "recipient_name": "Taylor",
            },
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "sent"
    assert payload["channel"] == "whatsapp"
    assert payload["delivery_id"] == "qdl-1"
    assert len(send_calls) == 1
    assert send_calls[0][0] == "+14235551234"
    assert "GC Agent Roofing" in send_calls[0][1]
    assert len(delivery_logs) == 1
    assert delivery_logs[0]["delivery_status"] == "sent"
    assert delivery_logs[0]["provider_message_id"] == "SM123"


@pytest.mark.asyncio
async def test_quote_send_email_logs_delivery_and_uses_pdf_attachment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    email_calls: list[dict[str, Any]] = []
    delivery_logs: list[dict[str, Any]] = []

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-email-1":
            return None
        return {
            "id": quote_id,
            "gc_id": "gc-demo",
            "job_id": "job-99",
            "trace_id": "trace-email-1",
            "quote_draft": {
                "company_name": "GC Agent Roofing",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Original scope",
                "total_price": 14350.0,
                "line_items": [],
                "exclusions": [],
            },
            "final_quote_draft": {
                "company_name": "GC Agent Roofing",
                "project_address": "14 Oak Lane",
                "scope_of_work": "Edited scope ready for customer",
                "total_price": 14900.0,
                "line_items": [],
                "exclusions": [],
            },
        }

    def _fake_render_quote_pdf(quote_id: str, quote_draft: dict[str, object]) -> bytes:
        assert quote_id == "quote-email-1"
        assert quote_draft["scope_of_work"] == "Edited scope ready for customer"
        return b"%PDF-1.4 email quote pdf"

    async def _fake_deliver_quote_email(
        destination: str,
        subject: str,
        body: str,
        *,
        pdf_bytes: bytes,
        quote_id: str,
    ) -> str:
        email_calls.append(
            {
                "destination": destination,
                "subject": subject,
                "body": body,
                "pdf_bytes": pdf_bytes,
                "quote_id": quote_id,
            }
        )
        return "<message-id@example.com>"

    async def _fake_insert_quote_delivery_log(**kwargs: Any) -> str:
        delivery_logs.append(dict(kwargs))
        return "qdl-email-1"

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module, "render_quote_pdf", _fake_render_quote_pdf)
    monkeypatch.setattr(api_module, "_deliver_quote_email", _fake_deliver_quote_email)
    monkeypatch.setattr(api_module.queries, "insert_quote_delivery_log", _fake_insert_quote_delivery_log)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-email-1/send",
            json={
                "contractor_id": "gc-demo",
                "channel": "email",
                "destination": "customer@example.com",
                "recipient_name": "Taylor",
            },
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "sent"
    assert payload["channel"] == "email"
    assert payload["delivery_id"] == "qdl-email-1"
    assert len(email_calls) == 1
    assert email_calls[0]["destination"] == "customer@example.com"
    assert email_calls[0]["quote_id"] == "quote-email-1"
    assert email_calls[0]["pdf_bytes"].startswith(b"%PDF-1.4")
    assert "quote-email-1" in email_calls[0]["subject"]
    assert len(delivery_logs) == 1
    assert delivery_logs[0]["delivery_status"] == "sent"
    assert delivery_logs[0]["provider_message_id"] == "<message-id@example.com>"


@pytest.mark.asyncio
async def test_quote_send_rejects_wrong_contractor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-a:key-a,gc-b:key-b")

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-send-locked":
            return None
        return {
            "id": quote_id,
            "gc_id": "gc-a",
            "trace_id": "trace-locked",
            "quote_draft": {"scope_of_work": "Replace roof", "total_price": 10000.0},
        }

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)

    async with _client() as client:
        response = await client.post(
            "/quote/quote-send-locked/send",
            json={
                "contractor_id": "gc-b",
                "channel": "sms",
                "destination": "+14235550000",
            },
            headers={"X-API-Key": "key-b"},
        )

    assert response.status_code == 403
    assert response.json()["detail"] == "quote does not belong to contractor"


@pytest.mark.asyncio
async def test_quote_delivery_route_returns_delivery_attempts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, object] | None:
        if quote_id != "quote-send-1":
            return None
        return {
            "id": quote_id,
            "gc_id": "gc-demo",
            "job_id": "job-88",
            "trace_id": "trace-send-1",
            "quote_draft": {"scope_of_work": "Replace roof", "total_price": 14350.0},
        }

    async def _fake_get_quote_delivery_attempts(quote_id: str, gc_id: str) -> list[dict[str, object]]:
        assert quote_id == "quote-send-1"
        assert gc_id == "gc-demo"
        return [
            {
                "id": "qdl-1",
                "channel": "sms",
                "destination": "+14235550000",
                "recipient_name": "Taylor",
                "delivery_status": "delivered",
                "provider_message_id": "SM123",
                "error_message": "",
                "created_at": "2026-03-05T16:30:00+00:00",
            }
        ]

    monkeypatch.setattr(api_module.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(api_module.queries, "get_quote_delivery_attempts", _fake_get_quote_delivery_attempts)

    async with _client() as client:
        response = await client.get(
            "/quote/quote-send-1/delivery",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["quote_id"] == "quote-send-1"
    assert payload["trace_id"] == "trace-send-1"
    assert payload["deliveries"][0]["delivery_id"] == "qdl-1"
    assert payload["deliveries"][0]["status"] == "delivered"
    assert payload["deliveries"][0]["channel"] == "sms"
