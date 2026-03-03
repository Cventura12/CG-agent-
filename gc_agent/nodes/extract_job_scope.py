"""Extract structured job scope data for the v5 estimating path."""

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
from gc_agent.telemetry import record_model_usage

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None
_NUMBER_WORDS = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
}


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for job-scope extraction."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for extract_job_scope")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into a single text payload."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty extract_job_scope output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 1200) -> str:
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
            usage = getattr(response, "usage", None)
            record_model_usage(
                model_name=MODEL_NAME,
                input_tokens=getattr(usage, "input_tokens", None),
                output_tokens=getattr(usage, "output_tokens", None),
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("extract_job_scope rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Remove optional fenced-code wrappers from JSON text."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse a JSON object from the model response."""
    cleaned = _strip_markdown_fences(raw)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("extract_job_scope response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("extract_job_scope payload must be a JSON object")

    return payload


def _normalize_string(value: Any) -> str:
    """Normalize a candidate scalar into a stripped string."""
    if isinstance(value, str):
        return value.strip()
    return ""


def _normalize_missing_fields(value: Any) -> list[str]:
    """Normalize missing_fields into a non-empty string list when possible."""
    if not isinstance(value, list):
        return []

    result: list[str] = []
    for item in value:
        normalized = _normalize_string(item)
        if normalized:
            result.append(normalized)
    return result


def _parse_number_phrase(raw: str) -> float:
    """Parse simple digit or number-word phrases used before 'square(s)'."""
    candidate = raw.strip().lower().replace("-", " ")
    if not candidate:
        return 0.0

    try:
        return float(candidate)
    except ValueError:
        pass

    total = 0
    for token in candidate.split():
        if token not in _NUMBER_WORDS:
            continue
        total += _NUMBER_WORDS[token]
    return float(total)


def _extract_square_count(cleaned_input: str) -> Optional[int]:
    """Extract a best-effort square count from free-form text."""
    text = cleaned_input.lower()
    digit_match = re.search(r"\b(\d+(?:\.\d+)?)\s*square", text)
    if digit_match:
        return max(1, int(round(float(digit_match.group(1)))))

    word_match = re.search(
        r"\b((?:zero|one|two|three|four|five|six|seven|eight|nine|ten|"
        r"eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|"
        r"eighteen|nineteen|twenty|thirty|forty|fifty|sixty|and|-|\s)+)\s+square",
        text,
    )
    if not word_match:
        return None

    parsed = _parse_number_phrase(word_match.group(1))
    if parsed <= 0:
        return None
    return max(1, int(round(parsed)))


def _extract_layers(cleaned_input: str) -> Optional[int]:
    """Extract layer count when present."""
    digit_match = re.search(r"\b(\d+)\s+layers?\b", cleaned_input, re.IGNORECASE)
    if digit_match:
        return int(digit_match.group(1))

    word_match = re.search(
        r"\b(one|two|three)\s+(?:old\s+)?layers?\b",
        cleaned_input,
        re.IGNORECASE,
    )
    if not word_match:
        return None
    parsed = _parse_number_phrase(word_match.group(1))
    return int(parsed) if parsed > 0 else None


def _extract_pitch(cleaned_input: str) -> str:
    """Extract roof pitch when present."""
    match = re.search(r"\b(\d{1,2}/\d{1,2})\b", cleaned_input)
    return match.group(1) if match else ""


def _truncate_location(raw: str) -> str:
    """Trim trailing verbs and qualifiers from a captured location string."""
    cleaned = re.split(
        r"\b(?:for|has|have|needs|need|wants|want|is|was|with|and|but|customer|roof)\b",
        raw,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0]
    return cleaned.strip(" ,.")


def _extract_address(cleaned_input: str) -> str:
    """Extract a likely job address or site name from messy text."""
    numbered_match = re.search(
        r"\b(?:at|on|behind)\s+((?:\d{1,5}\s+[^,]+))",
        cleaned_input,
        re.IGNORECASE,
    )
    if numbered_match:
        return _truncate_location(numbered_match.group(1))

    named_match = re.search(
        r"\b(?:on|at)\s+([A-Z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,4})(?:\s+for\b|,|$)",
        cleaned_input,
    )
    if named_match:
        return _truncate_location(named_match.group(1))

    loose_match = re.search(r"\b(?:on|at)\s+([^,]+)", cleaned_input, re.IGNORECASE)
    if loose_match:
        return _truncate_location(loose_match.group(1))

    fallback_match = re.search(
        r"\b(?:duplex on|customer on|roof at|job at|quote for)\s+([^,]+)",
        cleaned_input,
        re.IGNORECASE,
    )
    if fallback_match:
        return _truncate_location(fallback_match.group(1))

    return ""


def _extract_customer_name(cleaned_input: str) -> str:
    """Extract a likely customer name or site owner label."""
    direct_match = re.search(r"\bcustomer is\s+([^,]+)", cleaned_input, re.IGNORECASE)
    if direct_match:
        return direct_match.group(1).strip(" .")

    for_match = re.search(r"\bfor\s+(?:the\s+)?([^,]+)", cleaned_input, re.IGNORECASE)
    if for_match:
        candidate = _truncate_location(for_match.group(1))
        if candidate and len(candidate.split()) <= 5 and not re.match(r"^\d", candidate):
            return candidate

    titled_match = re.search(r"\b(Mr|Mrs|Ms)\.?\s+[A-Z][a-zA-Z'-]+", cleaned_input)
    if titled_match:
        return titled_match.group(0).strip()

    site_match = re.search(
        r"\b(church office|church parsonage|church fellowship hall|warehouse office|commercial storefront)\b",
        cleaned_input,
        re.IGNORECASE,
    )
    if site_match:
        return site_match.group(1).strip().title()

    return ""


def _infer_job_type(cleaned_input: str) -> str:
    """Infer a specific job type label from the raw contractor description."""
    text = cleaned_input.lower()

    if "service call" in text:
        return "service call repair"
    if "tile" in text:
        return "tile roof repair"
    if "standing seam" in text or "exposed fastener metal" in text or "metal roof" in text:
        return "metal roof replacement" if "full" in text or "replacement" in text else "metal roof repair"
    if "tpo" in text:
        return "tpo roof repair" if "repair" in text else "tpo roof replacement"
    if "modified bitumen" in text or "cap sheet" in text:
        return "modified bitumen repair" if "repair" in text else "modified bitumen replacement"
    if "low slope" in text:
        return "low slope roof repair" if "repair" in text else "low slope roof replacement"
    if "repair" in text or "patch" in text:
        return "roof repair"
    if "tear-off" in text or "full replacement" in text or "full tear-off" in text:
        return "full tear-off replacement"
    if "insurance" in text or "hail" in text:
        return "hail damage roof replacement"
    return "roof replacement"


def _heuristic_job_scope_payload(cleaned_input: str) -> dict[str, Any]:
    """Build a deterministic extraction payload from the raw text."""
    roof_squares = _extract_square_count(cleaned_input)
    pitch = _extract_pitch(cleaned_input)
    layers = _extract_layers(cleaned_input)

    measurements: dict[str, object] = {}
    if roof_squares is not None:
        measurements["roof_squares"] = roof_squares
    if pitch:
        measurements["pitch"] = pitch
    if layers is not None:
        measurements["layers"] = layers

    address = _extract_address(cleaned_input)
    job_type = _infer_job_type(cleaned_input)
    customer_name = _extract_customer_name(cleaned_input)

    missing_fields: list[str] = []
    if not address:
        missing_fields.append("address")
    if roof_squares is None and "repair" not in job_type:
        missing_fields.append("measurements")

    confidence = "high"
    if missing_fields:
        confidence = "medium" if len(missing_fields) == 1 else "low"

    return {
        "job_type": job_type,
        "customer_name": customer_name,
        "address": address,
        "measurements": measurements,
        "damage_notes": cleaned_input,
        "missing_fields": missing_fields,
        "extraction_confidence": confidence,
    }


def _normalize_job_scope(payload: dict[str, Any], cleaned_input: str) -> dict[str, object]:
    """Build a predictable job_scope object from partial model output."""
    measurements = payload.get("measurements")
    if not isinstance(measurements, dict):
        measurements = {}

    missing_fields = _normalize_missing_fields(payload.get("missing_fields"))
    job_type = _normalize_string(payload.get("job_type"))
    address = _normalize_string(payload.get("address"))
    customer_name = _normalize_string(payload.get("customer_name"))
    damage_notes = _normalize_string(payload.get("damage_notes")) or cleaned_input
    extraction_confidence = _normalize_string(payload.get("extraction_confidence")).lower()

    if not extraction_confidence:
        extraction_confidence = "low"

    if not job_type and "job_type" not in missing_fields:
        missing_fields.append("job_type")
    if not address and "address" not in missing_fields:
        missing_fields.append("address")

    return {
        "job_type": job_type,
        "customer_name": customer_name,
        "address": address,
        "measurements": measurements,
        "damage_notes": damage_notes,
        "missing_fields": missing_fields,
        "extraction_confidence": extraction_confidence,
    }


def _build_user_prompt(cleaned_input: str, memory_context: dict[str, object]) -> str:
    """Assemble the user prompt body for extraction."""
    memory_payload = memory_context if memory_context else None
    memory_text = json.dumps(memory_payload, indent=2, ensure_ascii=True)
    return (
        "CLEANED_INPUT:\n"
        f"{cleaned_input}\n\n"
        "MEMORY_CONTEXT:\n"
        f"{memory_text}"
    )


async def extract_job_scope(state: AgentState) -> dict[str, object]:
    """Extract a normalized job_scope object from cleaned estimating input."""
    cleaned_input = state.cleaned_input.strip() or state.raw_input.strip()
    memory_context = dict(state.memory_context)
    errors = list(state.errors)

    if not cleaned_input:
        fallback_scope = _normalize_job_scope({}, "")
        return {
            "job_scope": fallback_scope,
            "clarification_needed": bool(fallback_scope["missing_fields"]),
        }

    if not (os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()):
        job_scope = _normalize_job_scope(_heuristic_job_scope_payload(cleaned_input), cleaned_input)
        return {
            "job_scope": job_scope,
            "clarification_needed": bool(job_scope["missing_fields"]),
        }

    try:
        raw_response = await _call_claude(
            system=prompts.EXTRACT_JOB_SCOPE_SYSTEM,
            user=_build_user_prompt(cleaned_input, memory_context),
            max_tokens=1200,
        )
        parsed_payload = _parse_json_response(raw_response)
        job_scope = _normalize_job_scope(parsed_payload, cleaned_input)
    except Exception as exc:
        LOGGER.warning("extract_job_scope fallback used: %s", exc)
        errors.append(f"extract_job_scope failed: {exc}")
        job_scope = _normalize_job_scope(
            {"damage_notes": cleaned_input, "extraction_confidence": "low"},
            cleaned_input,
        )
        return {
            "job_scope": job_scope,
            "clarification_needed": bool(job_scope["missing_fields"]),
            "errors": errors,
        }

    return {
        "job_scope": job_scope,
        "clarification_needed": bool(job_scope["missing_fields"]),
    }


__all__ = ["extract_job_scope", "_call_claude", "_parse_json_response"]
