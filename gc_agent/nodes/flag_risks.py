"""Risk analysis node for identifying downstream issues."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic singleton for node-level model calls."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for flag_risks")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic response blocks into single text payload."""
    parts: list[str] = []
    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty risk payload")
    return result


async def _call_claude(system: str, user: str, max_tokens: int = 600) -> str:
    """Call Claude with retry support for rate limiting."""
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
                "flag_risks token usage model=%s input_tokens=%s output_tokens=%s",
                MODEL_NAME,
                getattr(usage, "input_tokens", None),
                getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("flag_risks rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip optional markdown code fences from model responses."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_risks(raw: str) -> list[str]:
    """Parse model response into a JSON array of non-empty risk strings."""
    cleaned = _strip_markdown_fences(raw)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"flag_risks response was not valid JSON: {raw}") from exc

    if isinstance(payload, dict):
        candidate = payload.get("risks") or payload.get("risk_flags")
        payload = candidate if isinstance(candidate, list) else []

    if not isinstance(payload, list):
        raise ValueError(f"flag_risks response must be a JSON array: {payload!r}")

    result: list[str] = []
    for item in payload:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized:
                result.append(normalized)

    return result


def _changes_summary(job_updates: list[dict[str, object]]) -> str:
    """Render parsed job updates into compact JSON summary text."""
    if not job_updates:
        return "No structured job_updates were provided in parsed_intent."

    return json.dumps(job_updates, indent=2, ensure_ascii=True)


async def flag_risks(state: AgentState) -> dict[str, object]:
    """Generate second-order risk flags and filter already-known items."""
    if state.parsed_intent is None:
        return {"risk_flags": []}

    summary = _changes_summary(state.parsed_intent.job_updates)
    user_prompt = (
        "Analyze these recent GC updates and return only a JSON array of risks.\n\n"
        f"CHANGES_SUMMARY:\n{summary}\n\n"
        "ACTIVE_JOBS_CONTEXT:\n"
        f"{prompts.jobs_context_block(state.jobs)}"
    )

    try:
        raw_response = await _call_claude(
            system=prompts.FLAG_RISKS_SYSTEM,
            user=user_prompt,
            max_tokens=600,
        )
        parsed_risks = _parse_risks(raw_response)
    except Exception as exc:
        errors = list(state.errors)
        errors.append(f"flag_risks failed: {exc}")
        return {"risk_flags": [], "errors": errors}

    prior_risks = {risk.strip().lower() for risk in state.parsed_intent.risks_flagged}
    filtered = [risk for risk in parsed_risks if risk.strip().lower() not in prior_risks]

    return {"risk_flags": filtered}


__all__ = ["flag_risks"]
