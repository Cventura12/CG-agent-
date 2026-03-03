from __future__ import annotations

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc
from gc_agent.state import AgentState

ROUTER_PATH = Path(__file__).resolve().parents[1] / "gc_agent" / "routers" / "ingest.py"
ROUTER_SPEC = spec_from_file_location("gc_agent_routers_ingest_test", ROUTER_PATH)
assert ROUTER_SPEC is not None and ROUTER_SPEC.loader is not None
ingest_module = module_from_spec(ROUTER_SPEC)
ROUTER_SPEC.loader.exec_module(ingest_module)


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(ingest_module.router, prefix="/api/v1")
    return app


@pytest.mark.asyncio
async def test_ingest_route_dispatches_estimate_path_and_returns_trace_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_by_clerk_user_id(clerk_user_id: str) -> str:
        assert clerk_user_id == "clerk-user-123"
        return "gc-demo"

    async def _fake_run_single_input(
        raw_input: str,
        *,
        session_id: str,
        gc_id: str,
    ) -> AgentState:
        assert raw_input == "Replace 20 squares on Oak Street"
        assert session_id == "trace-123"
        assert gc_id == "gc-demo"
        return AgentState(
            mode="estimate",
            trace_id=session_id,
            active_job_id="job-1",
            quote_draft={"scope_of_work": "Replace roof"},
            rendered_quote="Quote preview",
        )

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(ingest_module.queries, "get_gc_by_clerk_user_id", _fake_get_gc_by_clerk_user_id)
    monkeypatch.setattr(ingest_module, "_run_single_input", _fake_run_single_input)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/ingest",
            json={
                "surface": "typed_note",
                "intent": "estimate",
                "raw_text": "Replace 20 squares on Oak Street",
                "external_id": "trace-123",
            },
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"]["mode"] == "estimate"
    assert payload["data"]["trace_id"] == "trace-123"
    assert payload["data"]["active_job_id"] == "job-1"
    assert payload["data"]["rendered_quote"] == "Quote preview"
