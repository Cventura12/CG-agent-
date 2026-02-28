from __future__ import annotations

from importlib import import_module
from pathlib import Path

import pytest

from gc_agent import prompts
from gc_agent.state import AgentState

ingest_module = import_module("gc_agent.nodes.ingest")


def _load_inputs() -> list[str]:
    fixture_path = Path(__file__).with_name("test_inputs.txt")
    lines = [line.strip() for line in fixture_path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line]


TEST_INPUTS = _load_inputs()


async def _fake_call_claude(system: str, user: str, max_tokens: int = 600) -> str:
    assert system == prompts.INGEST_SYSTEM
    assert max_tokens == 600
    return " ".join(user.replace("uh", "").replace("voice memo", "").split())


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_input", TEST_INPUTS)
async def test_ingest_normalizes_estimating_input(
    monkeypatch: pytest.MonkeyPatch,
    raw_input: str,
) -> None:
    monkeypatch.setattr(ingest_module, "_call_claude", _fake_call_claude)

    state = AgentState(raw_input=raw_input, mode="estimate")
    result = await ingest_module.ingest(state)

    assert result["mode"] == "estimate"
    assert result["thread_style"] is False
    assert result["raw_input"] == raw_input.strip()
    assert isinstance(result["cleaned_input"], str)
    assert result["cleaned_input"]
    assert "  " not in result["cleaned_input"]


def test_ingest_fixture_count_is_thirty() -> None:
    assert len(TEST_INPUTS) == 30
