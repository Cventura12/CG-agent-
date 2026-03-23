from __future__ import annotations

from importlib import import_module

import httpx
import pytest

from gc_agent.state import AgentState, Draft, Job

api_app_module = import_module("gc_agent.api.main")
api_module = import_module("gc_agent.api.router")


def _client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=api_app_module.app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_api_requires_x_api_key_header(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async with _client() as client:
        response = await client.get("/queue", params={"contractor_id": "gc-demo"})

    assert response.status_code == 401
    assert response.json()["detail"] == "X-API-Key header is required"


@pytest.mark.asyncio
async def test_post_update_routes_v4_path_and_returns_draft_actions(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_run_update(
        raw_input: str,
        gc_id: str,
        from_number: str,
        input_type: str = "chat",
    ) -> AgentState:
        assert raw_input.startswith("Framing crew is behind")
        assert gc_id == "gc-demo"
        assert from_number == "api:gc-demo"
        assert input_type == "chat"
        return AgentState(
            mode="update",
            drafts_created=[
                Draft(
                    id="draft-1",
                    job_id="job-1",
                    job_name="Miller Job",
                    type="owner-update",
                    title="Reschedule inspection",
                    content="Framing is behind. Move inspection to Thursday.",
                    why="Crew delay needs owner visibility.",
                )
            ],
            risk_flags=["Inspection date may slip by 48 hours."],
        )

    monkeypatch.setattr(api_module.graph, "run_update", _fake_run_update)

    async with _client() as client:
        response = await client.post(
            "/update",
            json={
                "input": "Framing crew is behind on the Miller job, need to reschedule inspection",
                "contractor_id": "gc-demo",
            },
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["draft_actions"]) == 1
    assert payload["draft_actions"][0]["title"] == "Reschedule inspection"
    assert payload["risk_flags"] == ["Inspection date may slip by 48 hours."]


@pytest.mark.asyncio
async def test_briefing_and_jobs_endpoints_return_current_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_run_briefing(gc_id: str) -> str:
        assert gc_id == "gc-demo"
        return "Today: approve two drafts and call the inspector."

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [
            Job(
                id="job-1",
                name="Miller Job",
                type="Commercial TI",
                status="active",
                address="101 Main St",
                contract_value=100000,
                contract_type="Lump Sum",
                est_completion="2026-11-30",
            )
        ]

    monkeypatch.setattr(api_module.graph, "run_briefing", _fake_run_briefing)
    monkeypatch.setattr(api_module.queries, "get_active_jobs", _fake_get_active_jobs)

    async with _client() as client:
        briefing_response = await client.get(
            "/briefing",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )
        jobs_response = await client.get(
            "/jobs",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert briefing_response.status_code == 200
    assert briefing_response.json()["briefing"] == "Today: approve two drafts and call the inspector."
    assert jobs_response.status_code == 200
    assert jobs_response.json()["count"] == 1
    assert jobs_response.json()["jobs"][0]["name"] == "Miller Job"


@pytest.mark.asyncio
async def test_public_job_followup_endpoint_returns_runtime_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    async def _fake_get_job_followup_state(gc_id: str, job_id: str) -> dict[str, object] | None:
        assert gc_id == "gc-demo"
        assert job_id == "job-1"
        return {
            "open_item_id": "followup-1",
            "quote_id": "quote-1",
            "job_id": "job-1",
            "status": "scheduled",
            "next_due_at": "2026-03-06T14:00:00+00:00",
            "reminder_count": 1,
            "last_reminder_at": "2026-03-05T14:00:00+00:00",
            "stopped_at": None,
            "stop_reason": None,
            "channel": "sms",
        }

    monkeypatch.setattr(api_module.queries, "get_job_followup_state", _fake_get_job_followup_state)

    async with _client() as client:
        response = await client.get(
            "/jobs/job-1/followup",
            params={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["followup_state"]["status"] == "scheduled"
    assert payload["followup_state"]["quote_id"] == "quote-1"


@pytest.mark.asyncio
async def test_edit_and_discard_queue_endpoints_update_draft_and_trigger_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GC_AGENT_API_KEYS", "gc-demo:test-key")

    status_updates: list[tuple[str, str, str | None]] = []
    edited_saves: list[tuple[str, str]] = []
    memory_calls: list[str] = []

    async def _fake_get_draft_record(draft_id: str) -> dict[str, str] | None:
        return {"id": draft_id, "gc_id": "gc-demo"}

    async def _fake_update_draft_status(
        draft_id: str,
        status: str,
        edited_content: str | None = None,
    ) -> None:
        status_updates.append((draft_id, status, edited_content))

    async def _fake_edit_draft_content(draft_id: str, content: str) -> None:
        edited_saves.append((draft_id, content))

    async def _fake_get_draft_by_id(draft_id: str) -> Draft | None:
        status = "queued" if draft_id == "draft-edit" else "discarded"
        content = "Edited content" if draft_id == "draft-edit" else "Discarded content"
        return Draft(
            id=draft_id,
            job_id="job-1",
            job_name="Miller Job",
            type="owner-update",
            title="Draft Title",
            content=content,
            why="Testing",
            status=status,  # type: ignore[arg-type]
        )

    async def _fake_update_memory(state: AgentState) -> dict[str, object]:
        memory_calls.append(state.approval_status)
        return {"memory_context": {"memory_updated": False}, "approval_status": state.approval_status}

    monkeypatch.setattr(api_module.queries, "get_draft_record", _fake_get_draft_record)
    monkeypatch.setattr(api_module.queries, "update_draft_status", _fake_update_draft_status)
    monkeypatch.setattr(api_module.queries, "edit_draft_content", _fake_edit_draft_content)
    monkeypatch.setattr(api_module.queries, "get_draft_by_id", _fake_get_draft_by_id)
    monkeypatch.setattr(api_module, "update_memory", _fake_update_memory)

    async with _client() as client:
        edit_response = await client.post(
            "/queue/draft-edit/edit",
            json={"contractor_id": "gc-demo", "content": "Edited content"},
            headers={"X-API-Key": "test-key"},
        )
        discard_response = await client.post(
            "/queue/draft-discard/discard",
            json={"contractor_id": "gc-demo"},
            headers={"X-API-Key": "test-key"},
        )

    assert edit_response.status_code == 200
    assert edit_response.json()["draft"]["status"] == "queued"
    assert discard_response.status_code == 200
    assert discard_response.json()["draft"]["status"] == "discarded"
    assert edited_saves == [("draft-edit", "Edited content")]
    assert status_updates == [("draft-discard", "discarded", None)]
    assert memory_calls == ["discarded"]
