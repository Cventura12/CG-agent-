"""Generate and render quote drafts for the v5 estimating path."""

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
from gc_agent.tools.phase1_fixtures import PHASE1_CONTRACTOR_INFO

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for quote generation."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for generate_quote")
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
        raise ValueError("Claude returned empty quote output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 1800) -> str:
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
            LOGGER.warning("generate_quote rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _strip_markdown_fences(raw: str) -> str:
    """Strip optional markdown code fences from model output."""
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
            raise ValueError("generate_quote response was not valid JSON")
        payload = json.loads(cleaned[start : end + 1])

    if not isinstance(payload, dict):
        raise ValueError("generate_quote payload must be a JSON object")

    return payload


def _to_float(value: Any) -> float:
    """Normalize a numeric-like value into a float."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _scope_sentence(job_scope: dict[str, object], examples: list[str]) -> str:
    """Build a specific scope paragraph from job details and examples."""
    address = str(job_scope.get("address") or "the project site").strip() or "the project site"
    job_type = str(job_scope.get("job_type") or "roofing work").strip() or "roofing work"
    job_type_lower = job_type.lower()
    damage_notes = str(job_scope.get("damage_notes") or "").strip()
    measurements = job_scope.get("measurements")
    squares_text = ""
    pitch_text = ""
    if isinstance(measurements, dict):
        squares = measurements.get("roof_squares")
        pitch = measurements.get("pitch")
        if squares not in (None, "", 0):
            squares_text = f"Estimated size is {squares} roof square(s)."
        if isinstance(pitch, str) and pitch.strip():
            pitch_text = f"Roof pitch noted at {pitch.strip()}."
    lead_example = next((example.strip() for example in examples if example.strip()), "")

    if "modified bitumen" in job_type_lower or "low slope" in job_type_lower or "tpo" in job_type_lower:
        detail_sentence = (
            "Remove compromised membrane areas and install replacement membrane, "
            "base materials, and flashing needed to restore a watertight low-slope assembly."
        )
    elif "metal" in job_type_lower:
        detail_sentence = (
            "Replace damaged metal panels, trim, and fastening components required "
            "to restore a watertight metal roofing system."
        )
    elif "tile" in job_type_lower:
        detail_sentence = (
            "Replace damaged field tiles and repair the associated flashing at the "
            "affected penetration or roof section."
        )
    elif "repair" in job_type_lower or "service call" in job_type_lower:
        detail_sentence = (
            "Perform targeted tear-out and patch repairs at the affected section, "
            "including flashing and sealant work needed to stop the leak."
        )
    else:
        detail_sentence = (
            lead_example
            or "Remove the existing damaged roofing system down to the deck in affected areas and install replacement laminated shingles to match the structure profile."
        )

    parts = [
        f"Provide {job_type} at {address}.",
    ]
    if squares_text:
        parts.append(squares_text)
    if pitch_text:
        parts.append(pitch_text)
    if damage_notes:
        parts.append(f"Observed conditions: {damage_notes}.")
    if detail_sentence:
        parts.append(detail_sentence)

    return " ".join(parts)


def _fallback_quote_draft(
    job_scope: dict[str, object],
    materials: dict[str, object],
    contractor_info: dict[str, object],
    scope_language_examples: list[str],
) -> dict[str, object]:
    """Build a deterministic quote when model output is unavailable."""
    company_name = str(contractor_info.get("company_name") or "GC Agent Estimating").strip()
    customer_name = str(job_scope.get("customer_name") or "Customer").strip() or "Customer"
    address = str(job_scope.get("address") or "Project address pending").strip() or "Project address pending"
    line_items = materials.get("line_items")
    if not isinstance(line_items, list):
        line_items = []

    subtotal = _to_float(materials.get("subtotal"))
    total_price = round(subtotal * 1.15 if subtotal > 0 else 0.0, 2)
    exclusions = [
        "Decking replacement beyond visible damaged areas is excluded unless discovered during tear-off.",
        "Permit fees and code upgrades are excluded unless specifically listed.",
        "Interior repairs are excluded from this roofing proposal.",
    ]

    return {
        "company_name": company_name,
        "customer_name": customer_name,
        "project_address": address,
        "scope_of_work": _scope_sentence(job_scope, scope_language_examples),
        "line_items": line_items,
        "total_price": total_price,
        "exclusions": exclusions,
        "approval_notes": "Review measurements and final field conditions before sending.",
    }


def _normalize_quote_draft(
    payload: dict[str, Any],
    fallback: dict[str, object],
) -> dict[str, object]:
    """Normalize model output while enforcing required Day 5 fields."""
    company_name = str(payload.get("company_name") or "").strip() or str(fallback["company_name"])
    customer_name = str(payload.get("customer_name") or "").strip() or str(fallback["customer_name"])
    project_address = (
        str(payload.get("project_address") or payload.get("address") or "").strip()
        or str(fallback["project_address"])
    )
    scope_of_work = str(payload.get("scope_of_work") or "").strip() or str(fallback["scope_of_work"])

    line_items = payload.get("line_items")
    if not isinstance(line_items, list) or not line_items:
        line_items = fallback["line_items"]

    exclusions = payload.get("exclusions")
    if not isinstance(exclusions, list):
        exclusions = fallback["exclusions"]
    else:
        exclusions = [str(item).strip() for item in exclusions if str(item).strip()]
        if not exclusions:
            exclusions = fallback["exclusions"]

    total_price = _to_float(payload.get("total_price"))
    if total_price <= 0:
        total_price = float(fallback["total_price"])

    approval_notes = (
        str(payload.get("approval_notes") or "").strip()
        or str(fallback["approval_notes"])
    )

    return {
        "company_name": company_name,
        "customer_name": customer_name,
        "project_address": project_address,
        "scope_of_work": scope_of_work,
        "line_items": line_items,
        "total_price": round(total_price, 2),
        "exclusions": exclusions,
        "approval_notes": approval_notes,
    }


def _validate_required_fields(quote_draft: dict[str, object]) -> None:
    """Enforce non-null required Day 5 quote fields."""
    required = ("company_name", "scope_of_work", "total_price", "exclusions")
    missing = [
        field
        for field in required
        if not quote_draft.get(field)
    ]
    if missing:
        raise ValueError(f"quote_draft missing required fields: {', '.join(missing)}")


def _build_user_prompt(
    job_scope: dict[str, object],
    materials: dict[str, object],
    contractor_info: dict[str, object],
    scope_language_examples: list[str],
) -> str:
    """Assemble the user prompt body for quote generation."""
    return (
        "JOB_SCOPE:\n"
        f"{json.dumps(job_scope, indent=2, ensure_ascii=True)}\n\n"
        "MATERIALS_CALCULATION:\n"
        f"{json.dumps(materials, indent=2, ensure_ascii=True)}\n\n"
        "CONTRACTOR_INFO:\n"
        f"{json.dumps(contractor_info, indent=2, ensure_ascii=True)}\n\n"
        "SCOPE_LANGUAGE_EXAMPLES:\n"
        f"{json.dumps(scope_language_examples, indent=2, ensure_ascii=True)}"
    )


def render_quote_text(quote_draft: dict[str, object]) -> str:
    """Render a quote draft into readable plain text for manual scoring."""
    company_name = str(quote_draft.get("company_name") or "GC Agent")
    customer_name = str(quote_draft.get("customer_name") or "Customer")
    project_address = str(quote_draft.get("project_address") or "Address pending")
    scope_of_work = str(quote_draft.get("scope_of_work") or "")
    total_price = _to_float(quote_draft.get("total_price"))
    exclusions = quote_draft.get("exclusions")
    line_items = quote_draft.get("line_items")
    approval_notes = str(quote_draft.get("approval_notes") or "")

    if not isinstance(exclusions, list):
        exclusions = []
    if not isinstance(line_items, list):
        line_items = []

    lines = [
        "GC AGENT QUOTE DRAFT",
        f"Company: {company_name}",
        f"Customer: {customer_name}",
        f"Address: {project_address}",
        "",
        "Scope of Work:",
        scope_of_work,
        "",
        "Line Items:",
    ]

    if not line_items:
        lines.append("  - No line items available.")
    else:
        for item in line_items:
            if not isinstance(item, dict):
                continue
            name = str(item.get("item") or item.get("name") or "Line item")
            quantity = _to_float(item.get("quantity"))
            unit = str(item.get("unit") or "unit")
            total_cost = _to_float(item.get("total_cost"))
            lines.append(f"  - {name}: {quantity:g} {unit} | ${total_cost:,.2f}")

    lines.extend(
        [
            "",
            f"Total Price: ${total_price:,.2f}",
            "",
            "Exclusions:",
        ]
    )

    for exclusion in exclusions:
        lines.append(f"  - {str(exclusion)}")

    if approval_notes:
        lines.extend(
            [
                "",
                "Approval Notes:",
                approval_notes,
            ]
        )

    return "\n".join(lines).strip()


async def generate_quote(state: AgentState) -> dict[str, object]:
    """Generate a validated quote draft and rendered plain-text preview."""
    job_scope = dict(state.job_scope)
    materials = dict(state.materials)
    memory_context = dict(state.memory_context)
    errors = list(state.errors)

    scope_language_examples_value = memory_context.get("scope_language_examples")
    scope_language_examples = (
        [str(item).strip() for item in scope_language_examples_value if str(item).strip()]
        if isinstance(scope_language_examples_value, list)
        else []
    )
    if not scope_language_examples:
        scope_language_examples = []

    contractor_info = dict(PHASE1_CONTRACTOR_INFO)
    fallback = _fallback_quote_draft(
        job_scope=job_scope,
        materials=materials,
        contractor_info=contractor_info,
        scope_language_examples=scope_language_examples,
    )

    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        rendered_quote = render_quote_text(fallback)
        return {
            "quote_draft": fallback,
            "approval_status": "pending",
            "rendered_quote": rendered_quote,
        }

    try:
        raw_response = await _call_claude(
            system=prompts.GENERATE_QUOTE_SYSTEM,
            user=_build_user_prompt(
                job_scope=job_scope,
                materials=materials,
                contractor_info=contractor_info,
                scope_language_examples=scope_language_examples,
            ),
            max_tokens=1800,
        )
        parsed_payload = _parse_json_response(raw_response)
        quote_draft = _normalize_quote_draft(parsed_payload, fallback)
        _validate_required_fields(quote_draft)
    except Exception as exc:
        LOGGER.warning("generate_quote fallback used: %s", exc)
        errors.append(f"generate_quote failed: {exc}")
        quote_draft = fallback
        rendered_quote = render_quote_text(quote_draft)
        return {
            "quote_draft": quote_draft,
            "approval_status": "pending",
            "errors": errors,
            "rendered_quote": rendered_quote,
        }

    rendered_quote = render_quote_text(quote_draft)
    return {
        "quote_draft": quote_draft,
        "approval_status": "pending",
        "rendered_quote": rendered_quote,
    }


__all__ = ["generate_quote", "render_quote_text", "_call_claude"]
