"""CLI checkpointing tests for the Day 9 estimate path."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest

from gc_agent import cli


@dataclass
class _Snapshot:
    """Minimal checkpoint snapshot wrapper used by the fake graph."""

    values: dict[str, object]


class _FakeGraph:
    """In-memory checkpoint double for CLI session tests."""

    def __init__(self) -> None:
        self._values_by_thread: dict[str, dict[str, object]] = {}

    async def aupdate_state(
        self,
        config: dict[str, dict[str, str]],
        values: dict[str, object],
        as_node: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, dict[str, str]]:
        del as_node, task_id
        thread_id = config["configurable"]["thread_id"]
        self._values_by_thread[thread_id] = dict(values)
        return config

    async def aget_state(self, config: dict[str, dict[str, str]]) -> _Snapshot | None:
        thread_id = config["configurable"]["thread_id"]
        values = self._values_by_thread.get(thread_id)
        if values is None:
            return None
        return _Snapshot(values=values)


@pytest.mark.asyncio
async def test_run_single_estimate_reuses_checkpointed_session(monkeypatch: pytest.MonkeyPatch) -> None:
    """A second run with the same session ID should skip completed nodes."""
    call_counts = {
        "ingest": 0,
        "extract": 0,
        "clarify": 0,
        "calculate": 0,
        "quote": 0,
    }

    async def _fake_ingest(state):
        call_counts["ingest"] += 1
        return {
            "mode": "estimate",
            "raw_input": state.raw_input,
            "cleaned_input": "normalized input",
            "active_job_id": "job-session-test",
        }

    async def _fake_extract(state):
        call_counts["extract"] += 1
        return {
            "job_scope": {
                "address": "123 Main St",
                "customer_name": "Taylor",
                "missing_fields": [],
            },
            "clarification_needed": False,
        }

    async def _fake_clarify(state):
        call_counts["clarify"] += 1
        return {
            "clarification_questions": [],
            "clarification_needed": False,
        }

    async def _fake_calculate(state):
        call_counts["calculate"] += 1
        return {
            "materials": {
                "subtotal": 1200,
                "line_items": [{"label": "Shingles", "cost": 1200}],
            }
        }

    async def _fake_quote(state):
        call_counts["quote"] += 1
        return {
            "quote_draft": {
                "company_name": "Arbor Roofing",
                "scope_of_work": "Replace shingles at 123 Main St",
                "total_price": 1200,
                "exclusions": ["Decking replacement if required"],
            },
            "rendered_quote": "QUOTE READY",
        }

    monkeypatch.setattr(cli, "graph", _FakeGraph())
    monkeypatch.setattr(cli, "ingest", _fake_ingest)
    monkeypatch.setattr(cli, "extract_job_scope", _fake_extract)
    monkeypatch.setattr(cli, "clarify_missing", _fake_clarify)
    monkeypatch.setattr(cli, "calculate_materials", _fake_calculate)
    monkeypatch.setattr(cli, "generate_quote", _fake_quote)

    session_id = f"cli-session-{uuid4().hex}"

    first_state = await cli.run_single_estimate("first input", session_id=session_id, gc_id="gc-test")
    second_state = await cli.run_single_estimate("second input", session_id=session_id, gc_id="gc-test")

    assert first_state.rendered_quote == "QUOTE READY"
    assert second_state.rendered_quote == "QUOTE READY"
    assert second_state.raw_input == "first input"
    assert second_state.active_job_id == "job-session-test"
    assert call_counts == {
        "ingest": 1,
        "extract": 1,
        "clarify": 0,
        "calculate": 1,
        "quote": 1,
    }

