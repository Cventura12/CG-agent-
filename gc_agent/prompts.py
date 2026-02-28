"""Prompt templates used by GC Agent graph nodes."""

from __future__ import annotations

from collections.abc import Iterable

from gc_agent.state import Job

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

GENERATE_BRIEFING_SYSTEM = """You are generating a morning briefing for a GC owner.
Produce plain-language, prioritized text with clear sections and immediate actions.
"""


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
    "PARSE_UPDATE_SYSTEM",
    "FLAG_RISKS_SYSTEM",
    "GENERATE_BRIEFING_SYSTEM",
    "jobs_context_block",
]