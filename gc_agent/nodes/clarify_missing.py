"""Generate targeted clarification questions for incomplete job scope."""

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
    """Return a shared AsyncAnthropic client for clarification prompts."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for clarify_missing")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into a single text value."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty clarification output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 500) -> str:
    """Call Claude with retry support and return raw text."""
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
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("clarify_missing rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip markdown code fences from model output if present."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_questions(raw: str) -> list[str]:
    """Parse a model response into up to three targeted questions."""
    cleaned = _strip_markdown_fences(raw)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        payload = cleaned

    questions: list[str] = []

    if isinstance(payload, dict):
        candidate = payload.get("questions") or payload.get("clarification_questions")
        payload = candidate if isinstance(candidate, list) else []

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, str) and item.strip():
                questions.append(item.strip())
    elif isinstance(payload, str):
        for line in payload.splitlines():
            normalized = line.strip(" -\t")
            if normalized:
                questions.append(normalized)

    deduped: list[str] = []
    seen: set[str] = set()
    for question in questions:
        key = question.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(question.rstrip("?") + "?")
        if len(deduped) >= 3:
            break

    return deduped


def _fallback_questions(missing_fields: list[str]) -> list[str]:
    """Build deterministic fallback questions from missing fields."""
    prompts_by_field = {
        "address": "What is the full job address?",
        "customer_name": "What is the customer's name?",
        "job_type": "What type of roofing job is this?",
        "measurements": "What roof measurements or square count do you have?",
        "pitch": "What roof pitch are you seeing?",
    }

    questions: list[str] = []
    for field in missing_fields:
        questions.append(prompts_by_field.get(field, f"What is the missing value for {field}?"))
        if len(questions) >= 3:
            break
    return questions


async def clarify_missing(state: AgentState) -> dict[str, object]:
    """Generate clarification questions only when job_scope has missing fields."""
    job_scope = dict(state.job_scope)
    missing_fields_value = job_scope.get("missing_fields")
    missing_fields = [
        str(item).strip()
        for item in missing_fields_value
        if isinstance(item, str) and str(item).strip()
    ] if isinstance(missing_fields_value, list) else []

    if not missing_fields:
        return {
            "clarification_questions": [],
            "clarification_needed": False,
        }

    user_prompt = (
        "JOB_SCOPE:\n"
        f"{json.dumps(job_scope, indent=2, ensure_ascii=True)}\n\n"
        "MISSING_FIELDS:\n"
        f"{json.dumps(missing_fields, ensure_ascii=True)}"
    )

    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        return {
            "clarification_questions": _fallback_questions(missing_fields),
            "clarification_needed": True,
        }

    try:
        raw_response = await _call_claude(
            system=prompts.CLARIFY_MISSING_SYSTEM,
            user=user_prompt,
            max_tokens=500,
        )
        questions = _parse_questions(raw_response)
    except Exception as exc:
        LOGGER.warning("clarify_missing fallback used: %s", exc)
        questions = _fallback_questions(missing_fields)
        errors = list(state.errors)
        errors.append(f"clarify_missing failed: {exc}")
        return {
            "clarification_questions": questions,
            "clarification_needed": True,
            "errors": errors,
        }

    if not questions:
        questions = _fallback_questions(missing_fields)

    return {
        "clarification_questions": questions[:3],
        "clarification_needed": True,
    }


__all__ = ["clarify_missing", "_call_claude"]
