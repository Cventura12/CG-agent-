from __future__ import annotations

import json
from importlib import import_module
from pathlib import Path

import pytest

from gc_agent.state import AgentState

ingest_module = import_module("gc_agent.nodes.ingest")
extract_module = import_module("gc_agent.nodes.extract_job_scope")
clarify_module = import_module("gc_agent.nodes.clarify_missing")
calculate_module = import_module("gc_agent.nodes.calculate_materials")


def _load_inputs() -> list[str]:
    fixture_path = Path(__file__).with_name("test_inputs.txt")
    lines = [line.strip() for line in fixture_path.read_text(encoding="utf-8").splitlines()]
    return [line for line in lines if line]


def _load_price_list() -> dict[str, object]:
    fixture_path = Path(__file__).with_name("price_list_fixture.json")
    return json.loads(fixture_path.read_text(encoding="utf-8"))


TEST_INPUTS = _load_inputs()
PRICE_LIST = _load_price_list()


async def _fake_ingest_call(system: str, user: str, max_tokens: int = 600) -> str:
    return " ".join(user.split())


def _extract_payload_for(cleaned_input: str) -> dict[str, object]:
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
            "measurements": {"roof_squares": 7, "pitch": "10/12"},
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


async def _fake_extract_call(system: str, user: str, max_tokens: int = 1200) -> str:
    cleaned_input = user.split("CLEANED_INPUT:\n", 1)[1].split("\n\nMEMORY_CONTEXT:\n", 1)[0].strip()
    return json.dumps(_extract_payload_for(cleaned_input))


async def _fake_clarify_call(system: str, user: str, max_tokens: int = 500) -> str:
    return json.dumps(
        {
            "questions": [
                "What is the customer's name?",
                "Is there anything else missing from the homeowner record?",
            ]
        }
    )


def _build_materials_payload(job_scope: dict[str, object]) -> dict[str, object]:
    measurements = job_scope.get("measurements", {})
    roof_squares = int(float(measurements.get("roof_squares", 1))) if isinstance(measurements, dict) else 1
    waste_factor = 0.1
    billable_squares = max(1, int((roof_squares * (1 + waste_factor)) + 0.999))

    line_items = [
        {
            "item": "Tear-off and disposal",
            "unit": "square",
            "quantity": roof_squares,
            "unit_cost": PRICE_LIST["tear_off_per_square"],
            "total_cost": roof_squares * float(PRICE_LIST["tear_off_per_square"]),
        },
        {
            "item": "Laminated shingles",
            "unit": "square",
            "quantity": billable_squares,
            "unit_cost": PRICE_LIST["laminated_shingles_per_square"],
            "total_cost": billable_squares * float(PRICE_LIST["laminated_shingles_per_square"]),
        },
        {
            "item": "Synthetic underlayment",
            "unit": "square",
            "quantity": billable_squares,
            "unit_cost": PRICE_LIST["synthetic_underlayment_per_square"],
            "total_cost": billable_squares * float(PRICE_LIST["synthetic_underlayment_per_square"]),
        },
    ]

    subtotal = sum(float(item["total_cost"]) for item in line_items)
    return {
        "line_items": line_items,
        "assumptions": ["Used fixture pricing.", "Applied 10% waste factor."],
        "waste_factor": waste_factor,
        "subtotal": subtotal,
        "missing_prices": [],
        "roof_squares": roof_squares,
    }


async def _fake_calculate_call(system: str, user: str, max_tokens: int = 1400) -> str:
    job_scope_text = user.split("JOB_SCOPE:\n", 1)[1].split("\n\nPRICING_CONTEXT:\n", 1)[0].strip()
    job_scope = json.loads(job_scope_text)
    return json.dumps(_build_materials_payload(job_scope))


@pytest.mark.asyncio
@pytest.mark.parametrize("raw_input", TEST_INPUTS)
async def test_full_path_from_ingest_through_calculate(
    monkeypatch: pytest.MonkeyPatch,
    raw_input: str,
) -> None:
    monkeypatch.setattr(ingest_module, "_call_claude", _fake_ingest_call)
    monkeypatch.setattr(extract_module, "_call_claude", _fake_extract_call)
    monkeypatch.setattr(clarify_module, "_call_claude", _fake_clarify_call)
    monkeypatch.setattr(calculate_module, "_call_claude", _fake_calculate_call)

    state = AgentState(
        raw_input=raw_input,
        mode="estimate",
        memory_context={"pricing_context": PRICE_LIST},
    )

    ingest_result = await ingest_module.ingest(state)
    state = state.model_copy(update=ingest_result)

    extract_result = await extract_module.extract_job_scope(state)
    state = state.model_copy(update=extract_result)

    if state.clarification_needed:
        clarify_result = await clarify_module.clarify_missing(state)
        assert len(clarify_result["clarification_questions"]) <= 3
        state = state.model_copy(update=clarify_result)

    calculate_result = await calculate_module.calculate_materials(state)
    materials = calculate_result["materials"]

    assert isinstance(materials, dict)
    assert isinstance(materials["line_items"], list)
    assert len(materials["line_items"]) >= 3
    assert materials["missing_prices"] == []
    assert materials["subtotal"] > 0

    for item in materials["line_items"]:
        assert item["item"]
        assert float(item["quantity"]) > 0
        assert float(item["total_cost"]) >= 0
