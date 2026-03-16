from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.jobs import router as jobs_router
from gc_agent.state import Draft, Job, OpenItem

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
async def test_open_item_change_order_action_creates_review_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    inserted_drafts: list[Draft] = []
    open_item_status_updates: list[tuple[str, str, str]] = []

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
                    )
                ],
            )
        ]

    async def _fake_get_pending_drafts(_: str) -> list[Draft]:
        return []

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        inserted_drafts.extend(drafts)

    async def _fake_update_open_item_status(item_id: str, gc_id: str, status: str) -> None:
        open_item_status_updates.append((item_id, gc_id, status))

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_pending_drafts", _fake_get_pending_drafts)
    monkeypatch.setattr(jobs_module.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(jobs_module.queries, "update_open_item_status", _fake_update_open_item_status)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/jobs/job-1/open-items/open-co-1/draft-action")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["draft"]["type"] == "CO"
    assert payload["data"]["draft"]["title"] == "Draft change order for Miller Job"
    assert payload["data"]["open_item"]["status"] == "in-progress"
    assert inserted_drafts[0].trace_id == "open-item-action:open-co-1"
    assert open_item_status_updates == [
        ("open-co-1", "00000000-0000-0000-0000-000000000001", "in-progress")
    ]


@pytest.mark.asyncio
async def test_open_item_action_reuses_existing_pending_approval_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_drafts: list[Draft] = []
    open_item_status_updates: list[tuple[str, str, str]] = []

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
                        id="open-approval-1",
                        job_id="job-1",
                        type="approval",
                        description="Owner approval needed before release of added work.",
                        owner="PM",
                    )
                ],
            )
        ]

    async def _fake_get_pending_drafts(_: str) -> list[Draft]:
        return [
            Draft(
                id="draft-existing-1",
                job_id="job-1",
                job_name="Miller Job",
                type="owner-update",
                title="Request approval for Miller Job",
                content="Existing draft",
                why="Generated from an unresolved approval item that needs owner follow-through.",
                status="queued",
                trace_id="open-item-action:open-approval-1",
            )
        ]

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        _ = gc_id
        inserted_drafts.extend(drafts)

    async def _fake_update_open_item_status(item_id: str, gc_id: str, status: str) -> None:
        open_item_status_updates.append((item_id, gc_id, status))

    monkeypatch.setattr(jobs_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(jobs_module.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(jobs_module.queries, "get_pending_drafts", _fake_get_pending_drafts)
    monkeypatch.setattr(jobs_module.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(jobs_module.queries, "update_open_item_status", _fake_update_open_item_status)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/jobs/job-1/open-items/open-approval-1/draft-action")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["draft"]["id"] == "draft-existing-1"
    assert payload["data"]["draft"]["type"] == "owner-update"
    assert inserted_drafts == []
    assert open_item_status_updates == [
        ("open-approval-1", "00000000-0000-0000-0000-000000000001", "in-progress")
    ]
