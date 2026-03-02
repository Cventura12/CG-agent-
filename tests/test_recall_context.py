from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
import pytest

from gc_agent import cli
from gc_agent.state import AgentState
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context
from gc_agent.tools import supabase

recall_module = import_module("gc_agent.nodes.recall_context")

CONTRACTOR_PROFILE_FIXTURE = {
    "contractor_id": "00000000-0000-0000-0000-000000000001",
    "company_name": "Cventura Roofing & Exteriors",
    "preferred_scope_language": [
        "Install upgraded impact-resistant laminated shingles with matching accessories.",
        "Complete clean-up daily and magnetic sweep at final completion.",
    ],
    "pricing_signals": {
        "laminated_shingles_per_square": 152.0,
        "labor_markup_pct": 0.18,
    },
    "material_preferences": {
        "shingle_brand": "Atlas Pinnacle",
    },
    "notes": "Prefers to lead with impact-resistant upgrade options on hail losses.",
}

JOB_MEMORY_FIXTURES = [
    {
        "id": "memory-001",
        "contractor_id": CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        "job_id": "job-101",
        "scope_text": "Thirty-two square hail-loss shingle replacement on Oak Meadow with ridge vent and chimney flashing.",
        "summary": "32-square hail-loss shingle replacement with chimney flashing and ridge vent replacement.",
        "embedding": [1.0, 0.0, 0.0],
        "metadata": {
            "pricing_context": {
                "tear_off_per_square": 68.0,
            },
            "scope_language": "Remove all hail-damaged roofing materials down to the deck and replace accessory flashings as required.",
        },
        "distance": 0.08,
    },
    {
        "id": "memory-002",
        "contractor_id": CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        "job_id": "job-102",
        "scope_text": "Insurance-funded shingle replacement on Elm Ridge with upgraded underlayment and starter.",
        "summary": "Insurance replacement with upgraded underlayment, starter, and drip edge.",
        "embedding": [0.94, 0.06, 0.0],
        "metadata": {
            "pricing_context": {
                "synthetic_underlayment_per_square": 19.0,
            },
        },
        "distance": 0.14,
    },
    {
        "id": "memory-003",
        "contractor_id": CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        "job_id": "job-103",
        "scope_text": "Steep 10/12 laminated shingle replacement with step flashing resets.",
        "summary": "Steep-slope shingle replacement with heavy flashing detail work.",
        "embedding": [0.91, 0.09, 0.01],
        "metadata": {
            "pricing_context": {
                "starter_strip_per_square": 18.0,
            },
        },
        "distance": 0.22,
    },
    {
        "id": "memory-004",
        "contractor_id": CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        "job_id": "job-104",
        "scope_text": "Small repair-only leak call on Pine Hollow with valley metal patch.",
        "summary": "Leak repair and valley metal patch at Pine Hollow.",
        "embedding": [0.35, 0.45, 0.2],
        "metadata": {},
        "distance": 0.71,
    },
    {
        "id": "memory-005",
        "contractor_id": CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        "job_id": "job-105",
        "scope_text": "Low-slope modified bitumen recover over warehouse office section.",
        "summary": "Modified bitumen recover with drain work and edge metal replacement.",
        "embedding": [0.2, 0.8, 0.1],
        "metadata": {},
        "distance": 0.77,
    },
]


@pytest.mark.asyncio
async def test_recall_context_returns_relevant_memory_when_similar_jobs_exist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_embed_text(text: str) -> list[float]:
        assert "hail" in text.lower()
        return [1.0, 0.0, 0.0]

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)
    monkeypatch.setattr(
        supabase,
        "get_contractor_profile",
        lambda contractor_id: CONTRACTOR_PROFILE_FIXTURE if contractor_id else None,
    )
    monkeypatch.setattr(
        supabase,
        "search_job_memory_by_embedding",
        lambda contractor_id, embedding, limit=3: JOB_MEMORY_FIXTURES[:limit],
    )

    state = AgentState(
        mode="estimate",
        gc_id=CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
        cleaned_input="Need a hail-loss replacement at 418 Oak Meadow, about thirty two square, with chimney flashing.",
        memory_context=build_phase1_memory_context(),
    )

    result = await recall_module.recall_context(state)
    memory_context = result["memory_context"]

    assert memory_context["has_relevant_memory"] is True
    assert memory_context["recall_context_ready"] is True
    assert len(memory_context["similar_jobs"]) == 3
    assert memory_context["pricing_context"]["laminated_shingles_per_square"] == 152.0
    assert memory_context["pricing_context"]["tear_off_per_square"] == 68.0
    assert any(
        "impact-resistant laminated shingles" in item
        for item in memory_context["scope_language_examples"]
    )
    assert "Contractor profile: Cventura Roofing & Exteriors" in memory_context["formatted_context"]
    assert "Relevant past jobs:" in memory_context["formatted_context"]


@dataclass
class _RecordedCall:
    memory_has_relevant: bool = False


@pytest.mark.asyncio
async def test_run_single_estimate_injects_recalled_memory_before_extract(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded = _RecordedCall()

    async def _fake_ingest(state: AgentState) -> dict[str, object]:
        return {
            "mode": "estimate",
            "raw_input": state.raw_input,
            "cleaned_input": state.raw_input,
        }

    async def _fake_recall(state: AgentState) -> dict[str, object]:
        memory_context = dict(state.memory_context)
        memory_context.update(
            {
                "has_relevant_memory": True,
                "recall_context_ready": True,
                "formatted_context": "Relevant memory loaded.",
                "similar_jobs": JOB_MEMORY_FIXTURES[:3],
            }
        )
        return {"memory_context": memory_context}

    async def _fake_extract(state: AgentState) -> dict[str, object]:
        recorded.memory_has_relevant = bool(state.memory_context.get("has_relevant_memory"))
        return {
            "job_scope": {
                "job_type": "roof replacement",
                "address": "418 Oak Meadow",
                "customer_name": "Dalton",
                "measurements": {"roof_squares": 32},
                "damage_notes": state.cleaned_input,
                "missing_fields": [],
                "extraction_confidence": "high",
            },
            "clarification_needed": False,
        }

    async def _fake_calculate(state: AgentState) -> dict[str, object]:
        return {
            "materials": {
                "line_items": [{"item": "Laminated shingles", "total_cost": 1000.0}],
                "subtotal": 1000.0,
                "missing_prices": [],
            }
        }

    async def _fake_quote(state: AgentState) -> dict[str, object]:
        return {
            "quote_draft": {
                "company_name": "Cventura Roofing & Exteriors",
                "scope_of_work": "Replace hail-damaged roof.",
                "total_price": 1150.0,
                "exclusions": ["Decking replacement if required"],
            },
            "rendered_quote": "QUOTE READY",
        }

    monkeypatch.setattr(cli, "ingest", _fake_ingest)
    monkeypatch.setattr(cli, "recall_context", _fake_recall)
    monkeypatch.setattr(cli, "extract_job_scope", _fake_extract)
    monkeypatch.setattr(cli, "calculate_materials", _fake_calculate)
    monkeypatch.setattr(cli, "generate_quote", _fake_quote)

    state = await cli.run_single_estimate(
        "Need a hail-loss replacement at 418 Oak Meadow",
        session_id="",
        gc_id=CONTRACTOR_PROFILE_FIXTURE["contractor_id"],
    )

    assert state.rendered_quote == "QUOTE READY"
    assert recorded.memory_has_relevant is True
