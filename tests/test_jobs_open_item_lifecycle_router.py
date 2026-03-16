from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.state import Job, OpenItem

jobs_module = import_module("gc_agent.routers.jobs")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(jobs_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-jobs"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_open_item_lifecycle_marks_item_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    open_item_status_updates: list[tuple[str, str, str, str | None]] = []

    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return [
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
                open_items=[
                    OpenItem(
                        id="open-co-1",
                        job_id="job-1",
                        type="CO",
                        description="Owner approved additional work that still needs pricing.",
                        owner="PM",
                        status="in-progress",
                        action_stage="approved",
                    )
                ],
            )
        ]

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        normalized_stage = action_stage if isinstance(action_stage, str) else None
        open_item_status_updates.append((item_id, gc_id, status, normalized_stage))

    async def _fake_resolve_open_item(
        item_id: str,
        gc_id: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        _ = (item_id, gc_id, action_stage)

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "update_open_item_status", _fake_update_open_item_status)
    monkeypatch.setattr(jobs_module.queries, "resolve_open_item", _fake_resolve_open_item)

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/jobs/job-1/open-items/open-co-1/lifecycle",
            json={"stage": "sent"},
        )

    assert response.status_code == 200
    assert open_item_status_updates == [
        ("open-co-1", "00000000-0000-0000-0000-000000000001", "in-progress", "sent")
    ]
    assert response.json()["data"]["open_item"]["action_stage"] == "sent"


@pytest.mark.asyncio
async def test_open_item_lifecycle_requires_sent_before_customer_approval(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return [
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
                open_items=[
                    OpenItem(
                        id="open-co-1",
                        job_id="job-1",
                        type="CO",
                        description="Owner approved additional work that still needs pricing.",
                        owner="PM",
                        status="in-progress",
                        action_stage="approved",
                    )
                ],
            )
        ]

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        _ = (item_id, gc_id, status, action_stage)

    async def _fake_resolve_open_item(
        item_id: str,
        gc_id: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        _ = (item_id, gc_id, action_stage)

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "update_open_item_status", _fake_update_open_item_status)
    monkeypatch.setattr(jobs_module.queries, "resolve_open_item", _fake_resolve_open_item)

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/jobs/job-1/open-items/open-co-1/lifecycle",
            json={"stage": "customer-approved"},
        )

    assert response.status_code == 400
    assert response.json()["error"] == "open item must be sent before it can be marked customer approved"


@pytest.mark.asyncio
async def test_open_item_lifecycle_marks_item_completed(monkeypatch: pytest.MonkeyPatch) -> None:
    resolved_calls: list[tuple[str, str, str | None]] = []

    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_active_jobs(_: str) -> list[Job]:
        return [
            Job(
                id="job-1",
                name="Miller Job",
                type="Roofing",
                status="active",
                address="101 Main St",
                contract_value=90000,
                contract_type="Lump Sum",
                est_completion="2026-12-01",
                open_items=[
                    OpenItem(
                        id="open-co-1",
                        job_id="job-1",
                        type="CO",
                        description="Owner approved additional work that still needs pricing.",
                        owner="PM",
                        status="in-progress",
                        action_stage="customer-approved",
                    )
                ],
            )
        ]

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        _ = (item_id, gc_id, status, action_stage)

    async def _fake_resolve_open_item(
        item_id: str,
        gc_id: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        normalized_stage = action_stage if isinstance(action_stage, str) else None
        resolved_calls.append((item_id, gc_id, normalized_stage))

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "update_open_item_status", _fake_update_open_item_status)
    monkeypatch.setattr(jobs_module.queries, "resolve_open_item", _fake_resolve_open_item)

    _, client = _build_test_client()
    async with client:
        response = await client.post(
            "/api/v1/jobs/job-1/open-items/open-co-1/lifecycle",
            json={"stage": "completed"},
        )

    assert response.status_code == 200
    assert resolved_calls == [("open-co-1", "00000000-0000-0000-0000-000000000001", "completed")]
    assert response.json()["data"]["open_item"]["status"] == "resolved"
