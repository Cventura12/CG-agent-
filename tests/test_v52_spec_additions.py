from __future__ import annotations

from importlib import import_module

import pytest

from gc_agent.state import AgentState
from gc_agent.tools import supabase
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

recall_module = import_module("gc_agent.nodes.recall_context")
update_memory_module = import_module("gc_agent.nodes.update_memory")


@pytest.mark.asyncio
async def test_recall_context_merges_explicit_price_list_and_estimating_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    async def _fake_embed_text(text: str) -> list[float]:
        assert "roof" in text.lower()
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)
    monkeypatch.setattr(supabase, "get_price_list_map", lambda contractor_id: {
        "tear_off_per_square": 82.0,
        "laminated_shingles_per_square": 168.0,
    })
    monkeypatch.setattr(supabase, "get_contractor_profile", lambda contractor_id: None)
    monkeypatch.setattr(supabase, "search_job_memory_by_embedding", lambda contractor_id, embedding, limit=3: [])
    monkeypatch.setattr(
        supabase,
        "get_best_estimating_memory",
        lambda contractor_id, trade_type="", job_type="", material_type="": {
            "id": "estimating-memory-1",
            "contractor_id": contractor_id,
            "job_id": None,
            "trade_type": "roofing",
            "job_type": "roof replacement",
            "material_type": "shingle",
            "avg_waste_factor": 0.13,
            "labor_hours_per_unit": 1.25,
            "avg_markup": 1.34,
            "scope_language_examples": [
                "Install upgraded impact-resistant laminated shingles with matching accessories.",
            ],
            "confidence_score": 0.6,
            "sample_count": 6,
            "source_memory_id": None,
        },
    )

    state = AgentState(
        mode="estimate",
        gc_id="00000000-0000-0000-0000-000000000001",
        cleaned_input="Need a roof replacement quote from the job site.",
        memory_context=build_phase1_memory_context(),
    )

    result = await recall_module.recall_context(state)
    memory_context = result["memory_context"]

    assert memory_context["price_list"]["tear_off_per_square"] == 82.0
    assert memory_context["pricing_context"]["tear_off_per_square"] == 82.0
    assert memory_context["estimating_memory"]["job_type"] == "roof replacement"
    assert any(
        "impact-resistant laminated shingles" in item
        for item in memory_context["scope_language_examples"]
    )


@pytest.mark.asyncio
async def test_update_memory_writes_price_list_and_estimating_memory(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    recorded: dict[str, object] = {}

    async def _fake_embed_text(text: str) -> list[float]:
        return [0.9, 0.1, 0.0]

    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)
    monkeypatch.setattr(supabase, "get_contractor_profile", lambda contractor_id: None)
    monkeypatch.setattr(supabase, "insert_job_memory", lambda row: row)
    monkeypatch.setattr(supabase, "upsert_contractor_profile", lambda row: row)

    def _record_price_list(contractor_id: str, pricing: dict[str, object]) -> dict[str, float]:
        recorded["price_list"] = dict(pricing)
        return {"tear_off_per_square": 78.0}

    def _record_estimating_memory(row: dict[str, object]) -> dict[str, object]:
        recorded["estimating_memory"] = dict(row)
        return dict(row)

    monkeypatch.setattr(supabase, "upsert_price_list_entries", _record_price_list)
    monkeypatch.setattr(supabase, "upsert_estimating_memory", _record_estimating_memory)

    state = AgentState(
        mode="estimate",
        gc_id="00000000-0000-0000-0000-000000000001",
        active_job_id="estimate-job-001",
        job_scope={
            "job_type": "roof replacement",
            "damage_notes": "Hail-loss laminated shingle replacement.",
            "measurements": {"roof_squares": 10},
        },
        materials={
            "waste_factor": 0.12,
            "subtotal": 1000.0,
        },
        memory_context=build_phase1_memory_context(),
        quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "scope_of_work": "Provide roof replacement using standard laminated shingles.",
            "total_price": 1150.0,
            "line_items": [],
        },
        final_quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "scope_of_work": "Install upgraded impact-resistant laminated shingles with matching accessories.",
            "total_price": 1380.0,
            "line_items": [],
        },
        approval_status="edited",
    )

    result = await update_memory_module.update_memory(state)

    assert "price_list" in recorded
    assert recorded["price_list"]["tear_off_per_square"] == 78.0
    assert recorded["estimating_memory"]["trade_type"] == "roofing"
    assert recorded["estimating_memory"]["job_type"] == "roof replacement"
    assert recorded["estimating_memory"]["material_type"] == "shingle"
    assert result["memory_context"]["price_list"]["tear_off_per_square"] == 78.0
