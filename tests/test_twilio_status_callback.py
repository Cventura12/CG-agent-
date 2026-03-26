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
async def test_send_sms_message_attaches_status_callback_from_env(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    create_calls: list[dict[str, str]] = []

    class _FakeMessages:
        def create(self, **kwargs: str) -> object:
            create_calls.append(dict(kwargs))
            return type("Message", (), {"sid": "SM123"})()

    class _FakeClient:
        def __init__(self) -> None:
            self.messages = _FakeMessages()

    monkeypatch.setenv("TWILIO_SMS_FROM", "+14233800273")
    monkeypatch.setenv("TWILIO_STATUS_CALLBACK_URL", "https://api.example.com/webhook/twilio/status")
    monkeypatch.setattr(twilio, "_TWILIO_CLIENT", _FakeClient())

    sid = await twilio.send_sms_message("+14235550000", "Quote ready")

    assert sid == "SM123"
    assert len(create_calls) == 1
    assert create_calls[0]["from_"] == "+14233800273"
    assert create_calls[0]["to"] == "+14235550000"
    assert create_calls[0]["status_callback"] == "https://api.example.com/webhook/twilio/status"


@pytest.mark.asyncio
async def test_send_whatsapp_message_attaches_explicit_status_callback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    create_calls: list[dict[str, str]] = []

    class _FakeMessages:
        def create(self, **kwargs: str) -> object:
            create_calls.append(dict(kwargs))
            return type("Message", (), {"sid": "SMWA123"})()

    class _FakeClient:
        def __init__(self) -> None:
            self.messages = _FakeMessages()

    monkeypatch.setenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14233800273")
    monkeypatch.setattr(twilio, "_TWILIO_CLIENT", _FakeClient())

    sid = await twilio.send_whatsapp_message(
        "+14235550000",
        "Follow-up reminder",
        status_callback_url="https://api.example.com/webhook/twilio/status",
    )

    assert sid == "SMWA123"
    assert len(create_calls) == 1
    assert create_calls[0]["from_"] == "whatsapp:+14233800273"
    assert create_calls[0]["to"] == "whatsapp:+14235550000"
    assert create_calls[0]["status_callback"] == "https://api.example.com/webhook/twilio/status"


@pytest.mark.asyncio
async def test_status_callback_updates_delivery_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_apply(*, provider_message_id: str, delivery_status: str, error_message: str = "") -> dict[str, int]:
        assert provider_message_id == "SM123"
        assert delivery_status == "failed"
        assert "30003" in error_message
        return {"updated_rows": 2, "quote_rows": 1, "briefing_rows": 1}

    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)
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
    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: False)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/whatsapp/status",
            data={"MessageSid": "SM123", "MessageStatus": "sent"},
        )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_twilio_status_alias_route_updates_delivery_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_apply(*, provider_message_id: str, delivery_status: str, error_message: str = "") -> dict[str, int]:
        assert provider_message_id == "SM456"
        assert delivery_status == "sent"
        return {"updated_rows": 1, "quote_rows": 1, "briefing_rows": 0}

    monkeypatch.setattr(twilio, "_validate_twilio_request", lambda *_args, **_kwargs: True)
    monkeypatch.setattr(twilio.queries, "apply_twilio_delivery_status", _fake_apply)

    async with _build_client() as client:
        response = await client.post(
            "/webhook/twilio/status",
            data={"MessageSid": "SM456", "MessageStatus": "delivered"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["updated"] == 1

