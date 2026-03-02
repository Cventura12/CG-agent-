"""Retrieve contractor memory context before extracting a new estimate scope."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import math
import os
import re
from typing import Any, Optional

import httpx
from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

load_dotenv()

LOGGER = logging.getLogger(__name__)
SUMMARY_MODEL = "claude-sonnet-4-20250514"
EMBEDDING_MODEL = (
    os.getenv("OPENAI_EMBEDDING_MODEL", "").strip()
    or os.getenv("ANTHROPIC_EMBEDDING_MODEL", "").strip()
    or "text-embedding-3-small"
)
EMBEDDING_DIMENSIONS = 24

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for memory summarization."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for recall_context")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into plain text."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty recall_context output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 900) -> str:
    """Call Claude with retry support and return raw text."""
    client = _get_anthropic_client()

    for attempt in range(1, 4):
        try:
            response = await client.messages.create(
                model=SUMMARY_MODEL,
                max_tokens=max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("recall_context rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip optional markdown fences from model JSON."""
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse_json_response(raw: str) -> dict[str, Any]:
    """Parse a JSON object from model output."""
    cleaned = _strip_markdown_fences(raw)

    try:
        payload = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("recall_context response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("recall_context payload must be a JSON object")

    return payload


def _hash_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> list[float]:
    """Build a deterministic fallback embedding vector."""
    source = text.strip() or "empty"
    values: list[float] = []
    seed = source.encode("utf-8")
    counter = 0

    while len(values) < dimensions:
        digest = hashlib.sha256(seed + counter.to_bytes(2, "big", signed=False)).digest()
        for index in range(0, len(digest), 2):
            if len(values) >= dimensions:
                break
            chunk = int.from_bytes(digest[index : index + 2], "big", signed=False)
            values.append((chunk / 32767.5) - 1.0)
        counter += 1

    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0:
        return values
    return [value / norm for value in values]


def _coerce_embedding(payload: Any) -> list[float]:
    """Normalize an embedding payload into a list of floats."""
    if not isinstance(payload, list):
        return []

    result: list[float] = []
    for item in payload:
        try:
            result.append(float(item))
        except Exception:
            continue
    return result


def _extract_embedding_payload(payload: Any) -> list[float]:
    """Extract an embedding from flexible API response shapes."""
    if isinstance(payload, dict):
        direct = _coerce_embedding(payload.get("embedding"))
        if direct:
            return direct

        data = payload.get("data")
        if isinstance(data, list) and data:
            for item in data:
                if not isinstance(item, dict):
                    continue
                candidate = _coerce_embedding(item.get("embedding"))
                if candidate:
                    return candidate

        embeddings = payload.get("embeddings")
        if isinstance(embeddings, list) and embeddings:
            first = embeddings[0]
            if isinstance(first, dict):
                candidate = _coerce_embedding(first.get("embedding"))
                if candidate:
                    return candidate
            return _coerce_embedding(first)

    return []


async def _embed_text(text: str) -> list[float]:
    """Generate an embedding for memory lookup, falling back deterministically."""
    source = text.strip()
    if not source:
        return _hash_embedding("")

    api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        return _hash_embedding(source)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "content-type": "application/json",
    }
    payload = {
        "model": EMBEDDING_MODEL,
        "input": source,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            candidate = _extract_embedding_payload(response.json())
            if candidate:
                return candidate
            raise ValueError("OpenAI embeddings response missing embedding")
    except Exception as exc:
        LOGGER.warning("recall_context embedding fallback used: %s", exc)
        return _hash_embedding(source)


def _format_memory_row(row: dict[str, Any]) -> dict[str, object]:
    """Normalize a job_memory row into a compact downstream shape."""
    metadata = row.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}

    distance_value = row.get("distance", 1.0)
    try:
        distance = round(float(distance_value), 4)
    except Exception:
        distance = 1.0

    return {
        "id": str(row.get("id", "")).strip(),
        "job_id": str(row.get("job_id", "")).strip(),
        "summary": str(row.get("summary", "")).strip(),
        "scope_text": str(row.get("scope_text", "")).strip(),
        "distance": distance,
        "metadata": metadata,
    }


def _merge_pricing_context(
    existing_context: dict[str, object],
    explicit_price_list: dict[str, float],
    contractor_profile: dict[str, Any] | None,
    similar_jobs: list[dict[str, object]],
) -> dict[str, object]:
    """Merge pricing defaults with contractor and memory-derived signals."""
    pricing_context = existing_context.get("pricing_context")
    merged: dict[str, object] = dict(pricing_context) if isinstance(pricing_context, dict) else {}

    protected_keys: set[str] = set()
    for key, value in explicit_price_list.items():
        normalized_key = str(key)
        merged[normalized_key] = value
        protected_keys.add(normalized_key)

    if contractor_profile:
        pricing_signals = contractor_profile.get("pricing_signals")
        if isinstance(pricing_signals, dict):
            for key, value in pricing_signals.items():
                normalized_key = str(key)
                if normalized_key in protected_keys:
                    continue
                merged[normalized_key] = value
                protected_keys.add(normalized_key)

    memory_applied: set[str] = set()
    for job in similar_jobs:
        metadata = job.get("metadata")
        if not isinstance(metadata, dict):
            continue
        memory_pricing = metadata.get("pricing_context")
        if isinstance(memory_pricing, dict):
            for key, value in memory_pricing.items():
                normalized_key = str(key)
                if normalized_key in protected_keys or normalized_key in memory_applied:
                    continue
                merged[normalized_key] = value
                memory_applied.add(normalized_key)

    return merged


