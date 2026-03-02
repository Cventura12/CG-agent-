"""Day 15 Phase 2 integration sign-off tests."""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from gc_agent import cli
from gc_agent.nodes.calculate_materials import calculate_materials
from gc_agent.nodes.generate_quote import generate_quote
from gc_agent.state import AgentState, Draft, ParsedIntent
from gc_agent.tools import supabase
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

ingest_module = import_module("gc_agent.nodes.ingest")
recall_module = import_module("gc_agent.nodes.recall_context")
update_memory_module = import_module("gc_agent.nodes.update_memory")

LEARNED_TERMS = (
    "impact-resistant",
    "high-profile ridge vent",
    "synthetic underlayment",
    "widened drip edge",
)


@dataclass
class _Snapshot:
    """Minimal checkpoint snapshot wrapper used by graph doubles."""

    values: dict[str, object]


class _PersistentGraphDouble:
    """Serializable in-memory checkpoint graph used to simulate restarts."""

    def __init__(self, store: dict[str, dict[str, object]]) -> None:
        self._store = store

    async def aupdate_state(
        self,
        config: dict[str, dict[str, str]],
        values: dict[str, object],
        as_node: str | None = None,
        task_id: str | None = None,
    ) -> dict[str, dict[str, str]]:
        del as_node, task_id
        thread_id = config["configurable"]["thread_id"]
        self._store[thread_id] = dict(values)
        return config

    async def aget_state(self, config: dict[str, dict[str, str]]) -> _Snapshot | None:
        thread_id = config["configurable"]["thread_id"]
        values = self._store.get(thread_id)
        if values is None:
            return None
        return _Snapshot(values=dict(values))


