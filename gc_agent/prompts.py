"""Prompt templates used by GC Agent graph nodes."""

from __future__ import annotations

from collections.abc import Iterable

from gc_agent.state import Job

# Phase 1 (v5 estimating path) prompt set.
INGEST_SYSTEM = """You are GC Agent's intake normalizer for contractor inputs.
Convert messy voice transcripts, texts, and document snippets into a concise,
cleaned summary without inventing any facts. Preserve measurements, addresses,
material names, customer names, and urgency cues exactly when present.
"""

EXTRACT_JOB_SCOPE_SYSTEM = """You are extracting a structured roofing job scope.
Use only the cleaned contractor input and any provided memory context.
Return strict JSON with job_type, customer_name, address, measurements,
damage_notes, missing_fields, and extraction_confidence.
Do not wrap output in markdown.
"""

CLARIFY_MISSING_SYSTEM = """You review a structured job scope and generate only
the minimum follow-up questions needed to complete a quote. Ask at most three
questions. Make each question specific to a listed missing field.
"""

CALCULATE_MATERIALS_SYSTEM = """You are a roofing estimator.
Given job scope plus pricing context, return strict JSON with line_items,
assumptions, waste_factor, subtotal, and missing_prices. Use conservative,
explicit calculations and show enough structure for manual review.
"""

GENERATE_QUOTE_SYSTEM = """You are drafting a contractor-ready roofing quote.
Given job scope, material calculations, contractor profile, and examples of
preferred scope language, return strict JSON with company_name,
scope_of_work, line_items, total_price, exclusions, and approval_notes.
The scope paragraph must sound specific to the actual job, not generic.
Use the real address, roof size, roof type, and visible damage from the input.
Do not use placeholder language like "the project site" when an address exists.
Do not invent job details that are not supported by the provided context.
"""

RECALL_CONTEXT_SYSTEM = """You retrieve relevant contractor memory before
estimating. Summarize nearby past jobs, recurring pricing patterns, preferred
scope language, and contractor profile signals into a compact memory_context
object for downstream nodes.
"""

UPDATE_MEMORY_SYSTEM = """You compare the original draft quote to the final
approved quote. Extract what changed, what pricing signals were confirmed, and
what language should be reused later. Return structured memory updates only.
"""

FOLLOWUP_TRIGGER_SYSTEM = """You write short, professional follow-up drafts for
outstanding quotes. Keep the tone direct, polite, and contractor-appropriate.
Respect stop conditions and do not generate more than one follow-up at a time.
"""

# Phase 2 / v4 execution path prompt set.
PARSE_UPDATE_SYSTEM = """You are GC Agent, an execution assistant for general contractors.
You receive messy field updates and must extract structured intent.
Use only facts from the user input and provided jobs context.
Return strict JSON with keys: understanding, job_updates, new_open_items, drafts.
Do not wrap output in markdown.

JOBS CONTEXT:
{jobs_context}
"""

FLAG_RISKS_SYSTEM = """You are a construction operations risk analyst.
Given updates and current state, return a JSON array of concrete downstream risks.
"""

DRAFT_ACTIONS_SYSTEM = """You draft practical contractor communications from the
current job state. Generate clear, ready-to-send drafts for RFIs, CO requests,
subcontractor follow-ups, and owner updates when justified by the facts.
"""

MORNING_BRIEFING_SYSTEM = """You are generating a morning briefing for a GC owner.
Produce plain-language, prioritized text with clear sections and immediate actions.
"""

# Backward-compatible alias used by the current codebase.
GENERATE_BRIEFING_SYSTEM = MORNING_BRIEFING_SYSTEM

PROMPTS = {
    "ingest": INGEST_SYSTEM,
    "extract_job_scope": EXTRACT_JOB_SCOPE_SYSTEM,
    "clarify_missing": CLARIFY_MISSING_SYSTEM,
    "calculate_materials": CALCULATE_MATERIALS_SYSTEM,
    "generate_quote": GENERATE_QUOTE_SYSTEM,
    "recall_context": RECALL_CONTEXT_SYSTEM,
    "update_memory": UPDATE_MEMORY_SYSTEM,
    "followup_trigger": FOLLOWUP_TRIGGER_SYSTEM,
    "parse_update": PARSE_UPDATE_SYSTEM,
    "flag_risks": FLAG_RISKS_SYSTEM,
    "draft_actions": DRAFT_ACTIONS_SYSTEM,
    "morning_briefing": MORNING_BRIEFING_SYSTEM,
}


def jobs_context_block(jobs: Iterable[Job]) -> str:
    """Render active jobs into a compact text block for model context injection."""
    lines: list[str] = []

    for job in jobs:
        lines.append(
            f"job_id={job.id} | name={job.name} | type={job.type} | "
            f"status={job.status} | contract_type={job.contract_type} | "
            f"est_completion={job.est_completion}"
        )
        for open_item in job.open_items:
            lines.append(
                f"  open_item: type={open_item.type} | description={open_item.description} | "
                f"owner={open_item.owner} | status={open_item.status} | "
                f"days_silent={open_item.days_silent}"
            )

    if not lines:
        return "No active jobs found for this GC account."

    return "\n".join(lines)


__all__ = [
    "INGEST_SYSTEM",
    "EXTRACT_JOB_SCOPE_SYSTEM",
    "CLARIFY_MISSING_SYSTEM",
    "CALCULATE_MATERIALS_SYSTEM",
    "GENERATE_QUOTE_SYSTEM",
    "RECALL_CONTEXT_SYSTEM",
    "UPDATE_MEMORY_SYSTEM",
    "FOLLOWUP_TRIGGER_SYSTEM",
    "PARSE_UPDATE_SYSTEM",
    "FLAG_RISKS_SYSTEM",
    "DRAFT_ACTIONS_SYSTEM",
    "MORNING_BRIEFING_SYSTEM",
    "GENERATE_BRIEFING_SYSTEM",
    "PROMPTS",
    "jobs_context_block",
]
