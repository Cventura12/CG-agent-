from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from gc_agent.db.queries import DatabaseError

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_public_referral_accept_is_open_and_records_lead(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_accept_referral_invite(**kwargs):
        assert kwargs["invite_code"] == "INVITE22"
        return {
            "lead_id": "rlead-1",
            "invite_id": "ref-1",
            "invite_code": "INVITE22",
            "referrer_gc_id": "00000000-0000-0000-0000-000000000001",
            "accepted": True,
        }

    monkeypatch.setattr(api_module.queries, "accept_referral_invite", _fake_accept_referral_invite)

    async with _client() as client:
        response = await client.post(
            "/referrals/accept",
            json={
                "invite_code": "INVITE22",
                "referred_name": "Mason Co",
                "referred_contact": "+14235550000",
                "source": "landing_page",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["lead_id"] == "rlead-1"
    assert payload["invite_code"] == "INVITE22"


@pytest.mark.asyncio
async def test_public_referral_accept_returns_404_for_missing_code(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_accept_referral_invite(**kwargs):
        _ = kwargs
        raise DatabaseError("accept_referral_invite failed: invite_code not found")

    monkeypatch.setattr(api_module.queries, "accept_referral_invite", _fake_accept_referral_invite)

    async with _client() as client:
        response = await client.post(
            "/referrals/accept",
            json={
                "invite_code": "MISSING1",
            },
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "invite_code not found"
