from __future__ import annotations

import json
from importlib import import_module

import pytest

from gc_agent.state import AgentState
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

quote_module = import_module("gc_agent.nodes.generate_quote")


async def _fake_quote_call(system: str, user: str, max_tokens: int = 1800) -> str:
    assert max_tokens == 1800
    payload = {
        "company_name": "Cventura Roofing & Exteriors",
        "customer_name": "Mrs Dalton",
        "project_address": "92 Elm Street",
        "scope_of_work": "Replace damaged shingles and ridge cap on the back slope at 92 Elm Street.",
        "line_items": [
            {
                "item": "Tear-off and disposal",
                "unit": "square",
                "quantity": 2,
                "unit_cost": 65,
                "total_cost": 130,

            },
            {
                "item": "Laminated shingles",
                "unit": "square",
                "quantity": 3,
                "unit_cost": 145,
                "total_cost": 435,
            },
        ],
        "total_price": 650,
        "exclusions": [
            "Decking replacement beyond visible damage is excluded.",
        ],
        "approval_notes": "Verify field measurements before sending.",
    }
    return json.dumps(payload)


@pytest.mark.asyncio
async def test_generate_quote_returns_valid_quote_and_render(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(quote_module, "_call_claude", _fake_quote_call)

    state = AgentState(
        mode="estimate",
        job_scope={
            "job_type": "hail repair",
            "customer_name": "Mrs Dalton",
            "address": "92 Elm Street",
            "damage_notes": "Back slope hail loss with ridge cap damage.",
            "missing_fields": [],
            "extraction_confidence": "high",
        },
        materials={
            "line_items": [
                {"item": "Tear-off and disposal", "unit": "square", "quantity": 2, "total_cost": 130},
                {"item": "Laminated shingles", "unit": "square", "quantity": 3, "total_cost": 435},
            ],
            "subtotal": 565,
            "missing_prices": [],
        },
        memory_context=build_phase1_memory_context(),
    )

    result = await quote_module.generate_quote(state)
    quote_draft = result["quote_draft"]

    assert quote_draft["company_name"]
    assert quote_draft["scope_of_work"]
    assert quote_draft["total_price"] > 0
    assert quote_draft["exclusions"]
    assert "GC AGENT QUOTE DRAFT" in result["rendered_quote"]
    assert "Total Price:" in result["rendered_quote"]
