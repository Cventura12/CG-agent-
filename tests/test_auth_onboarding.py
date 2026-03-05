from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.auth import router as auth_router

auth_module = import_module("gc_agent.routers.auth")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_get_onboarding_returns_unregistered_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_profile_by_clerk_user_id(_: str):
        return None

    monkeypatch.setattr(
        auth_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.get("/api/v1/auth/onboarding")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["registered"] is False
    assert payload["data"]["onboarding_complete"] is False
    assert payload["data"]["primary_trade"] == "general_construction"
    assert isinstance(payload["data"]["recommended_defaults"], dict)
    assert payload["data"]["recommended_defaults"]["labor_rate_per_square"] > 0
    assert "company_name" in payload["data"]["missing_fields"]


@pytest.mark.asyncio
async def test_post_onboarding_requires_registered_phone_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_profile_by_clerk_user_id(_: str):
        return None

    monkeypatch.setattr(
        auth_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/auth/onboarding",
            json={
                "company_name": "Ventura Roofing",
                "labor_rate_per_square": 90,
                "default_markup_pct": 25,
                "tear_off_per_square": 55,
                "laminated_shingles_per_square": 135,
                "synthetic_underlayment_per_square": 22,
            },
        )

    assert response.status_code == 404
    payload = response.json()
    assert payload["success"] is False
    assert "Register phone number first" in payload["error"]


@pytest.mark.asyncio
async def test_post_onboarding_saves_pricing_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_profile_by_clerk_user_id(_: str):
        return {
            "id": "00000000-0000-0000-0000-000000000001",
            "phone_number": "+14235551234",
        }

    async def _fake_upsert_onboarding_pricing(gc_id: str, payload: dict[str, object]):
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        assert payload["company_name"] == "Ventura Roofing"
        assert payload["primary_trade"] == "general_construction"
        assert payload["service_area"] == "Chattanooga metro"
        return {
            "company_name": "Ventura Roofing",
            "labor_rate_per_square": 90.0,
            "default_markup_pct": 25.0,
            "tear_off_per_square": 55.0,
            "laminated_shingles_per_square": 135.0,
            "synthetic_underlayment_per_square": 22.0,
            "primary_trade": "general_construction",
            "service_area": "Chattanooga metro",
            "recommended_defaults": {
                "labor_rate_per_square": 92.0,
                "default_markup_pct": 25.0,
                "tear_off_per_square": 58.0,
                "laminated_shingles_per_square": 142.0,
                "synthetic_underlayment_per_square": 20.0,
            },
            "preferred_supplier": "ABC Supply",
            "preferred_shingle_brand": "GAF Timberline HDZ",
            "notes": "",
            "onboarding_complete": True,
            "missing_fields": [],
        }

    monkeypatch.setattr(
        auth_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )
    monkeypatch.setattr(
        auth_module.queries,
        "upsert_onboarding_pricing",
        _fake_upsert_onboarding_pricing,
    )

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/auth/onboarding",
            json={
                "company_name": "Ventura Roofing",
                "labor_rate_per_square": 90,
                "default_markup_pct": 25,
                "tear_off_per_square": 55,
                "laminated_shingles_per_square": 135,
                "synthetic_underlayment_per_square": 22,
                "primary_trade": "general_construction",
                "service_area": "Chattanooga metro",
                "preferred_supplier": "ABC Supply",
                "preferred_shingle_brand": "GAF Timberline HDZ",
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["registered"] is True
    assert payload["data"]["onboarding_complete"] is True
    assert payload["data"]["company_name"] == "Ventura Roofing"
