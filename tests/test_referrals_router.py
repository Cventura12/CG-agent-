from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.referrals import router as referrals_router

referrals_module = import_module("gc_agent.routers.referrals")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(referrals_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-referrals"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_referrals_list_returns_summary(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_list_referral_invites(_: str, limit: int = 40):
        _ = limit
        return [
            {"id": "ref-1", "invite_code": "ABC123", "status": "pending"},
            {"id": "ref-2", "invite_code": "ABC124", "status": "accepted"},
        ]

    async def _fake_list_referral_leads(_: str, limit: int = 40):
        _ = limit
        return [{"id": "lead-1", "invite_code": "ABC124", "status": "new"}]

    monkeypatch.setattr(referrals_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(referrals_module.queries, "list_referral_invites", _fake_list_referral_invites)
    monkeypatch.setattr(referrals_module.queries, "list_referral_leads", _fake_list_referral_leads)
    monkeypatch.setenv("WEB_APP_URL", "https://app.gcagent.test")

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/referrals")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["summary"]["invites_total"] == 2
    assert payload["data"]["summary"]["invites_accepted"] == 1
    assert payload["data"]["summary"]["leads_total"] == 1
    assert payload["data"]["share_base_url"] == "https://app.gcagent.test/referral/"


@pytest.mark.asyncio
async def test_create_referral_invite_validates_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    monkeypatch.setattr(referrals_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/referrals/invite", json={"channel": "fax"})

    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    assert "channel must be one of" in payload["error"]


@pytest.mark.asyncio
async def test_create_referral_invite_returns_share_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_insert_referral_invite(**kwargs):
        assert kwargs["gc_id"] == "00000000-0000-0000-0000-000000000001"
        return {
            "id": "ref-11",
            "gc_id": kwargs["gc_id"],
            "invite_code": "INVITE11",
            "channel": kwargs["channel"],
            "destination": kwargs["destination"],
            "invitee_name": kwargs["invitee_name"],
            "note": kwargs["note"],
            "status": "pending",
            "trace_id": "",
            "created_at": "2026-03-04T12:00:00+00:00",
            "accepted_at": None,
        }

    monkeypatch.setattr(referrals_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(referrals_module.queries, "insert_referral_invite", _fake_insert_referral_invite)
    monkeypatch.setenv("WEB_APP_URL", "https://app.gcagent.test")

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/referrals/invite",
            json={
                "channel": "link",
                "invitee_name": "Alex",
                "note": "Top drywall contractor",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["invite"]["invite_code"] == "INVITE11"
    assert payload["data"]["share_url"] == "https://app.gcagent.test/referral/INVITE11"
    assert "INVITE11" in payload["data"]["share_message"]