def _install_memory_store(
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[dict[str, object], list[dict[str, object]]]:
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

        matches: list[dict[str, object]] = []
        recent_rows = list(reversed(memory_rows[-limit:]))
        for index, row in enumerate(recent_rows):
            candidate = dict(row)
            candidate["distance"] = round(0.02 + (index * 0.02), 4)
            matches.append(candidate)
        return matches

    monkeypatch.setattr(supabase, "get_contractor_profile", _get_profile)
    monkeypatch.setattr(supabase, "upsert_contractor_profile", _upsert_profile)
    monkeypatch.setattr(supabase, "insert_job_memory", _insert_memory)
    monkeypatch.setattr(supabase, "search_job_memory_by_embedding", _search_memory)
    return profile_store, memory_rows


def _approved_state(round_number: int, gc_id: str) -> AgentState:
    """Build one approved quote state for the memory loop."""
    base_memory = build_phase1_memory_context()
    base_memory["pricing_context"] = dict(base_memory["pricing_context"])

    address = f"{500 + (round_number * 12)} Oak Meadow"
    final_scope = (
        f"Install premium impact-resistant laminated shingles with high-profile ridge vent, "
        f"synthetic underlayment, and widened drip edge at {address}. Replace all hail-damaged "
        "flashing components and reseal exposed penetrations."
    )

    return AgentState(
        mode="estimate",
        gc_id=gc_id,
        active_job_id=f"estimate-job-{round_number:03d}",
        cleaned_input=(
            f"Hail-loss replacement at {address}, ten square roof, upgraded ridge vent, "
            "and all flashing reset."
        ),
        job_scope={
            "job_type": "roof replacement",
            "customer_name": f"Customer {round_number}",
            "address": address,
            "measurements": {"roof_squares": 10},
            "damage_notes": "Hail-loss shingle replacement with upgraded accessories.",
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
            "customer_name": f"Customer {round_number}",
            "project_address": address,
            "scope_of_work": f"Provide roof replacement at {address} using standard laminated shingles.",
            "line_items": [
                {"item": "Tear-off and disposal", "quantity": 10, "unit": "square", "total_cost": 650.0},
                {"item": "Laminated shingles", "quantity": 11, "unit": "square", "total_cost": 1595.0},
            ],
            "total_price": 1150.0,
            "exclusions": ["Decking replacement if required"],
        },
        final_quote_draft={
            "company_name": "Cventura Roofing & Exteriors",
            "customer_name": f"Customer {round_number}",
            "project_address": address,
            "scope_of_work": final_scope,
            "line_items": [
                {"item": "Tear-off and disposal", "quantity": 10, "unit": "square", "total_cost": 650.0},
                {
                    "item": "Impact-resistant laminated shingles",
                    "quantity": 11,
                    "unit": "square",
                    "total_cost": 1750.0,
                },
            ],
            "total_price": 1400.0 + (round_number * 80.0),
            "exclusions": ["Decking replacement if required"],
        },
        approval_status="edited",
    )


def _quote_quality_score(quote_draft: dict[str, object], expected_address: str) -> int:
    """Score quote specificity with extra weight for learned language."""
    scope = str(quote_draft.get("scope_of_work") or "").lower()
    project_address = str(quote_draft.get("project_address") or "")
    total_price = float(quote_draft.get("total_price") or 0.0)

    score = 0
    if project_address == expected_address:
        score += 1
    if expected_address.lower() in scope:
        score += 1
    if total_price > 0:
        score += 1
    if any(term in scope for term in LEARNED_TERMS):
        score += 1
    if "project site" in scope:
        score += 1
    return score


async def _memory_quality_summary(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    """Build the Day 15 memory loop summary used by the test and sign-off doc."""
    gc_id = "00000000-0000-0000-0000-000000000001"
    _, memory_rows = _install_memory_store(monkeypatch)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    async def _fake_embed_text(text: str) -> list[float]:
        del text
        return [1.0, 0.0, 0.0]

    monkeypatch.setattr(recall_module, "_embed_text", _fake_embed_text)

    recall_progression: list[int] = []
    for round_number in range(1, 4):
        await update_memory_module.update_memory(_approved_state(round_number, gc_id))
        probe_state = AgentState(
            mode="estimate",
            gc_id=gc_id,
            cleaned_input=(
                f"Need another hail-loss replacement at {700 + round_number} Signal Ridge, "
                "ten square, same upgraded package."
            ),
            memory_context=build_phase1_memory_context(),
        )
        recall_result = await recall_module.recall_context(probe_state)
        recall_progression.append(len(recall_result["memory_context"]["similar_jobs"]))

    final_probe = AgentState(
        mode="estimate",
        gc_id=gc_id,
        cleaned_input="Need a quote for another ten square hail-loss roof with the upgraded package.",
        memory_context=build_phase1_memory_context(),
    )
    final_recall = await recall_module.recall_context(final_probe)
    learned_memory = final_recall["memory_context"]

    baseline_scores: list[int] = []
    learned_scores: list[int] = []
    learned_scope_samples: list[str] = []

    for index in range(5):
        address = f"{810 + index} Contractor Loop"
        job_scope = {
            "job_type": "roof replacement",
            "customer_name": f"Quote Customer {index + 1}",
            "address": address,
            "measurements": {"roof_squares": 10},
            "damage_notes": "Repeat hail-loss replacement with upgraded components.",
            "missing_fields": [],
            "extraction_confidence": "high",
        }

        baseline_state = AgentState(
            mode="estimate",
            job_scope=job_scope,
            memory_context=build_phase1_memory_context(),
        )
        learned_state = AgentState(
            mode="estimate",
            job_scope=job_scope,
            memory_context=learned_memory,
        )

        baseline_materials = await calculate_materials(baseline_state)
        learned_materials = await calculate_materials(learned_state)

        baseline_quote = await generate_quote(
            baseline_state.model_copy(update={"materials": baseline_materials["materials"]})
        )
        learned_quote = await generate_quote(
            learned_state.model_copy(update={"materials": learned_materials["materials"]})
        )

        baseline_scores.append(_quote_quality_score(baseline_quote["quote_draft"], address))
        learned_scores.append(_quote_quality_score(learned_quote["quote_draft"], address))
        learned_scope_samples.append(str(learned_quote["quote_draft"]["scope_of_work"]))

    baseline_average = round(sum(baseline_scores) / len(baseline_scores), 2)
    learned_average = round(sum(learned_scores) / len(learned_scores), 2)

    return {
        "memory_rows": len(memory_rows),
        "recall_progression": recall_progression,
        "baseline_scores": baseline_scores,
        "learned_scores": learned_scores,
        "baseline_average": baseline_average,
        "learned_average": learned_average,
        "learned_scope_samples": learned_scope_samples,
        "scope_language_examples": list(learned_memory.get("scope_language_examples", [])),
    }


@pytest.mark.asyncio
async def test_phase2_routes_both_paths_and_resumes_after_restart(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify routed CLI behavior for both paths and checkpoint resume after a simulated restart."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    def _fake_find_job(gc_id: str, address: str, customer_name: str) -> None:
        _ = (gc_id, address, customer_name)
        return None

    def _fake_upsert_job(row: dict[str, object]) -> dict[str, object]:
        stored = dict(row)
        stored["id"] = "job-estimate-1"
        return stored

    async def _fake_resolve_jobs(gc_id: str) -> list[object]:
        del gc_id
        return []

    async def _fake_parse_update(state: AgentState) -> dict[str, object]:
        return {
            "parsed_intent": ParsedIntent(
                understanding="Operational update captured.",
                drafts=[
                    {
                        "type": "owner-update",
                        "title": "Reschedule inspection",
                        "content": f"Operational note: {state.raw_input}",
                        "why": "Crew delay needs owner-facing communication.",
                    }
                ],
            )
        }

    async def _fake_update_state(state: AgentState) -> dict[str, object]:
        del state
        return {}

    async def _fake_flag_risks(state: AgentState) -> dict[str, object]:
        del state
        return {"risk_flags": ["Inspection date may slip by 48 hours."]}

    async def _fake_draft_actions(state: AgentState) -> dict[str, object]:
        return {
            "drafts_created": [
                Draft(
                    id="draft-update-1",
                    job_id="job-miller-1",
                    job_name="Miller Job",
                    type="owner-update",
                    title="Reschedule inspection",
                    content=f"Operational note: {state.raw_input}",
                    why="Crew delay needs owner-facing communication.",
                )
            ]
        }

    async def _fake_recall(state: AgentState) -> dict[str, object]:
        memory_context = dict(state.memory_context)
        memory_context["recall_context_ready"] = True
        return {"memory_context": memory_context}

    async def _fake_extract(state: AgentState) -> dict[str, object]:
        return {
            "job_scope": {
                "address": "14 Oak Lane",
                "customer_name": "Taylor",
                "measurements": {"roof_squares": 32},
                "missing_fields": [],
            },
            "clarification_needed": False,
        }

    async def _fake_calculate(state: AgentState) -> dict[str, object]:
        del state
        return {
            "materials": {
                "subtotal": 12450,
                "line_items": [{"item": "Shingles", "quantity": 32, "unit": "square", "total_cost": 12450}],
            }
        }

    quote_attempts = {"count": 0}

    async def _crashing_quote(state: AgentState) -> dict[str, object]:
        quote_attempts["count"] += 1
        raise RuntimeError("simulated quote node crash")

    async def _working_quote(state: AgentState) -> dict[str, object]:
        quote_attempts["count"] += 1
        return {
            "quote_draft": {
                "company_name": "GC Agent Roofing",
                "customer_name": "Taylor",
                "project_address": "14 Oak Lane",
                "scope_of_work": f"Provide roof replacement at 14 Oak Lane. {state.cleaned_input}",
                "line_items": state.materials.get("line_items", []),
                "total_price": 14317.5,
                "exclusions": ["Decking replacement if hidden damage is found"],
            },
            "rendered_quote": "QUOTE READY",
        }

    monkeypatch.setattr(supabase, "find_job_by_address_or_customer", _fake_find_job)
    monkeypatch.setattr(supabase, "upsert_job", _fake_upsert_job)
    monkeypatch.setattr(cli, "_resolve_active_jobs", _fake_resolve_jobs)
    monkeypatch.setattr(cli, "parse_update", _fake_parse_update)
    monkeypatch.setattr(cli, "update_state", _fake_update_state)
    monkeypatch.setattr(cli, "flag_risks", _fake_flag_risks)
    monkeypatch.setattr(cli, "draft_actions", _fake_draft_actions)
    monkeypatch.setattr(cli, "recall_context", _fake_recall)
    monkeypatch.setattr(cli, "extract_job_scope", _fake_extract)
    monkeypatch.setattr(cli, "calculate_materials", _fake_calculate)

    update_state = await cli.run_single_input(
        "Framing crew is behind on the Miller job, need to reschedule inspection",
    )
    assert update_state.mode == "update"
    assert len(update_state.drafts_created) == 1
    assert update_state.rendered_quote == ""

    shared_store: dict[str, dict[str, object]] = {}
    session_id = "phase2-resume-check"

    monkeypatch.setattr(cli, "graph", _PersistentGraphDouble(shared_store))
    monkeypatch.setattr(cli, "generate_quote", _crashing_quote)

    with pytest.raises(RuntimeError, match="simulated quote node crash"):
        await cli.run_single_estimate(
            "Need a quote for 32 squares at 14 Oak Lane with 8/12 pitch",
            session_id=session_id,
            gc_id="gc-test",
        )

    monkeypatch.setattr(cli, "graph", _PersistentGraphDouble(shared_store))
    monkeypatch.setattr(cli, "generate_quote", _working_quote)

    resumed_state = await cli.run_single_estimate(
        "Need a quote for 32 squares at 14 Oak Lane with 8/12 pitch",
        session_id=session_id,
        gc_id="gc-test",
    )

    assert resumed_state.mode == "estimate"
    assert resumed_state.rendered_quote == "QUOTE READY"
    assert resumed_state.active_job_id == "job-estimate-1"
    assert quote_attempts["count"] == 2


@pytest.mark.asyncio
async def test_phase2_ade_preprocessing_verified_on_three_document_types(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Verify ADE preprocessing across PDF and image documents before estimate ingest."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("VISION_AGENT_API_KEY", "test-vision-key")

    class _FakeLandingAIADE:
        def parse(self, document: Path, model: str) -> SimpleNamespace:
            del model
            suffix = document.suffix.lower()
            payloads = {
                ".pdf": "Xactimate scope extract: 32 squares and ridge vent replacement.",
                ".jpg": "Jobsite photo note: chimney flashing damage on front slope.",
                ".png": "Supplier invoice: synthetic underlayment and drip edge delivered.",
            }
            return SimpleNamespace(markdown=payloads[suffix], chunks=[])

    monkeypatch.setitem(
        __import__("sys").modules,
        "landingai_ade",
        SimpleNamespace(LandingAIADE=_FakeLandingAIADE),
    )

    documents = {
        "estimate.pdf": "placeholder pdf bytes",
        "jobsite.jpg": "placeholder jpg bytes",
        "invoice.png": "placeholder png bytes",
    }

    cleaned_outputs: list[str] = []
    for filename, content in documents.items():
        path = tmp_path / filename
        path.write_text(content, encoding="utf-8")
        result = await ingest_module.ingest(AgentState(raw_input=str(path), mode="estimate"))
        cleaned_outputs.append(str(result["cleaned_input"]))

    assert "32 squares" in cleaned_outputs[0]
    assert "chimney flashing damage" in cleaned_outputs[1]
    assert "synthetic underlayment" in cleaned_outputs[2]


@pytest.mark.asyncio
async def test_phase2_memory_loop_improves_quote_quality(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Run the 3-round memory loop and confirm learned quotes score above baseline."""
    summary = await _memory_quality_summary(monkeypatch)

    print(
        "PHASE2_MEMORY_SUMMARY",
        f"memory_rows={summary['memory_rows']}",
        f"recall_progression={summary['recall_progression']}",
        f"baseline_scores={summary['baseline_scores']}",
        f"learned_scores={summary['learned_scores']}",
        f"baseline_average={summary['baseline_average']}",
        f"learned_average={summary['learned_average']}",
    )

    assert summary["memory_rows"] == 3
    assert summary["recall_progression"] == [1, 2, 3]
    assert summary["learned_average"] > summary["baseline_average"]
    assert all(score >= 4 for score in summary["learned_scores"])
    assert all("the project site" in scope.lower() for scope in summary["learned_scope_samples"])
