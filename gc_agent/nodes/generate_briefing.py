"""Morning briefing node that synthesizes job status."""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.db import queries
from gc_agent.state import AgentState, Draft, Job

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a module-level AsyncAnthropic singleton instance."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for generate_briefing")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic response blocks into a single text output."""
    parts: list[str] = []
    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    output = "\n".join(parts).strip()
    if not output:
        raise ValueError("Claude returned an empty briefing response")
    return output


def _queue_summary(drafts: list[Draft]) -> str:
    """Render queued drafts as one line per draft."""
    if not drafts:
        return "No queued drafts."

    return "\n".join(
        f"- {draft.job_name} | {draft.type} | {draft.title} | status={draft.status}"
        for draft in drafts
    )


def _fallback_briefing(jobs: list[Job], drafts: list[Draft], errors: list[str]) -> str:
    """Build a deterministic fallback briefing when model generation fails."""
    lines = [
        "Morning Briefing",
        "",
        f"Active jobs: {len(jobs)}",
        f"Queued drafts: {len(drafts)}",
    ]

    if jobs:
        lines.append("")
        lines.append("Job Snapshot:")
        for job in jobs:
            lines.append(f"- {job.status_summary()}")
    else:
        lines.append("")
        lines.append("Job Snapshot:")
        lines.append("- No active jobs loaded.")

    lines.append("")
    lines.append("Draft Queue:")
    lines.extend(_queue_summary(drafts).splitlines())

    if errors:
        lines.append("")
        lines.append("Delivery Note:")
        lines.append("- Briefing generated with partial data due to data/model errors.")

    return "\n".join(lines).strip()


async def _call_claude(system: str, user: str, max_tokens: int = 1000) -> str:
    """Call Claude for briefing synthesis with retry on rate limit."""
    client = _get_anthropic_client()

    for attempt in range(1, 4):
        try:
            response = await client.messages.create(
                model=MODEL_NAME,
                max_tokens=max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            usage = getattr(response, "usage", None)
            LOGGER.debug(
                "generate_briefing token usage model=%s input_tokens=%s output_tokens=%s",
                MODEL_NAME,
                getattr(usage, "input_tokens", None),
                getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("generate_briefing rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


async def generate_briefing(state: AgentState) -> dict[str, Any]:
    """Generate the daily GC briefing output from fresh database reads."""
    errors = list(state.errors)

    fresh_jobs: list[Job] = []
    queued_drafts: list[Draft] = []

    try:
        fresh_jobs = await queries.get_active_jobs(state.gc_id)
    except Exception as exc:
        LOGGER.exception("generate_briefing failed loading jobs gc_id=%s", state.gc_id)
        errors.append(f"generate_briefing jobs load failed: {exc}")

    try:
        queued_drafts = await queries.get_queued_drafts(state.gc_id)
    except Exception as exc:
        LOGGER.exception("generate_briefing failed loading queued drafts gc_id=%s", state.gc_id)
        errors.append(f"generate_briefing queued drafts load failed: {exc}")

    queue_summary = _queue_summary(queued_drafts)
    user_prompt = (
        f"GC_ID: {state.gc_id}\n\n"
        "ACTIVE_JOBS_CONTEXT:\n"
        f"{prompts.jobs_context_block(fresh_jobs)}\n\n"
        "QUEUE_SUMMARY (one line per draft):\n"
        f"{queue_summary}\n\n"
        "Write a concise morning briefing with priorities first, blockers, and immediate actions."
    )

    try:
        briefing_text = await _call_claude(
            system=prompts.GENERATE_BRIEFING_SYSTEM,
            user=user_prompt,
            max_tokens=1000,
        )
    except Exception as exc:
        LOGGER.exception("generate_briefing model call failed gc_id=%s", state.gc_id)
        errors.append(f"generate_briefing model call failed: {exc}")
        briefing_text = _fallback_briefing(fresh_jobs, queued_drafts, errors)

    result: dict[str, Any] = {"briefing_output": briefing_text.strip()}
    if errors != state.errors:
        result["errors"] = errors
    return result


__all__ = ["generate_briefing"]
