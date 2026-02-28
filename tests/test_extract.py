from __future__ import annotations

import json
from importlib import import_module
from pathlib import Path

import pytest

from gc_agent import prompts
from gc_agent.state import AgentState

extract_module = import_module("gc_agent.nodes.extract_job_scope")


def _load_inputs() -> list[str]:
    fixture_path = Path(__file__).with_name("test_inputs.txt")
    lines = [line.strip() for line in fixture_path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line]


TEST_INPUTS = _load_inputs()


def _payload_for(cleaned_input: str) -> dict[str, object]:
    lower = cleaned_input.lower()

    if "elm street" in lower:
        return {
            "job_type": "hail repair",
            "customer_name": "Mrs Dalton",
            "address": "92 Elm Street",
            "measurements": {"roof_squares": 2, "pitch": "6/12"},
            "damage_notes": "Back slope hail loss with ridge cap damage.",
            "missing_fields": [],
            "extraction_confidence": "high",
        }
    if "oak meadow" in lower:
        return {
            "job_type": "full tear-off replacement",
            "customer_name": "",
            "address": "418 Oak Meadow Lane",
            "measurements": {"roof_squares": 26, "layers": 2},
            "damage_notes": "Soft decking by chimney and insurance claim involvement.",
            "missing_fields": ["customer_name"],
            "extraction_confidence": "medium",
        }
    if "cedar run" in lower:
        return {
            "job_type": "repair",
            "customer_name": "Johnsons",
            "address": "Cedar Run",
            "measurements": {"pitch": "10/12", "area": "front slope only"},
            "damage_notes": "Valley and flashing repair on steep slope.",
            "missing_fields": [],
            "extraction_confidence": "medium",
        }
    if "pine road" in lower:
        return {
            "job_type": "modified bitumen replacement",
            "customer_name": "Church office",
            "address": "77 Pine Road",
            "measurements": {"roof_squares": 8, "roof_type": "low slope"},
            "damage_notes": "Ponding near drain with gutter replacement requested.",
            "missing_fields": [],
            "extraction_confidence": "high",
        }
    return {
        "job_type": "wind damage replacement",
        "customer_name": "Maple Court Duplex",
        "address": "Maple Court",
        "measurements": {"roof_squares": 32},
        "damage_notes": "Wind damage on both sides; plywood replacement likely.",
        "missing_fields": [],
        "extraction_confidence": "medium",
    }


async def _fake_call_claude(system: str, user: str, max_tokens: int = 1200) -> str:
    assert system == prompts.EXTRACT_JOB_SCOPE_SYSTEM
    assert max_tokens == 1200
    cleaned_input = user.split("CLEANED_INPUT:\n", 1)[1].split("\n\nMEMORY_CONTEXT:\n", 1)[0].strip()
    return json.dumps(_payload_for(cleaned_input))


@pytest.mark.asyncio
@pytest.mark.parametrize("cleaned_input", TEST_INPUTS)
async def test_extract_job_scope_produces_valid_job_scope(
    monkeypatch: pytest.MonkeyPatch,
    cleaned_input: str,
) -> None:
    monkeypatch.setattr(extract_module, "_call_claude", _fake_call_claude)

    state = AgentState(
        mode="estimate",
        cleaned_input=cleaned_input,
        memory_context={"pricing_context": {"shingles_per_square": 145}},
    )
    result = await extract_module.extract_job_scope(state)
    job_scope = result["job_scope"]

    assert isinstance(job_scope, dict)
    assert isinstance(job_scope["missing_fields"], list)
    assert isinstance(job_scope["measurements"], dict)
    assert job_scope["damage_notes"]
    assert job_scope["extraction_confidence"]
    assert result["clarification_needed"] is bool(job_scope["missing_fields"])


@pytest.mark.asyncio
async def test_extract_job_scope_falls_back_on_malformed_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _bad_call(system: str, user: str, max_tokens: int = 1200) -> str:
        return "not-json"

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(extract_module, "_call_claude", _bad_call)

    state = AgentState(mode="estimate", cleaned_input=TEST_INPUTS[0])
    result = await extract_module.extract_job_scope(state)
    job_scope = result["job_scope"]

    assert job_scope["extraction_confidence"] == "low"
    assert result["clarification_needed"] is True
    assert "errors" in result