def _merge_scope_examples(
    existing_context: dict[str, object],
    estimating_memory: dict[str, Any] | None,
    contractor_profile: dict[str, Any] | None,
    similar_jobs: list[dict[str, object]],
) -> list[str]:
    """Merge approved scope language examples from all available sources."""
    candidates: list[str] = []

    if estimating_memory:
        examples = estimating_memory.get("scope_language_examples")
        if isinstance(examples, list):
            candidates.extend(str(item).strip() for item in examples if str(item).strip())

    if contractor_profile:
        preferred = contractor_profile.get("preferred_scope_language")
        if isinstance(preferred, list):
            candidates.extend(str(item).strip() for item in preferred if str(item).strip())

    for job in similar_jobs:
        metadata = job.get("metadata")
        if not isinstance(metadata, dict):
            continue
        scoped = metadata.get("scope_language")
        if isinstance(scoped, str) and scoped.strip():
            candidates.append(scoped.strip())

    raw_existing = existing_context.get("scope_language_examples")
    if isinstance(raw_existing, list):
        candidates.extend(str(item).strip() for item in raw_existing if str(item).strip())

    deduped: list[str] = []
    seen: set[str] = set()
    for item in candidates:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= 6:
            break
    return deduped


def _build_formatted_context(
    explicit_price_list: dict[str, float],
    estimating_memory: dict[str, Any] | None,
    contractor_profile: dict[str, Any] | None,
    similar_jobs: list[dict[str, object]],
    pricing_context: dict[str, object],
    scope_language_examples: list[str],
) -> str:
    """Build a compact deterministic formatted memory block."""
    lines: list[str] = []

    if contractor_profile:
        company_name = str(contractor_profile.get("company_name", "")).strip()
        notes = str(contractor_profile.get("notes", "")).strip()
        if company_name:
            lines.append(f"Contractor profile: {company_name}")
        if notes:
            lines.append(f"Profile notes: {notes}")

    if explicit_price_list:
        sample_keys = sorted(explicit_price_list)[:4]
        lines.append(
            "Price list: "
            + ", ".join(f"{key}={explicit_price_list[key]}" for key in sample_keys)
        )

    if estimating_memory:
        lines.append(
            "Estimating memory: "
            f"{estimating_memory.get('trade_type', '')} / "
            f"{estimating_memory.get('job_type', '')} "
            f"(confidence={estimating_memory.get('confidence_score', 0)})"
        )

    if pricing_context:
        sample_keys = sorted(pricing_context)[:4]
        lines.append(
            "Pricing signals: "
            + ", ".join(f"{key}={pricing_context[key]}" for key in sample_keys)
        )

    if similar_jobs:
        lines.append("Relevant past jobs:")
        for job in similar_jobs[:3]:
            summary = str(job.get("summary", "")).strip() or str(job.get("scope_text", "")).strip()
            distance = job.get("distance", 1.0)
            lines.append(f"- {summary} (distance={distance})")

    if scope_language_examples:
        lines.append("Preferred scope language:")
        for example in scope_language_examples[:2]:
            lines.append(f"- {example}")

    return "\n".join(lines).strip()


def _build_user_prompt(
    cleaned_input: str,
    contractor_profile: dict[str, Any] | None,
    similar_jobs: list[dict[str, object]],
    pricing_context: dict[str, object],
    scope_language_examples: list[str],
) -> str:
    """Assemble the user prompt body for recall summarization."""
    return (
        "CURRENT_INPUT:\n"
        f"{cleaned_input}\n\n"
        "CONTRACTOR_PROFILE:\n"
        f"{json.dumps(contractor_profile or {}, indent=2, ensure_ascii=True)}\n\n"
        "SIMILAR_JOBS:\n"
        f"{json.dumps(similar_jobs, indent=2, ensure_ascii=True)}\n\n"
        "PRICING_CONTEXT:\n"
        f"{json.dumps(pricing_context, indent=2, ensure_ascii=True)}\n\n"
        "SCOPE_LANGUAGE_EXAMPLES:\n"
        f"{json.dumps(scope_language_examples, indent=2, ensure_ascii=True)}\n\n"
        "Return strict JSON with keys: formatted_context, pricing_context, scope_language_examples."
    )


