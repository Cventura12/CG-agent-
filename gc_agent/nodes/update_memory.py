"""Persist approved quote learnings into job memory and contractor profile."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Any, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState
from gc_agent.telemetry import record_model_usage

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"
_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None
_PRICE_SIGNAL_KEYS = (
    "tear_off_per_square",
    "laminated_shingles_per_square",
    "synthetic_underlayment_per_square",
    "ice_water_per_square",
    "ridge_cap_per_square",
    "starter_strip_per_square",
)


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for memory summarization."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for update_memory")
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
        raise ValueError("Claude returned empty update_memory output")

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
            LOGGER.warning("update_memory rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip optional markdown fences from JSON responses."""
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
            raise ValueError("update_memory response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("update_memory payload must be a JSON object")

    return payload


def _to_float(value: Any) -> float:
    """Normalize numeric-like values into floats."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _extract_roof_squares(job_scope: dict[str, object]) -> int:
    """Read roof square count from the normalized job scope."""
    measurements = job_scope.get("measurements")
    if not isinstance(measurements, dict):
        return 0

    for key in ("roof_squares", "square_count", "squares"):
        value = _to_float(measurements.get(key))
        if value > 0:
            return max(1, int(round(value)))
    return 0


def _normalize_scope_examples(existing: Any, new_example: str) -> list[str]:
    """Prepend the newest approved scope language and dedupe."""
    candidates: list[str] = []
    if new_example.strip():
        candidates.append(new_example.strip())
    if isinstance(existing, list):
        candidates.extend(str(item).strip() for item in existing if str(item).strip())

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


def _sanitize_scope_language(
    scope_text: str,
    final_quote: dict[str, object],
    job_scope: dict[str, object],
) -> str:
    """Strip job-specific identifiers so learned scope language is reusable."""
    sanitized = str(scope_text or "").strip()
    if not sanitized:
        return ""

    replacements = {
        str(final_quote.get("project_address") or "").strip(): "the project site",
        str(job_scope.get("address") or "").strip(): "the project site",
        str(final_quote.get("customer_name") or "").strip(): "the customer",
        str(job_scope.get("customer_name") or "").strip(): "the customer",
    }

    for target, replacement in replacements.items():
        if not target:
            continue
        sanitized = re.sub(
            re.escape(target),
            replacement,
            sanitized,
            flags=re.IGNORECASE,
        )

    sanitized = re.sub(r"\s+", " ", sanitized).strip()
    return sanitized


def _build_change_summary(
    original_quote: dict[str, object],
    final_quote: dict[str, object],
) -> str:
    """Build a deterministic explanation of what changed."""
    original_total = _to_float(original_quote.get("total_price"))
    final_total = _to_float(final_quote.get("total_price"))
    original_scope = str(original_quote.get("scope_of_work") or "").strip()
    final_scope = str(final_quote.get("scope_of_work") or "").strip()

    parts: list[str] = []
    if original_scope and final_scope and original_scope != final_scope:
        parts.append("Scope language was edited before approval.")
    if original_total > 0 and final_total > 0:
        delta = round(final_total - original_total, 2)
        if abs(delta) >= 0.01:
            direction = "increased" if delta > 0 else "decreased"
            parts.append(f"Final price {direction} by ${abs(delta):,.2f}.")

    if not parts:
        parts.append("Quote approved without material edits.")
    return " ".join(parts)


def build_prompt_tuning_signals(
    original_quote: dict[str, object],
    final_quote: dict[str, object],
) -> dict[str, object]:
    """Extract deterministic tuning signals from an approved-with-edit quote."""
    original_scope = str(original_quote.get("scope_of_work") or "").strip()
    final_scope = str(final_quote.get("scope_of_work") or "").strip()
    original_total = _to_float(original_quote.get("total_price"))
    final_total = _to_float(final_quote.get("total_price"))

    original_line_items = original_quote.get("line_items")
    final_line_items = final_quote.get("line_items")
    original_labels = []
    if isinstance(original_line_items, list):
        original_labels = [
            str(item.get("item") or item.get("name") or "").strip().lower()
            for item in original_line_items
            if isinstance(item, dict)
        ]
    final_labels = []
    if isinstance(final_line_items, list):
        final_labels = [
            str(item.get("item") or item.get("name") or "").strip().lower()
            for item in final_line_items
            if isinstance(item, dict)
        ]

    scope_language_changed = bool(original_scope and final_scope and original_scope != final_scope)
    price_changed = original_total > 0 and final_total > 0 and abs(final_total - original_total) >= 0.01
    line_items_changed = bool(original_labels or final_labels) and original_labels != final_labels

    patterns: list[str] = []
    prompt_targets: list[str] = []

    if scope_language_changed:
        patterns.append("scope_language_rewrite")
        prompt_targets.append("generate_quote")
    if price_changed:
        patterns.append("price_adjustment")
        prompt_targets.append("calculate_materials")
    if line_items_changed:
        patterns.append("line_item_rewrite")
        if "calculate_materials" not in prompt_targets:
            prompt_targets.append("calculate_materials")
    if not patterns:
        patterns.append("minor_non_structural_edit")

    return {
        "scope_language_changed": scope_language_changed,
        "price_changed": price_changed,
        "line_items_changed": line_items_changed,
        "change_patterns": patterns,
        "likely_prompt_targets": prompt_targets,
    }


def _merge_pricing_signals(
    existing_signals: Any,
    pricing_context: dict[str, object],
    original_quote: dict[str, object],
    final_quote: dict[str, object],
    materials: dict[str, object],
    roof_squares: int,
) -> dict[str, object]:
    """Update pricing signals so future recalls influence estimating math."""
    merged = dict(existing_signals) if isinstance(existing_signals, dict) else {}
    original_total = _to_float(original_quote.get("total_price"))
    final_total = _to_float(final_quote.get("total_price"))
    subtotal = _to_float(materials.get("subtotal"))

    scale = 1.0
    if original_total > 0 and final_total > 0:
        scale = final_total / original_total

    if final_total > 0:
        merged["last_approved_total_price"] = round(final_total, 2)
    if roof_squares > 0 and final_total > 0:
        merged["approved_total_per_square"] = round(final_total / roof_squares, 2)
    if subtotal > 0 and final_total > 0:
        merged["approved_markup_multiplier"] = round(final_total / subtotal, 4)

    for key in _PRICE_SIGNAL_KEYS:
        value = _to_float(pricing_context.get(key))
        if value <= 0:
            continue
        merged[key] = round(value * scale, 2)

    return merged


def _merge_material_preferences(
    existing_preferences: Any,
    final_quote: dict[str, object],
    job_scope: dict[str, object],
) -> dict[str, object]:
    """Track the most recent approved materials and job-type signal."""
    merged = dict(existing_preferences) if isinstance(existing_preferences, dict) else {}
    line_items = final_quote.get("line_items")
    if isinstance(line_items, list):
        recent_items = [
            str(item.get("item") or item.get("name") or "").strip()
            for item in line_items
            if isinstance(item, dict) and str(item.get("item") or item.get("name") or "").strip()
        ]
        if recent_items:
            merged["recent_line_items"] = recent_items[:5]

    job_type = str(job_scope.get("job_type") or "").strip()
    if job_type:
        merged["last_job_type"] = job_type
    return merged


def _infer_trade_type(state: AgentState) -> str:
    """Infer the trade_type rollup key for estimating_memory."""
    trade = str(state.job_scope.get("trade_type") or "").strip().lower()
    if trade:
        return trade
    return "roofing"


def _infer_material_type(state: AgentState) -> str:
    """Infer a coarse material_type from current job scope for rollup grouping."""
    combined = " ".join(
        [
            str(state.job_scope.get("job_type") or "").lower(),
            str(state.job_scope.get("damage_notes") or "").lower(),
        ]
    )
    if "tpo" in combined:
        return "tpo"
    if "metal" in combined or "standing seam" in combined:
        return "metal"
    if "tile" in combined:
        return "tile"
    if "modified bitumen" in combined or "low slope" in combined:
        return "low_slope"
    if "repair" in combined or "patch" in combined:
        return "repair"
    return "shingle"


def _estimate_labor_hours_per_unit(state: AgentState) -> float:
    """Provide a deterministic labor-hours-per-unit fallback for rollup memory."""
    job_type = str(state.job_scope.get("job_type") or "").lower()
    if "repair" in job_type:
        return 0.75
    if "metal" in job_type or "tile" in job_type:
        return 1.75
    return 1.25


def _build_profile_payload(
    state: AgentState,
    existing_profile: dict[str, Any] | None,
    original_quote: dict[str, object],
    final_quote: dict[str, object],
    change_summary: str,
) -> dict[str, object]:
    """Build the contractor_profile upsert payload."""
    profile = dict(existing_profile or {})
    job_scope = dict(state.job_scope)
    pricing_context = dict(state.memory_context.get("pricing_context", {}))
    final_scope = str(final_quote.get("scope_of_work") or "").strip()
    reusable_scope_language = _sanitize_scope_language(final_scope, final_quote, job_scope)
    roof_squares = _extract_roof_squares(job_scope)

    company_name = (
        str(final_quote.get("company_name") or profile.get("company_name") or "").strip()
        or "Arbor Estimating"
    )
    preferred_scope_language = _normalize_scope_examples(
        profile.get("preferred_scope_language"),
        reusable_scope_language,
    )
    pricing_signals = _merge_pricing_signals(
        profile.get("pricing_signals"),
        pricing_context,
        original_quote,
        final_quote,
        dict(state.materials),
        roof_squares,
    )
    material_preferences = _merge_material_preferences(
        profile.get("material_preferences"),
        final_quote,
        job_scope,
    )
    existing_notes = str(profile.get("notes", "")).strip()
    notes = existing_notes or change_summary

    return {
        "contractor_id": state.gc_id,
        "company_name": company_name,
        "preferred_scope_language": preferred_scope_language,
        "pricing_signals": pricing_signals,
        "material_preferences": material_preferences,
        "notes": notes,
    }


def _build_memory_row(
    state: AgentState,
    original_quote: dict[str, object],
    final_quote: dict[str, object],
    embedding: list[float],
    change_summary: str,
) -> dict[str, object]:
    """Build the job_memory insert payload."""
    scope_text = str(final_quote.get("scope_of_work") or "").strip()
    if not scope_text:
        scope_text = str(state.job_scope.get("damage_notes") or state.cleaned_input or state.raw_input).strip()
    reusable_scope_language = _sanitize_scope_language(scope_text, final_quote, dict(state.job_scope))

    summary = str(state.job_scope.get("job_type") or "approved estimate").strip()
    final_total = _to_float(final_quote.get("total_price"))
    original_total = _to_float(original_quote.get("total_price"))
    prompt_tuning_signals = build_prompt_tuning_signals(original_quote, final_quote)

    return {
        "id": f"memory-{uuid4().hex[:12]}",
        "contractor_id": state.gc_id,
        "job_id": state.active_job_id or None,
        "scope_text": scope_text,
        "summary": f"{summary}: {change_summary}",
        "embedding": embedding,
        "metadata": {
            "approval_status": state.approval_status,
            "job_type": str(state.job_scope.get("job_type") or "").strip(),
            "original_total_price": round(original_total, 2),
            "final_total_price": round(final_total, 2),
            "pricing_context": dict(state.memory_context.get("pricing_context", {})),
            "scope_language": reusable_scope_language or scope_text,
            "change_summary": change_summary,
            "prompt_tuning_signals": prompt_tuning_signals,
        },
    }


def _build_estimating_memory_row(
    state: AgentState,
    memory_row: dict[str, object],
    profile_payload: dict[str, object],
) -> dict[str, object]:
    """Build the additive estimating_memory rollup row required by the v5.2 data model."""
    pricing_signals = dict(profile_payload.get("pricing_signals", {}))
    return {
        "id": f"estimating-memory-{uuid4().hex[:12]}",
        "contractor_id": state.gc_id,
        "job_id": state.active_job_id or None,
        "trade_type": _infer_trade_type(state),
        "job_type": str(state.job_scope.get("job_type") or "estimate").strip() or "estimate",
        "material_type": _infer_material_type(state),
        "avg_waste_factor": round(_to_float(dict(state.materials).get("waste_factor")) or 0.1, 4),
        "labor_hours_per_unit": round(_estimate_labor_hours_per_unit(state), 4),
        "avg_markup": round(_to_float(pricing_signals.get("approved_markup_multiplier")) or 0.0, 4),
        "scope_language_examples": list(profile_payload.get("preferred_scope_language", [])),
        "confidence_score": 0.1,
        "sample_count": 1,
        "source_memory_id": str(memory_row.get("id") or "").strip() or None,
    }


def _build_user_prompt(
    original_quote: dict[str, object],
    final_quote: dict[str, object],
    current_profile: dict[str, object],
) -> str:
    """Assemble the user prompt body for update_memory."""
    return (
        "ORIGINAL_QUOTE:\n"
        f"{json.dumps(original_quote, indent=2, ensure_ascii=True)}\n\n"
        "FINAL_QUOTE:\n"
        f"{json.dumps(final_quote, indent=2, ensure_ascii=True)}\n\n"
        "CURRENT_PROFILE:\n"
        f"{json.dumps(current_profile, indent=2, ensure_ascii=True)}\n\n"
        "Return strict JSON with keys: change_summary, profile_updates."
    )


def _apply_model_updates(
    change_summary: str,
    profile_payload: dict[str, object],
    payload: dict[str, Any],
) -> tuple[str, dict[str, object]]:
    """Overlay model-provided structured updates onto deterministic defaults."""
    updated_summary = str(payload.get("change_summary", "")).strip() or change_summary
    updated_profile = dict(profile_payload)

    profile_updates = payload.get("profile_updates")
    if isinstance(profile_updates, dict):
        scope_examples = profile_updates.get("preferred_scope_language")
        if isinstance(scope_examples, list):
            updated_profile["preferred_scope_language"] = _normalize_scope_examples(
                scope_examples,
                "",
            )

        pricing_signals = profile_updates.get("pricing_signals")
        if isinstance(pricing_signals, dict):
            merged_pricing = dict(updated_profile.get("pricing_signals", {}))
            merged_pricing.update(pricing_signals)
            updated_profile["pricing_signals"] = merged_pricing

        material_preferences = profile_updates.get("material_preferences")
        if isinstance(material_preferences, dict):
            merged_preferences = dict(updated_profile.get("material_preferences", {}))
            merged_preferences.update(material_preferences)
            updated_profile["material_preferences"] = merged_preferences

        notes = str(profile_updates.get("notes", "")).strip()
        if notes:
            updated_profile["notes"] = notes

    return updated_summary, updated_profile


async def update_memory(state: AgentState) -> dict[str, object]:
    """Persist an approved or edited quote as future estimating memory."""
    from gc_agent.nodes.recall_context import _embed_text
    from gc_agent.tools import supabase

    approval_status = state.approval_status.strip().lower()
    if approval_status not in {"approved", "edited"}:
        return {
            "memory_context": dict(state.memory_context),
        }

    if not state.gc_id.strip():
        errors = list(state.errors)
        errors.append("update_memory skipped: gc_id is required")
        return {"errors": errors}

    original_quote = dict(state.quote_draft)
    final_quote = dict(state.final_quote_draft) or dict(state.quote_draft)
    if not final_quote:
        errors = list(state.errors)
        errors.append("update_memory skipped: final quote is required")
        return {"errors": errors}

    errors = list(state.errors)
    existing_profile: dict[str, Any] | None = None
    try:
        existing_profile = await asyncio.to_thread(supabase.get_contractor_profile, state.gc_id)
    except Exception as exc:
        LOGGER.warning("update_memory profile lookup failed: %s", exc)
        errors.append(f"update_memory profile lookup failed: {exc}")

    change_summary = _build_change_summary(original_quote, final_quote)
    profile_payload = _build_profile_payload(
        state,
        existing_profile,
        original_quote,
        final_quote,
        change_summary,
    )

    if os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip():
        try:
            raw_response = await _call_claude(
                system=prompts.UPDATE_MEMORY_SYSTEM,
                user=_build_user_prompt(original_quote, final_quote, profile_payload),
                max_tokens=1200,
            )
            change_summary, profile_payload = _apply_model_updates(
                change_summary,
                profile_payload,
                _parse_json_response(raw_response),
            )
        except Exception as exc:
            LOGGER.warning("update_memory model summary fallback used: %s", exc)
            errors.append(f"update_memory summary failed: {exc}")

    embedding = await _embed_text(str(final_quote.get("scope_of_work") or ""))
    memory_row = _build_memory_row(
        state,
        original_quote,
        final_quote,
        embedding,
        change_summary,
    )

    try:
        await asyncio.to_thread(supabase.insert_job_memory, memory_row)
    except Exception as exc:
        LOGGER.warning("update_memory job_memory write failed: %s", exc)
        errors.append(f"update_memory job_memory write failed: {exc}")

    try:
        await asyncio.to_thread(supabase.upsert_contractor_profile, profile_payload)
    except Exception as exc:
        LOGGER.warning("update_memory contractor_profile write failed: %s", exc)
        errors.append(f"update_memory contractor_profile write failed: {exc}")

    explicit_price_list: dict[str, float] = {}
    try:
        explicit_price_list = await asyncio.to_thread(
            supabase.upsert_price_list_entries,
            state.gc_id,
            dict(profile_payload.get("pricing_signals", {})),
        )
    except Exception as exc:
        LOGGER.warning("update_memory price_list write failed: %s", exc)
        errors.append(f"update_memory price_list write failed: {exc}")

    estimating_memory_row = _build_estimating_memory_row(state, memory_row, profile_payload)
    try:
        stored_estimating_memory = await asyncio.to_thread(
            supabase.upsert_estimating_memory,
            estimating_memory_row,
        )
        if isinstance(stored_estimating_memory, dict):
            estimating_memory_row = stored_estimating_memory
    except Exception as exc:
        LOGGER.warning("update_memory estimating_memory write failed: %s", exc)
        errors.append(f"update_memory estimating_memory write failed: {exc}")

    updated_memory_context = dict(state.memory_context)
    updated_memory_context.update(
        {
            "memory_updated": True,
            "last_memory_entry_id": memory_row["id"],
            "last_change_summary": change_summary,
            "prompt_tuning_signals": dict(memory_row["metadata"].get("prompt_tuning_signals", {})),
            "price_list": explicit_price_list,
            "estimating_memory": estimating_memory_row,
            "contractor_profile": profile_payload,
            "pricing_context": explicit_price_list or dict(profile_payload.get("pricing_signals", {})),
            "scope_language_examples": list(profile_payload.get("preferred_scope_language", [])),
        }
    )

    result: dict[str, object] = {
        "final_quote_draft": final_quote,
        "memory_context": updated_memory_context,
    }
    if errors:
        result["errors"] = errors
    return result


__all__ = ["update_memory", "_call_claude", "build_prompt_tuning_signals"]
