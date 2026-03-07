"""Parse one inbound call transcript into structured operational output."""

from __future__ import annotations

from typing import Any

from gc_agent import prompts
from gc_agent.nodes.parse_update import _call_claude, _parse_json_response
from gc_agent.state import AgentState, CallTranscriptAnalysis

_VALID_CLASSIFICATIONS = {
    "estimate_request",
    "quote_question",
    "job_update",
    "reschedule",
    "complaint_or_issue",
    "followup_response",
    "vendor_or_subcontractor",
    "unknown",
}
_VALID_URGENCIES = {"low", "normal", "high"}


def _normalize_string_list(value: Any) -> list[str]:
    """Return a clean list of non-empty strings."""
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        if isinstance(item, str):
            normalized = item.strip()
            if normalized:
                result.append(normalized)
    return result


def _coerce_confidence(value: Any) -> float | None:
    """Clamp confidence to a 0-100 scale when present."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        numeric = float(value)
    elif isinstance(value, str):
        try:
            numeric = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    if 0 < numeric <= 1:
        numeric *= 100
    if numeric < 0:
        return 0.0
    if numeric > 100:
        return 100.0
    return round(numeric, 2)


def _coerce_optional_bool(value: Any) -> bool | None:
    """Convert common loosely-typed boolean payload values into bool/None."""
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "y", "1"}:
            return True
        if normalized in {"false", "no", "n", "0"}:
            return False
    return None


def _normalize_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Coerce loosely-typed model output into the transcript schema."""
    summary = str(payload.get("summary", "")).strip()
    if not summary:
        raise ValueError("call transcript summary is required")

    classification = str(payload.get("classification", "unknown")).strip().lower() or "unknown"
    if classification not in _VALID_CLASSIFICATIONS:
        classification = "unknown"

    urgency = str(payload.get("urgency", "normal")).strip().lower() or "normal"
    if urgency not in _VALID_URGENCIES:
        urgency = "normal"

    normalized: dict[str, Any] = {
        "classification": classification,
        "confidence": _coerce_confidence(payload.get("confidence")),
        "summary": summary,
        "urgency": urgency,
        "risks": _normalize_string_list(payload.get("risks")),
        "missing_information": _normalize_string_list(payload.get("missing_information")),
        "next_actions": _normalize_string_list(payload.get("next_actions")),
        "job_type": str(payload.get("job_type", "")).strip() or None,
        "scope_items": _normalize_string_list(payload.get("scope_items")),
        "customer_questions": _normalize_string_list(payload.get("customer_questions")),
        "insurance_involved": _coerce_optional_bool(payload.get("insurance_involved")),
        "scheduling_notes": _normalize_string_list(payload.get("scheduling_notes")),
    }
    return normalized


async def parse_call_transcript(state: AgentState) -> dict[str, object]:
    """Classify and summarize a call transcript into validated structured output."""
    if not state.raw_input.strip():
        raise ValueError("call transcript text is required")

    matched_job = next((job for job in state.jobs if job.id == state.active_job_id), None)
    if matched_job is not None:
        context_block = prompts.jobs_context_block([matched_job])
    else:
        context_block = prompts.jobs_context_block(state.jobs[:6])

    user_prompt = (
        "CALL TRANSCRIPT:\n"
        f"{state.raw_input.strip()}\n\n"
        "MATCHED CALLER:\n"
        f"phone={state.from_number.strip() or 'unknown'}\n\n"
        "MATCHED CONTEXT:\n"
        f"active_job_id={state.active_job_id.strip() or 'none'}\n"
        f"{context_block}"
    )

    raw_response = await _call_claude(
        system=prompts.CALL_TRANSCRIPT_SYSTEM,
        user=user_prompt,
        max_tokens=1200,
    )
    parsed_payload = _parse_json_response(raw_response)
    analysis = CallTranscriptAnalysis.model_validate(_normalize_payload(parsed_payload))
    return {"transcript_analysis": analysis}


__all__ = ["parse_call_transcript"]
