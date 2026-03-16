from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.queue import router as queue_router
from gc_agent.state import Draft

queue_module = import_module("gc_agent.routers.queue")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(queue_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-queue"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_approve_draft_advances_origin_open_item_to_office_approved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    resolved_calls: list[tuple[str, str]] = []
    status_updates: list[tuple[str, str]] = []
    open_item_status_updates: list[tuple[str, str, str, str | None]] = []

    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_draft_record(_: str) -> dict[str, object] | None:
        return {
            "id": "draft-co-1",
            "gc_id": "00000000-0000-0000-0000-000000000001",
            "trace_id": "open-item-action:open-co-1",
        }

    async def _fake_update_draft_status(draft_id: str, status: str) -> None:
        status_updates.append((draft_id, status))

    async def _fake_resolve_open_item(item_id: str, gc_id: str, *, action_stage: str | None | object = None) -> None:
        _ = action_stage
        resolved_calls.append((item_id, gc_id))

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        normalized_stage = action_stage if isinstance(action_stage, str) else None
        open_item_status_updates.append((item_id, gc_id, status, normalized_stage))

    async def _fake_get_draft_by_id(_: str) -> Draft | None:
        return Draft(
            id="draft-co-1",
            job_id="job-1",
            job_name="Miller Job",
            type="CO",
            title="Draft change order for Miller Job",
            content="Draft body",
            why="Generated from an unresolved change item that is putting money at risk.",
            status="approved",
            trace_id="open-item-action:open-co-1",
        )

    monkeypatch.setattr(queue_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(queue_module.queries, "get_draft_record", _fake_get_draft_record)
    monkeypatch.setattr(queue_module.queries, "update_draft_status", _fake_update_draft_status)
    monkeypatch.setattr(queue_module.queries, "resolve_open_item", _fake_resolve_open_item)
    monkeypatch.setattr(queue_module.queries, "update_open_item_status", _fake_update_open_item_status)
    monkeypatch.setattr(queue_module.queries, "get_draft_by_id", _fake_get_draft_by_id)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/queue/draft-co-1/approve")

    assert response.status_code == 200
    assert status_updates == [("draft-co-1", "approved")]
    assert resolved_calls == []
    assert open_item_status_updates == [
        ("open-co-1", "00000000-0000-0000-0000-000000000001", "in-progress", "approved")
    ]


@pytest.mark.asyncio
async def test_discard_draft_reopens_origin_open_item(monkeypatch: pytest.MonkeyPatch) -> None:
    open_item_status_updates: list[tuple[str, str, str, str | None]] = []

    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_draft_record(_: str) -> dict[str, object] | None:
        return {
            "id": "draft-approval-1",
            "gc_id": "00000000-0000-0000-0000-000000000001",
            "trace_id": "open-item-action:open-approval-1",
        }

    async def _fake_update_draft_status(draft_id: str, status: str) -> None:
        _ = (draft_id, status)

    async def _fake_resolve_open_item(item_id: str, gc_id: str, *, action_stage: str | None | object = None) -> None:
        _ = (item_id, gc_id, action_stage)

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        normalized_stage = action_stage if isinstance(action_stage, str) else None
        open_item_status_updates.append((item_id, gc_id, status, normalized_stage))

    async def _fake_get_draft_by_id(_: str) -> Draft | None:
        return Draft(
            id="draft-approval-1",
            job_id="job-1",
            job_name="Miller Job",
            type="owner-update",
            title="Request approval for Miller Job",
            content="Draft body",
            why="Generated from an unresolved approval item that needs owner follow-through.",
            status="discarded",
            trace_id="open-item-action:open-approval-1",
        )

    monkeypatch.setattr(queue_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(queue_module.queries, "get_draft_record", _fake_get_draft_record)
    monkeypatch.setattr(queue_module.queries, "update_draft_status", _fake_update_draft_status)
    monkeypatch.setattr(queue_module.queries, "resolve_open_item", _fake_resolve_open_item)
    monkeypatch.setattr(queue_module.queries, "update_open_item_status", _fake_update_open_item_status)
    monkeypatch.setattr(queue_module.queries, "get_draft_by_id", _fake_get_draft_by_id)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/queue/draft-approval-1/discard")

    assert response.status_code == 200
    assert open_item_status_updates == [
        ("open-approval-1", "00000000-0000-0000-0000-000000000001", "open", None)
    ]


@pytest.mark.asyncio
async def test_approve_all_advances_only_open_item_action_drafts(monkeypatch: pytest.MonkeyPatch) -> None:
    resolved_calls: list[tuple[str, str]] = []
    open_item_status_updates: list[tuple[str, str, str, str | None]] = []

    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_get_queued_drafts(_: str) -> list[Draft]:
        return [
            Draft(
                id="draft-co-1",
                job_id="job-1",
                job_name="Miller Job",
                type="CO",
                title="Draft change order for Miller Job",
                content="Draft body",
                why="Generated from an unresolved change item that is putting money at risk.",
                status="queued",
                trace_id="open-item-action:open-co-1",
            ),
            Draft(
                id="draft-owner-1",
                job_id="job-1",
                job_name="Miller Job",
                type="owner-update",
                title="Owner update",
                content="Draft body",
                why="General owner update.",
                status="queued",
                trace_id="trace-owner-1",
            ),
        ]

    async def _fake_approve_all_queued_drafts(_: str) -> int:
        return 2

    async def _fake_resolve_open_item(item_id: str, gc_id: str, *, action_stage: str | None | object = None) -> None:
        _ = action_stage
        resolved_calls.append((item_id, gc_id))

    async def _fake_update_open_item_status(
        item_id: str,
        gc_id: str,
        status: str,
        *,
        action_stage: str | None | object = None,
    ) -> None:
        normalized_stage = action_stage if isinstance(action_stage, str) else None
        open_item_status_updates.append((item_id, gc_id, status, normalized_stage))

    monkeypatch.setattr(queue_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(queue_module.queries, "get_queued_drafts", _fake_get_queued_drafts)
    monkeypatch.setattr(queue_module.queries, "approve_all_queued_drafts", _fake_approve_all_queued_drafts)
    monkeypatch.setattr(queue_module.queries, "resolve_open_item", _fake_resolve_open_item)
    monkeypatch.setattr(queue_module.queries, "update_open_item_status", _fake_update_open_item_status)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/queue/approve-all")

    assert response.status_code == 200
    assert response.json()["data"]["approved_count"] == 2
    assert resolved_calls == []
    assert open_item_status_updates == [
        ("open-co-1", "00000000-0000-0000-0000-000000000001", "in-progress", "approved")
    ]
