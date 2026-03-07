from __future__ import annotations

import pytest

from gc_agent.state import AgentState
from gc_agent.telemetry import trace_node_execution


@pytest.mark.asyncio
async def test_trace_rows_are_written_for_estimate_node_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def _fake_write_agent_trace(**kwargs: object) -> None:
        captured.append(dict(kwargs))

    async def _fake_generate_quote(state: AgentState) -> dict[str, object]:
        assert state.mode == "estimate"
        return {
            "quote_draft": {"scope_of_work": "Replace roof"},
            "active_job_id": "job-1",
        }

    monkeypatch.setattr("gc_agent.telemetry.write_agent_trace", _fake_write_agent_trace)

    wrapped = trace_node_execution("generate_quote", _fake_generate_quote)
    state = AgentState(
        mode="estimate",
        trace_id="trace-estimate-1",
        gc_id="gc-demo",
        input_type="chat",
        thread_id="session-1",
    )

    result = await wrapped(state)

    assert result["active_job_id"] == "job-1"
    assert len(captured) == 1
    assert captured[0]["trace_id"] == "trace-estimate-1"
    assert captured[0]["flow"] == "estimate"
    assert captured[0]["node_name"] == "generate_quote"
    assert captured[0]["status"] == "ok"


@pytest.mark.asyncio
async def test_trace_rows_are_written_when_parse_update_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def _fake_write_agent_trace(**kwargs: object) -> None:
        captured.append(dict(kwargs))

    async def _failing_parse_update(state: AgentState) -> dict[str, object]:
        assert state.mode == "update"
        raise ValueError("bad parse payload")

    monkeypatch.setattr("gc_agent.telemetry.write_agent_trace", _fake_write_agent_trace)

    wrapped = trace_node_execution("parse_update", _failing_parse_update)
    state = AgentState(
        mode="update",
        trace_id="trace-update-fail-1",
        gc_id="gc-demo",
        input_type="whatsapp",
        thread_id="thread-1",
        raw_input="Crew note that breaks parse",
    )

    with pytest.raises(ValueError, match="bad parse payload"):
        await wrapped(state)

    assert len(captured) == 1
    assert captured[0]["trace_id"] == "trace-update-fail-1"
    assert captured[0]["flow"] == "update"
    assert captured[0]["node_name"] == "parse_update"
    assert captured[0]["status"] == "error"
    assert "bad parse payload" in str(captured[0]["error_text"])


@pytest.mark.asyncio
async def test_trace_rows_include_transcript_prompt_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[dict[str, object]] = []

    def _fake_write_agent_trace(**kwargs: object) -> None:
        captured.append(dict(kwargs))

    async def _fake_parse_call_transcript(state: AgentState) -> dict[str, object]:
        assert state.mode == "transcript"
        return {"transcript_analysis": {"classification": "unknown", "summary": "Manual review needed."}}

    monkeypatch.setattr("gc_agent.telemetry.write_agent_trace", _fake_write_agent_trace)

    wrapped = trace_node_execution("parse_call_transcript", _fake_parse_call_transcript)
    state = AgentState(
        mode="transcript",
        trace_id="trace-transcript-1",
        gc_id="gc-demo",
        input_type="voice",
        thread_id="thread-transcript-1",
        raw_input="Customer left a voicemail about the quote.",
    )

    result = await wrapped(state)

    assert result["transcript_analysis"]["classification"] == "unknown"
    assert len(captured) == 1
    assert captured[0]["node_name"] == "parse_call_transcript"
    assert captured[0]["prompt_name"] == "parse_call_transcript"
    assert captured[0]["status"] == "ok"