def _apply_model_summary(
    fallback_memory: dict[str, object],
    model_payload: dict[str, Any],
) -> dict[str, object]:
    """Overlay model-provided summary fields onto the deterministic fallback."""
    merged = dict(fallback_memory)

    formatted_context = str(model_payload.get("formatted_context", "")).strip()
    if formatted_context:
        merged["formatted_context"] = formatted_context

    pricing_context = model_payload.get("pricing_context")
    if isinstance(pricing_context, dict):
        merged["pricing_context"] = pricing_context

    scope_language_examples = model_payload.get("scope_language_examples")
    if isinstance(scope_language_examples, list):
        normalized = [str(item).strip() for item in scope_language_examples if str(item).strip()]
        if normalized:
            merged["scope_language_examples"] = normalized[:6]

    return merged


async def recall_context(state: AgentState) -> dict[str, object]:
    """Retrieve relevant contractor memory and format memory_context."""
    from gc_agent.tools import supabase

    cleaned_input = state.cleaned_input.strip() or state.raw_input.strip()
    base_memory_context = build_phase1_memory_context()
    existing_memory = dict(state.memory_context)
    base_memory_context.update(existing_memory)

    if not cleaned_input:
        base_memory_context["has_relevant_memory"] = False
        base_memory_context["similar_jobs"] = []
        base_memory_context["formatted_context"] = ""
        base_memory_context["recall_context_ready"] = True
        return {"memory_context": base_memory_context}

    contractor_profile = None
    explicit_price_list: dict[str, float] = {}
    estimating_memory: dict[str, Any] | None = None
    similar_jobs: list[dict[str, object]] = []
    errors = list(state.errors)

    if state.gc_id.strip():
        try:
            explicit_price_list = await asyncio.to_thread(
                supabase.get_price_list_map,
                state.gc_id,
            )
        except Exception as exc:
            LOGGER.warning("recall_context price list lookup failed: %s", exc)
            errors.append(f"recall_context price list lookup failed: {exc}")

        try:
            contractor_profile = await asyncio.to_thread(
                supabase.get_contractor_profile,
                state.gc_id,
            )
        except Exception as exc:
            LOGGER.warning("recall_context contractor profile lookup failed: %s", exc)
            errors.append(f"recall_context profile lookup failed: {exc}")

        try:
            embedding = await _embed_text(cleaned_input)
            raw_matches = await asyncio.to_thread(
                supabase.search_job_memory_by_embedding,
                state.gc_id,
                embedding,
                3,
            )
            similar_jobs = [_format_memory_row(dict(row)) for row in raw_matches]
        except Exception as exc:
            LOGGER.warning("recall_context memory lookup failed: %s", exc)
            errors.append(f"recall_context memory lookup failed: {exc}")

        try:
            estimating_memory = await asyncio.to_thread(
                supabase.get_best_estimating_memory,
                state.gc_id,
                "roofing",
            )
        except Exception as exc:
            LOGGER.warning("recall_context estimating memory lookup failed: %s", exc)
            errors.append(f"recall_context estimating memory lookup failed: {exc}")

    pricing_context = _merge_pricing_context(
        base_memory_context,
        explicit_price_list,
        contractor_profile,
        similar_jobs,
    )
    scope_language_examples = _merge_scope_examples(
        base_memory_context,
        estimating_memory,
        contractor_profile,
        similar_jobs,
    )
    formatted_context = _build_formatted_context(
        explicit_price_list,
        estimating_memory,
        contractor_profile,
        similar_jobs,
        pricing_context,
        scope_language_examples,
    )

    memory_context: dict[str, object] = dict(base_memory_context)
    memory_context.update(
        {
            "has_relevant_memory": bool(similar_jobs),
            "similar_jobs": similar_jobs,
            "price_list": explicit_price_list,
            "estimating_memory": estimating_memory or {},
            "contractor_profile": contractor_profile or {},
            "pricing_context": pricing_context,
            "scope_language_examples": scope_language_examples,
            "formatted_context": formatted_context,
            "recall_context_ready": True,
        }
    )

    if not (os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()):
        if errors:
            return {"memory_context": memory_context, "errors": errors}
        return {"memory_context": memory_context}

    try:
        raw_summary = await _call_claude(
            system=prompts.RECALL_CONTEXT_SYSTEM,
            user=_build_user_prompt(
                cleaned_input,
                contractor_profile,
                similar_jobs,
                pricing_context,
                scope_language_examples,
            ),
            max_tokens=900,
        )
        memory_context = _apply_model_summary(memory_context, _parse_json_response(raw_summary))
    except Exception as exc:
        LOGGER.warning("recall_context model summary fallback used: %s", exc)
        errors.append(f"recall_context summary failed: {exc}")

    if errors:
        return {"memory_context": memory_context, "errors": errors}
    return {"memory_context": memory_context}


__all__ = ["recall_context", "_call_claude", "_embed_text"]
