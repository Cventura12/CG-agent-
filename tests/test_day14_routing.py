from __future__ import annotations

from importlib import import_module

import pytest

from gc_agent import cli
from gc_agent.state import AgentState, Draft, ParsedIntent

ingest_module = import_module("gc_agent.nodes.ingest")
graph_module = import_module("gc_agent.graph")


def test_graph_alias_uses_same_compiled_graph_singleton() -> None:
    assert graph_module.graph is graph_module.get_graph()


@pytest.mark.asyncio
async def test_ingest_routes_measurement_input_to_estimate_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")

    state = AgentState(
        raw_input="Need a quote for 32 squares at 14 Oak Lane with 8/12 pitch and 220 ft ridge",
    )

    result = await ingest_module.ingest(state)

    assert result["mode"] == "estimate"
    assert isinstance(result["cleaned_input"], str)
    assert result["cleaned_input"]
    assert graph_module.route_by_mode(AgentState(mode="estimate")) == "estimate"


@pytest.mark.asyncio
async def test_run_single_input_routes_job_update_to_v4_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_ingest(state: AgentState) -> dict[str, object]:
        return {"mode": "update", "raw_input": state.raw_input.strip()}

    async def _fake_resolve_jobs(gc_id: str) -> list[object]:
        del gc_id
        return []

    async def _fake_parse_update(state: AgentState) -> dict[str, object]:
        del state
        return {
            "parsed_intent": ParsedIntent(
                understanding="Crew delay requires outbound communication.",
                drafts=[
                    {
                        "type": "owner-update",
                        "title": "Reschedule inspection",
                        "content": "Framing is behind on the Miller job. Move the inspection to Thursday.",
                        "why": "The crew reported schedule slippage.",
                    }
                ],
            )
        }

    async def _fake_update_state(state: AgentState) -> dict[str, object]:
        del state
        return {}

    async def _fake_flag_risks(state: AgentState) -> dict[str, object]:
        del state
        return {"risk_flags": ["Inspection slip could affect turnover."]}

    async def _fake_draft_actions(state: AgentState) -> dict[str, object]:
        del state
        return {
            "drafts_created": [
                Draft(
                    id="draft-1",
                    job_id="job-1",
                    job_name="Miller Job",
                    type="owner-update",
                    title="Reschedule inspection",
                    content="Framing is behind on the Miller job. Move the inspection to Thursday.",
                    why="The crew reported schedule slippage.",
                )
            ]
        }

    monkeypatch.setattr(cli, "ingest", _fake_ingest)
    monkeypatch.setattr(cli, "_resolve_active_jobs", _fake_resolve_jobs)
    monkeypatch.setattr(cli, "parse_update", _fake_parse_update)
    monkeypatch.setattr(cli, "update_state", _fake_update_state)
    monkeypatch.setattr(cli, "flag_risks", _fake_flag_risks)
    monkeypatch.setattr(cli, "draft_actions", _fake_draft_actions)

    state = await cli.run_single_input(
        "Framing crew is behind on the Miller job, need to reschedule inspection",
    )

    assert state.mode == "update"
    assert state.rendered_quote == ""
    assert len(state.drafts_created) == 1
    assert state.drafts_created[0].title == "Reschedule inspection"


@pytest.mark.asyncio
async def test_run_single_input_routes_quote_request_to_v5_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_ingest(state: AgentState) -> dict[str, object]:
        return {
            "mode": "estimate",
            "raw_input": state.raw_input,
            "cleaned_input": "32 squares at 14 Oak Lane with 8/12 pitch",
            "active_job_id": "job-quote-1",
        }

    async def _fake_recall(state: AgentState) -> dict[str, object]:
        del state
        return {"memory_context": {"recall_context_ready": True}}

    async def _fake_extract(state: AgentState) -> dict[str, object]:
        del state
        return {
            "job_scope": {
                "address": "14 Oak Lane",
                "customer_name": "Taylor",
                "missing_fields": [],
            },
            "clarification_needed": False,
        }

    async def _fake_calculate(state: AgentState) -> dict[str, object]:
        del state
        return {
            "materials": {
                "subtotal": 12450,
                "line_items": [{"item": "Shingles", "total_cost": 12450}],
            }
        }

    async def _fake_quote(state: AgentState) -> dict[str, object]:
        del state
        return {
            "quote_draft": {
                "company_name": "GC Agent Roofing",
                "scope_of_work": "Replace shingles at 14 Oak Lane",
                "total_price": 12450,
                "exclusions": ["Decking replacement if hidden damage is found"],
            },
            "rendered_quote": "QUOTE READY",
        }

    monkeypatch.setattr(cli, "ingest", _fake_ingest)
    monkeypatch.setattr(cli, "recall_context", _fake_recall)
    monkeypatch.setattr(cli, "extract_job_scope", _fake_extract)
    monkeypatch.setattr(cli, "calculate_materials", _fake_calculate)
    monkeypatch.setattr(cli, "generate_quote", _fake_quote)

    state = await cli.run_single_input(
        "Need a quote for 32 squares at 14 Oak Lane with 8/12 pitch",
    )

    assert state.mode == "estimate"
    assert state.rendered_quote == "QUOTE READY"
    assert state.quote_draft["total_price"] == 12450
    assert state.drafts_created == []
