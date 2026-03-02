from __future__ import annotations

from importlib import import_module

import pytest

from gc_agent.nodes.calculate_materials import calculate_materials
from gc_agent.nodes.generate_quote import generate_quote
from gc_agent.state import AgentState
from gc_agent.tools import supabase
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

recall_module = import_module("gc_agent.nodes.recall_context")
update_memory_module = import_module("gc_agent.nodes.update_memory")


def _install_memory_store(monkeypatch: pytest.MonkeyPatch) -> tuple[dict[str, object], list[dict[str, object]]]:
    """Install in-memory contractor profile and job memory doubles."""
    profile_store: dict[str, object] = {}
    memory_rows: list[dict[str, object]] = []

    def _get_profile(contractor_id: str) -> dict[str, object] | None:
        if contractor_id and profile_store:
            return dict(profile_store)
        return None

    def _upsert_profile(row: dict[str, object]) -> dict[str, object]:
        profile_store.clear()
        profile_store.update(row)
        return dict(profile_store)

    def _insert_memory(row: dict[str, object]) -> dict[str, object]:
        stored = dict(row)
        memory_rows.append(stored)
        return stored

    def _search_memory(
        contractor_id: str,
        embedding: list[float],
        limit: int = 3,
    ) -> list[dict[str, object]]:
        del embedding
        if not contractor_id:
            return []
        matches = []
        for row in memory_rows[:limit]:
            candidate = dict(row)
            candidate["distance"] = 0.05
            matches.append(candidate)
        return matches

    monkeypatch.setattr(supabase, "get_contractor_profile", _get_profile)
    monkeypatch.setattr(supabase, "upsert_contractor_profile", _upsert_profile)
    monkeypatch.setattr(supabase, "insert_job_memory", _insert_memory)
    monkeypatch.setattr(supabase, "search_job_memory_by_embedding", _search_memory)
    return profile_store, memory_rows


def _approved_state() -> AgentState:
    """Build a representative approved estimate state."""
    base_memory = build_phase1_memory_context()
    base_memory["pricing_context"] = dict(base_memory["pricing_context"])

    return AgentState(
        mode="estimate",
        gc_id="00000000-0000-0000-0000-000000000001",
        active_job_id="estimate-job-001",
        cleaned_input="Hail-loss shingle replacement at 500 Oak Meadow, ten square, with upgraded ridge vent and flashing.",
        job_scope={
            "job_type": "roof replacement",
            "customer_name": "Dalton",
            "address": "500 Oak Meadow",
            "measurements": {"roof_squares": 10},
            "damage_notes": "Hail-loss shingle replacement with upgraded ridge vent and flashing.",
            "missing_fields": [],
            "extraction_confidence": "high",
        },
        materials={
            "line_items": [
                {"item": "Tear-off and disposal", "quantity": 10, "unit": "square", "total_cost": 650.0},
                {"item": "Laminated shingles", "quantity": 11, "unit": "square", "total_cost": 1595.0},
            ],
            "subtotal": 1000.0,
            "missing_prices": [],
        },
        memory_context=base_memory,
        quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "customer_name": "Dalton",
            "project_address": "500 Oak Meadow",
            "scope_of_work": "Provide roof replacement at 500 Oak Meadow using standard laminated shingles and accessories.",
            "line_items": [
                {"item": "Tear-off and disposal", "quantity": 10, "unit": "square", "total_cost": 650.0},
                {"item": "Laminated shingles", "quantity": 11, "unit": "square", "total_cost": 1595.0},
            ],
            "total_price": 1150.0,
            "exclusions": ["Decking replacement if required"],
        },
        final_quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "customer_name": "Dalton",
            "project_address": "500 Oak Meadow",
            "scope_of_work": "Install upgraded impact-resistant laminated shingles with matching accessories at 500 Oak Meadow and replace all hail-damaged flashing components.",
            "line_items": [
                {"item": "Tear-off and disposal", "quantity": 10, "unit": "square", "total_cost": 650.0},
                {"item": "Impact-resistant laminated shingles", "quantity": 11, "unit": "square", "total_cost": 1750.0},
            ],
            "total_price": 1380.0,
            "exclusions": ["Decking replacement if required"],
        },
        approval_status="edited",
    )


@pytest.mark.asyncio
async def test_update_memory_persists_approved_quote_and_updates_profile(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile_store, memory_rows = _install_memory_store(monkeypatch)

    async def _fake_embed_text(text: str) -> list[float]:
        assert "impact-resistant laminated shingles" in text.lower()
        return [0.9, 0.1, 0.0]

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)

    state = _approved_state()
    result = await update_memory_module.update_memory(state)

    assert len(memory_rows) == 1
    assert memory_rows[0]["job_id"] == "estimate-job-001"
    assert memory_rows[0]["embedding"] == [0.9, 0.1, 0.0]
    assert profile_store["preferred_scope_language"][0].startswith("Install upgraded impact-resistant")
    assert profile_store["pricing_signals"]["tear_off_per_square"] == 78.0
    assert profile_store["pricing_signals"]["approved_total_per_square"] == 138.0
    assert profile_store["pricing_signals"]["approved_markup_multiplier"] == 1.38
    assert result["memory_context"]["memory_updated"] is True


@pytest.mark.asyncio
async def test_memory_loop_recall_after_update_memory_improves_next_quote(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    profile_store, memory_rows = _install_memory_store(monkeypatch)

    async def _fake_embed_text(text: str) -> list[float]:
        return [1.0, 0.0, 0.0]

    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)

    first_state = _approved_state()
    await update_memory_module.update_memory(first_state)

    second_state = AgentState(
        mode="estimate",
        gc_id=first_state.gc_id,
        cleaned_input="Need another hail-loss replacement at 512 Oak Meadow, ten square, same impact-resistant shingle package.",
        memory_context=build_phase1_memory_context(),
    )

    recall_result = await recall_module.recall_context(second_state)
    recalled_memory = recall_result["memory_context"]

    assert recalled_memory["has_relevant_memory"] is True
    assert recalled_memory["scope_language_examples"][0].startswith("Install upgraded impact-resistant")
    assert recalled_memory["pricing_context"]["tear_off_per_square"] == 78.0

    shared_job_scope = {
        "job_type": "roof replacement",
        "customer_name": "Dalton",
        "address": "512 Oak Meadow",
        "measurements": {"roof_squares": 10},
        "damage_notes": "Second hail-loss shingle replacement on a nearby roof.",
        "missing_fields": [],
        "extraction_confidence": "high",
    }

    baseline_state = AgentState(
        mode="estimate",
        job_scope=shared_job_scope,
        memory_context=build_phase1_memory_context(),
    )
    learned_state = AgentState(
        mode="estimate",
        job_scope=shared_job_scope,
        memory_context=recalled_memory,
    )

    baseline_materials = await calculate_materials(baseline_state)
    learned_materials = await calculate_materials(learned_state)
    quote_state = learned_state.model_copy(update={"materials": learned_materials["materials"]})
    quote_result = await generate_quote(quote_state)

    assert learned_materials["materials"]["subtotal"] > baseline_materials["materials"]["subtotal"]
    assert "impact-resistant laminated shingles" in quote_result["quote_draft"]["scope_of_work"].lower()
    assert len(memory_rows) == 1
    assert profile_store["preferred_scope_language"][0].startswith("Install upgraded impact-resistant")
