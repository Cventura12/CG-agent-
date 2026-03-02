"""Parse-update node that extracts structured intent from input."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv
from pydantic import ValidationError

from gc_agent import prompts
from gc_agent.state import AgentState, ParsedIntent

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"
_JSON_FENCE_PATTERN = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.DOTALL)

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a module-level AsyncAnthropic singleton instance."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for parse_update")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic response content blocks into plain text output."""
    content_blocks = getattr(response, "content", []) or []
    parts: list[str] = []

    for block in content_blocks:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    combined = "\n".join(parts).strip()
    if not combined:
        raise ValueError("Claude returned an empty response body")

    return combined


async def _call_claude(system: str, user: str, max_tokens: int = 2000) -> str:
    """Call Claude with retry on rate limit errors and return raw text content."""
    client = _get_anthropic_client()
    attempts = 3

    for attempt in range(1, attempts + 1):
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
                "Claude token usage model=%s input_tokens=%s output_tokens=%s",
                MODEL_NAME,
                getattr(usage, "input_tokens", None),
                getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning(
                "Claude rate limited on attempt %s/%s for model=%s",
                attempt,
                attempts,
                MODEL_NAME,
            )
            if attempt >= attempts:
                raise
            await asyncio.sleep(2)
        except Exception:
            LOGGER.exception(
                "Claude call failed model=%s max_tokens=%s system=%s user=%s",
                MODEL_NAME,
                max_tokens,
                system,
                user,
            )
            raise

    raise RuntimeError("Claude call failed after retry attempts")


def _strip_markdown_fences(raw: str) -> str:
    """Remove common markdown code-fence wrappers around JSON."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse JSON response text, stripping markdown fences when needed."""
    cleaned = _strip_markdown_fences(raw)

    try:
        loaded = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = cleaned[start : end + 1]
            try:
                loaded = json.loads(candidate)
            except json.JSONDecodeError as exc:
                LOGGER.error("Failed to parse JSON from Claude response: %s", raw)
                raise ValueError("Claude response was not valid JSON") from exc
        else:
            LOGGER.error("Failed to parse JSON from Claude response: %s", raw)
            raise ValueError("Claude response was not valid JSON")

    if not isinstance(loaded, dict):
        raise ValueError("Claude JSON payload must be an object")

    return loaded


def _safe_dict_list(value: Any) -> list[dict[str, object]]:
    """Filter a candidate sequence down to dictionaries for partial intent use."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _build_partial_intent(parsed_payload: dict[str, Any]) -> ParsedIntent:
    """Build a safe ParsedIntent fallback from partially valid model output."""
    understanding_value = parsed_payload.get("understanding")
    understanding = (
        understanding_value.strip()
        if isinstance(understanding_value, str) and understanding_value.strip()
        else "Partial parse: unable to fully validate model output."
    )

    return ParsedIntent(
        understanding=understanding,
        job_updates=_safe_dict_list(parsed_payload.get("job_updates")),
        new_open_items=_safe_dict_list(parsed_payload.get("new_open_items")),
        drafts=_safe_dict_list(parsed_payload.get("drafts")),
    )


async def parse_update(state: AgentState) -> dict[str, object]:
    """Parse raw update text into a validated ParsedIntent structure."""
    system_prompt = prompts.PARSE_UPDATE_SYSTEM.replace(
        "{jobs_context}",
        prompts.jobs_context_block(state.jobs),
    )

    try:
        raw_response = await _call_claude(
            system=system_prompt,
            user=state.raw_input,
            max_tokens=2000,
        )
        parsed_payload = _parse_json_response(raw_response)
    except Exception as exc:
        errors = list(state.errors)
        errors.append(f"parse_update failed: {exc}")
        return {"errors": errors}

    try:
        intent = ParsedIntent.model_validate(parsed_payload)
        return {"parsed_intent": intent}
    except ValidationError as exc:
        LOGGER.warning("ParsedIntent validation failed: %s", exc)
        errors = list(state.errors)
        errors.append(f"parsed_intent validation failed: {exc}")
        partial_intent = _build_partial_intent(parsed_payload)
        return {
            "parsed_intent": partial_intent,
            "errors": errors,
        }


__all__ = ["parse_update", "_call_claude", "_parse_json_response"]
