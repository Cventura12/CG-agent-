from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.webhooks import twilio


def _build_client() -> httpx.AsyncClient:
    app = FastAPI()
    app.include_router(twilio.router, prefix="/webhook")
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_status_callback_updates_delivery_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_apply(*, provider_message_id: str, delivery_status: str, error_message: str = "") -> dict[str, int]:
        assert provider_message_id == "SM123"
        assert delivery_status == "failed"
        assert "30003" in error_message
        return {"updated_rows": 2, "quote_rows": 1, "briefing_rows": 1}

    monkeypatch.setattr(twilio, "_validate_twilio_signature", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(twilio.queries, "apply_twilio_delivery_status", _fake_apply)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/whatsapp/status",
            data={
                "MessageSid": "SM123",
                "MessageStatus": "undelivered",
                "ErrorCode": "30003",
                "ErrorMessage": "Unreachable destination handset",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["updated"] == 2
    assert payload["quote_rows"] == 1
    assert payload["briefing_rows"] == 1


@pytest.mark.asyncio
async def test_status_callback_rejects_invalid_signature(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(twilio, "_validate_twilio_signature", lambda *_args, **_kwargs: False)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/whatsapp/status",
            data={"MessageSid": "SM123", "MessageStatus": "sent"},
        )

    assert response.status_code == 403
