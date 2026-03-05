from __future__ import annotations

import pytest

from gc_agent.nodes.draft_actions import draft_actions
from gc_agent.state import AgentState


@pytest.mark.asyncio
async def test_draft_actions_writes_update_log_even_when_parse_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    async def _fake_write_update_log(**kwargs: object) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(draft_actions.__globals__["queries"], "write_update_log", _fake_write_update_log)

    state = AgentState(
        gc_id="gc-demo",
        input_type="chat",
        raw_input="Crew update that failed to parse",
        trace_id="trace-parse-fail",
        errors=["parse_update failed: invalid JSON"],
    )

    result = await draft_actions(state)

    assert result["drafts_created"] == []
    assert captured["gc_id"] == "gc-demo"
    assert captured["input_type"] == "chat"
    assert captured["raw_input"] == "Crew update that failed to parse"
    assert captured["parsed"] is None
    assert captured["draft_ids"] == []
    assert captured["trace_id"] == "trace-parse-fail"
    assert captured["affected_job_ids"] == []
    assert captured["errors"] == ["parse_update failed: invalid JSON"]
