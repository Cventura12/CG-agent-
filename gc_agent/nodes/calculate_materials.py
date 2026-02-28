"""Calculate roofing material line items for the v5 estimating path."""

from __future__ import annotations

import asyncio
import json
import logging
import math
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
    """Return a shared AsyncAnthropic client for materials calculation."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for calculate_materials")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into one text payload."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty materials output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 1400) -> str:
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
            LOGGER.warning("calculate_materials rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip optional fenced markdown from model JSON."""
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
            raise ValueError("calculate_materials response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("calculate_materials payload must be a JSON object")

    return payload


def _to_float(value: Any) -> float:
    """Normalize a numeric-like value into a float."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _resolve_square_count(job_scope: dict[str, object]) -> int:
    """Estimate roof squares from job scope measurements."""
    measurements = job_scope.get("measurements")
    if not isinstance(measurements, dict):
        measurements = {}

    direct_keys = ("roof_squares", "square_count", "squares")
    for key in direct_keys:
        numeric = _to_float(measurements.get(key))
        if numeric > 0:
            return max(1, math.ceil(numeric))

    area_sqft = _to_float(measurements.get("roof_area_sqft"))
    if area_sqft > 0:
        return max(1, math.ceil(area_sqft / 100.0))

    damage_notes = str(job_scope.get("damage_notes") or "")
    match = re.search(r"\b(\d+(?:\.\d+)?)\s*square", damage_notes, re.IGNORECASE)
    if match:
        return max(1, math.ceil(float(match.group(1))))

    return 1


def _material_profile(job_scope: dict[str, object]) -> str:
    """Return the dominant roofing material profile for fallback costing."""
    job_type = str(job_scope.get("job_type") or "").lower()
    damage_notes = str(job_scope.get("damage_notes") or "").lower()
    combined = f"{job_type} {damage_notes}"

    if "tpo" in combined:
        return "tpo"
    if "modified bitumen" in combined or "low slope" in combined or "cap sheet" in combined:
        return "low_slope"
    if "metal" in combined or "standing seam" in combined:
        return "metal"
    if "tile" in combined:
        return "tile"
    if "repair" in combined or "patch" in combined or "service call" in combined:
        return "repair"
    return "shingle"


def _build_deterministic_materials(
    job_scope: dict[str, object],
    pricing_context: dict[str, object],
) -> dict[str, object]:
    """Build a deterministic fallback materials package from job scope."""
    roof_squares = _resolve_square_count(job_scope)
    waste_factor = 0.1
    billable_squares = max(1, math.ceil(roof_squares * (1 + waste_factor)))

    price_map = {
        "tear_off_per_square": _to_float(pricing_context.get("tear_off_per_square")),
        "laminated_shingles_per_square": _to_float(
            pricing_context.get("laminated_shingles_per_square")
        ),
        "synthetic_underlayment_per_square": _to_float(
            pricing_context.get("synthetic_underlayment_per_square")
        ),
        "ice_water_per_square": _to_float(pricing_context.get("ice_water_per_square")),
        "ridge_cap_per_square": _to_float(pricing_context.get("ridge_cap_per_square")),
        "starter_strip_per_square": _to_float(pricing_context.get("starter_strip_per_square")),
    }

    missing_prices = [key for key, value in price_map.items() if value <= 0]
    profile = _material_profile(job_scope)

    if profile == "low_slope":
        line_items = [
            {
                "item": "Tear-off and disposal",
                "unit": "square",
                "quantity": roof_squares,
                "unit_cost": price_map["tear_off_per_square"],
                "total_cost": round(roof_squares * price_map["tear_off_per_square"], 2),
            },
            {
                "item": "Modified bitumen membrane",
                "unit": "square",
                "quantity": billable_squares,
                "unit_cost": price_map["laminated_shingles_per_square"],
                "total_cost": round(
                    billable_squares * price_map["laminated_shingles_per_square"], 2
                ),
            },
            {
                "item": "Base sheet / adhesive",
                "unit": "square",
                "quantity": billable_squares,
                "unit_cost": price_map["synthetic_underlayment_per_square"],
                "total_cost": round(
                    billable_squares * price_map["synthetic_underlayment_per_square"], 2
                ),
            },
            {
                "item": "Drain and edge flashing",
                "unit": "allowance",
                "quantity": 1,
                "unit_cost": price_map["ice_water_per_square"],
                "total_cost": round(price_map["ice_water_per_square"], 2),
            },
        ]
    elif profile == "metal":
        line_items = [
            {
                "item": "Tear-off and disposal",
                "unit": "square",
                "quantity": roof_squares,
                "unit_cost": price_map["tear_off_per_square"],
                "total_cost": round(roof_squares * price_map["tear_off_per_square"], 2),
            },
            {
                "item": "Metal roofing panels",
                "unit": "square",
                "quantity": billable_squares,
                "unit_cost": price_map["laminated_shingles_per_square"],
                "total_cost": round(
                    billable_squares * price_map["laminated_shingles_per_square"], 2
                ),
            },
            {
                "item": "Panel trim and closures",
                "unit": "square",
                "quantity": max(1, math.ceil(roof_squares * 0.15)),
                "unit_cost": price_map["ridge_cap_per_square"],
                "total_cost": round(
                    max(1, math.ceil(roof_squares * 0.15)) * price_map["ridge_cap_per_square"],
                    2,
                ),
            },
            {
                "item": "Fasteners and sealant",
                "unit": "allowance",
                "quantity": 1,
                "unit_cost": price_map["starter_strip_per_square"],
                "total_cost": round(price_map["starter_strip_per_square"], 2),
            },
        ]
    elif profile == "tile":
        line_items = [
            {
                "item": "Roof access and safety setup",
                "unit": "allowance",
                "quantity": 1,
                "unit_cost": price_map["tear_off_per_square"],
                "total_cost": round(price_map["tear_off_per_square"], 2),
            },
            {
                "item": "Replacement field tiles",
                "unit": "square",
                "quantity": max(1, roof_squares),
                "unit_cost": price_map["laminated_shingles_per_square"],
                "total_cost": round(max(1, roof_squares) * price_map["laminated_shingles_per_square"], 2),
            },
            {
                "item": "Tile flashing repair",
                "unit": "allowance",
                "quantity": 1,
                "unit_cost": price_map["ice_water_per_square"],
                "total_cost": round(price_map["ice_water_per_square"], 2),
            },
        ]
    elif profile == "repair":
        line_items = [
            {
                "item": "Repair labor and tear-out",
                "unit": "square",
                "quantity": roof_squares,
                "unit_cost": price_map["tear_off_per_square"],
                "total_cost": round(roof_squares * price_map["tear_off_per_square"], 2),
            },
            {
                "item": "Replacement shingle / patch material",
                "unit": "square",
                "quantity": max(1, roof_squares),
                "unit_cost": price_map["laminated_shingles_per_square"],
                "total_cost": round(max(1, roof_squares) * price_map["laminated_shingles_per_square"], 2),
            },
            {
                "item": "Flashing and sealant allowance",
                "unit": "allowance",
                "quantity": 1,
                "unit_cost": price_map["ice_water_per_square"],
                "total_cost": round(price_map["ice_water_per_square"], 2),
            },
        ]
    else:
        line_items = [
            {
                "item": "Tear-off and disposal",
                "unit": "square",
                "quantity": roof_squares,
                "unit_cost": price_map["tear_off_per_square"],
                "total_cost": round(roof_squares * price_map["tear_off_per_square"], 2),
            },
            {
                "item": "Laminated shingles",
                "unit": "square",
                "quantity": billable_squares,
                "unit_cost": price_map["laminated_shingles_per_square"],
                "total_cost": round(
                    billable_squares * price_map["laminated_shingles_per_square"], 2
                ),
            },
            {
                "item": "Synthetic underlayment",
                "unit": "square",
                "quantity": billable_squares,
                "unit_cost": price_map["synthetic_underlayment_per_square"],
                "total_cost": round(
                    billable_squares * price_map["synthetic_underlayment_per_square"], 2
                ),
            },
            {
                "item": "Ice and water shield",
                "unit": "square",
                "quantity": max(1, math.ceil(roof_squares * 0.25)),
                "unit_cost": price_map["ice_water_per_square"],
                "total_cost": round(
                    max(1, math.ceil(roof_squares * 0.25)) * price_map["ice_water_per_square"],
                    2,
                ),
            },
            {
                "item": "Ridge cap",
                "unit": "square",
                "quantity": max(1, math.ceil(roof_squares * 0.1)),
                "unit_cost": price_map["ridge_cap_per_square"],
                "total_cost": round(
                    max(1, math.ceil(roof_squares * 0.1)) * price_map["ridge_cap_per_square"],
                    2,
                ),
            },
            {
                "item": "Starter strip",
                "unit": "square",
                "quantity": max(1, math.ceil(roof_squares * 0.1)),
                "unit_cost": price_map["starter_strip_per_square"],
                "total_cost": round(
                    max(1, math.ceil(roof_squares * 0.1)) * price_map["starter_strip_per_square"],
                    2,
                ),
            },
        ]

    subtotal = round(sum(float(item["total_cost"]) for item in line_items), 2)

    return {
        "line_items": line_items,
        "assumptions": [
            f"Estimated {roof_squares} roof square(s) from provided measurements.",
            "Applied 10% waste factor to field materials.",
        ],
        "waste_factor": waste_factor,
        "subtotal": subtotal,
        "missing_prices": missing_prices,
        "roof_squares": roof_squares,
    }


def _normalize_materials(
    payload: dict[str, Any],
    fallback: dict[str, object],
) -> dict[str, object]:
    """Normalize model output while preserving deterministic fallback guarantees."""
    line_items = payload.get("line_items")
    if not isinstance(line_items, list) or not line_items:
        line_items = fallback["line_items"]

    normalized_items: list[dict[str, object]] = []
    for item in line_items:
        if not isinstance(item, dict):
            continue
        name = str(item.get("item") or item.get("name") or "").strip()
        if not name:
            continue
        quantity = _to_float(item.get("quantity"))
        unit_cost = _to_float(item.get("unit_cost"))
        total_cost = _to_float(item.get("total_cost")) or round(quantity * unit_cost, 2)
        normalized_items.append(
            {
                "item": name,
                "unit": str(item.get("unit") or "unit").strip(),
                "quantity": quantity,
                "unit_cost": unit_cost,
                "total_cost": round(total_cost, 2),
            }
        )

    if not normalized_items:
        normalized_items = list(fallback["line_items"])

    assumptions = payload.get("assumptions")
    if not isinstance(assumptions, list):
        assumptions = fallback["assumptions"]
    else:
        assumptions = [str(item).strip() for item in assumptions if str(item).strip()]
        if not assumptions:
            assumptions = fallback["assumptions"]

    missing_prices = payload.get("missing_prices")
    if not isinstance(missing_prices, list):
        missing_prices = fallback["missing_prices"]
    else:
        missing_prices = [str(item).strip() for item in missing_prices if str(item).strip()]

    waste_factor = _to_float(payload.get("waste_factor"))
    if waste_factor <= 0:
        waste_factor = float(fallback["waste_factor"])

    subtotal = _to_float(payload.get("subtotal"))
    if subtotal <= 0:
        subtotal = round(sum(float(item["total_cost"]) for item in normalized_items), 2)

    roof_squares = int(_to_float(payload.get("roof_squares"))) or int(fallback["roof_squares"])

    return {
        "line_items": normalized_items,
        "assumptions": assumptions,
        "waste_factor": waste_factor,
        "subtotal": round(subtotal, 2),
        "missing_prices": missing_prices,
        "roof_squares": roof_squares,
    }


def _build_user_prompt(job_scope: dict[str, object], pricing_context: dict[str, object]) -> str:
    """Assemble the user prompt for material calculation."""
    return (
        "JOB_SCOPE:\n"
        f"{json.dumps(job_scope, indent=2, ensure_ascii=True)}\n\n"
        "PRICING_CONTEXT:\n"
        f"{json.dumps(pricing_context, indent=2, ensure_ascii=True)}"
    )


async def calculate_materials(state: AgentState) -> dict[str, object]:
    """Calculate material line items using model output with deterministic fallback."""
    job_scope = dict(state.job_scope)
    memory_context = dict(state.memory_context)
    pricing_context_value = memory_context.get("pricing_context")
    pricing_context = dict(pricing_context_value) if isinstance(pricing_context_value, dict) else {}
    errors = list(state.errors)

    fallback = _build_deterministic_materials(job_scope, pricing_context)

    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        return {"materials": fallback}

    try:
        raw_response = await _call_claude(
            system=prompts.CALCULATE_MATERIALS_SYSTEM,
            user=_build_user_prompt(job_scope, pricing_context),
            max_tokens=1400,
        )
        parsed_payload = _parse_json_response(raw_response)
        materials = _normalize_materials(parsed_payload, fallback)
    except Exception as exc:
        LOGGER.warning("calculate_materials fallback used: %s", exc)
        errors.append(f"calculate_materials failed: {exc}")
        return {
            "materials": fallback,
            "errors": errors,
        }

    return {"materials": materials}


__all__ = ["calculate_materials", "_call_claude"]
