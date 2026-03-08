from __future__ import annotations

from importlib import import_module

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.routers.transcripts import router as transcripts_router

transcripts_module = import_module("gc_agent.routers.transcripts")


def _build_test_client() -> tuple[FastAPI, httpx.AsyncClient]:
    app = FastAPI()
    app.include_router(transcripts_router, prefix="/api/v1")

    async def _fake_current_gc() -> str:
        return "clerk-user-transcripts"

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    transport = httpx.ASGITransport(app=app)
    client = httpx.AsyncClient(transport=transport, base_url="http://testserver")
    return app, client


@pytest.mark.asyncio
async def test_transcript_link_job_route(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_link_transcript_to_job(transcript_id: str, gc_id: str, job_id: str) -> dict[str, object]:
        assert transcript_id == "ct-1"
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        assert job_id == "job-1"
        return {
            "transcript_id": transcript_id,
            "review_state": "pending",
            "active_job_id": job_id,
            "created_draft_ids": ["draft-transcript-1"],
        }

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_link_transcript_to_job", _fake_link_transcript_to_job)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/transcripts/ct-1/link-job", json={"job_id": "job-1"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["active_job_id"] == "job-1"
    assert payload["data"]["created_draft_ids"] == ["draft-transcript-1"]


@pytest.mark.asyncio
async def test_transcript_mark_reviewed_route(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_mark_transcript_reviewed(transcript_id: str, gc_id: str) -> dict[str, object]:
        assert transcript_id == "ct-2"
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        return {"transcript_id": transcript_id, "review_state": "reviewed"}

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_mark_transcript_reviewed", _fake_mark_transcript_reviewed)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/transcripts/ct-2/mark-reviewed")

    assert response.status_code == 200
    assert response.json()["data"]["review_state"] == "reviewed"


@pytest.mark.asyncio
async def test_transcript_discard_route(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_discard_transcript(transcript_id: str, gc_id: str) -> dict[str, object]:
        assert transcript_id == "ct-3"
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        return {"transcript_id": transcript_id, "review_state": "discarded"}

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_discard_transcript", _fake_discard_transcript)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/transcripts/ct-3/discard")

    assert response.status_code == 200
    assert response.json()["data"]["review_state"] == "discarded"


@pytest.mark.asyncio
async def test_transcript_log_update_route(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_get_gc_by_clerk_user_id(_: str) -> str | None:
        return "00000000-0000-0000-0000-000000000001"

    async def _fake_log_transcript_as_update(transcript_id: str, gc_id: str) -> dict[str, object]:
        assert transcript_id == "ct-4"
        assert gc_id == "00000000-0000-0000-0000-000000000001"
        return {
            "transcript_id": transcript_id,
            "review_state": "logged_update",
            "created_draft_ids": ["draft-update-1"],
        }

    monkeypatch.setattr(transcripts_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(transcripts_module, "_log_transcript_as_update", _fake_log_transcript_as_update)

    _, client = _build_test_client()
    async with client:
        response = await client.post("/api/v1/transcripts/ct-4/log-update")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data"]["review_state"] == "logged_update"
    assert payload["data"]["created_draft_ids"] == ["draft-update-1"]
