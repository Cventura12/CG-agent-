"""Helpers for turning queue approvals into workspace-native artifacts."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from gc_agent.state import Draft


def _to_float(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _quote_like_draft(draft: Draft) -> bool:
    if draft.type in {"CO", "material-order"}:
        return True
    if draft.type == "transcript-review":
        classification = (draft.transcript.classification if draft.transcript else "").strip().lower()
        if classification in {"estimate_request", "quote_question"}:
            return True
    haystack = f"{draft.title} {draft.why} {draft.content}".lower()
    return "quote" in haystack or "pricing" in haystack or "supplement" in haystack


def _draft_input_text(draft: Draft) -> str:
    for candidate in (draft.original_content, draft.content, draft.why, draft.title):
        if candidate and str(candidate).strip():
            return str(candidate).strip()
    return draft.title.strip()


def _draft_transcript_id(draft: Draft) -> str:
    if draft.transcript is None:
        return ""
    return draft.transcript.transcript_id.strip()


def _line_items_from_quote_draft(quote_draft: dict[str, Any]) -> list[dict[str, Any]]:
    line_items = quote_draft.get("line_items")
    if not isinstance(line_items, list):
        return []

    normalized: list[dict[str, Any]] = []
    for index, item in enumerate(line_items):
        if not isinstance(item, dict):
            continue
        description = str(item.get("description") or item.get("name") or f"Line item {index + 1}").strip()
        quantity = _to_float(item.get("quantity") or item.get("qty") or 1) or 1.0
        unit_price = _to_float(item.get("unit_price") or item.get("price") or item.get("amount"))
        total = _to_float(item.get("total"))
        if total <= 0:
            total = round(quantity * unit_price, 2)
        normalized.append(
            {
                "id": str(item.get("id") or f"line-{index + 1}").strip(),
                "description": description,
                "quantity": quantity,
                "unit_price": unit_price,
                "total": total,
            }
        )
    return normalized


def _queue_activity(
    *,
    draft: Draft,
    timestamp: str,
    activity_type: str,
    description: str,
    value: float | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": f"activity-{draft.id}-{uuid4().hex[:8]}",
        "type": activity_type,
        "description": description,
        "timestamp": timestamp,
    }
    if value is not None:
        payload["value"] = value
    return payload


async def build_workspace_review_artifacts(
    *,
    draft: Draft,
    contractor_id: str,
    send_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return queue approval artifacts in the workspace's native shape."""
    timestamp = datetime.now(timezone.utc).isoformat()
    quote_artifact: dict[str, Any] | None = None
    followups: list[dict[str, Any]] = []
    job_activity: list[dict[str, Any]] = []
    errors: list[str] = []

    if _quote_like_draft(draft):
        try:
            from gc_agent.api.router import _create_quote_response  # Lazy import avoids router cycles at module import time.

            quote_response = await _create_quote_response(
                raw_input=_draft_input_text(draft),
                contractor_id=contractor_id,
                session_id=f"queue-{draft.id}",
                transcript_id=_draft_transcript_id(draft),
                job_id=draft.job_id,
            )
            quote_draft = dict(quote_response.get("quote_draft") or {})
            line_items = _line_items_from_quote_draft(quote_draft)
            total_value = _to_float(quote_draft.get("total_price"))
            quote_artifact = {
                "id": str(quote_response.get("quote_id", "")).strip(),
                "job_id": draft.job_id,
                "job_name": draft.job_name,
                "customer_name": str(quote_draft.get("customer_name", "")).strip(),
                "customer_contact": (
                    str(quote_draft.get("customer_phone", "")).strip()
                    or str(quote_draft.get("customer_email", "")).strip()
                ),
                "status": "draft",
                "line_items": line_items,
                "total_value": total_value,
                "created_at": timestamp,
                "source_queue_item_id": draft.id,
                "notes": str(quote_draft.get("scope_of_work", "")).strip() or draft.content,
            }
            job_activity.append(
                _queue_activity(
                    draft=draft,
                    timestamp=timestamp,
                    activity_type="change_order" if draft.type == "CO" else "note",
                    description=f"Draft quote prepared from queue approval: {draft.title}",
                    value=total_value if total_value > 0 else None,
                )
            )
        except Exception as exc:  # noqa: BLE001 - review artifacts should degrade safely
            errors.append(f"quote artifact generation failed: {exc}")

    if draft.type == "follow-up":
        scheduled_for = str((send_result or {}).get("follow_up_due_date", "")).strip()
        followups.append(
            {
                "id": str((send_result or {}).get("open_item_id", "")).strip() or f"followup-{draft.id}",
                "job_id": draft.job_id,
                "job_name": draft.job_name,
                "description": draft.title.strip() or draft.why.strip() or "Follow up with customer",
                "status": "scheduled",
                "scheduled_for": scheduled_for or (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
            }
        )
        job_activity.append(
            _queue_activity(
                draft=draft,
                timestamp=timestamp,
                activity_type="follow_up",
                description=f"Follow-up scheduled from queue approval: {draft.title}",
            )
        )

    job_activity.insert(
        0,
        _queue_activity(
            draft=draft,
            timestamp=timestamp,
            activity_type="change_order" if draft.type == "CO" else "note",
            description=f"Approved queue item: {draft.title}",
            value=quote_artifact.get("total_value") if isinstance(quote_artifact, dict) else None,
        ),
    )

    return {
        "quote": quote_artifact,
        "followups": followups,
        "job_activity": job_activity,
        "active_job_id": draft.job_id,
        "errors": errors,
    }


__all__ = ["build_workspace_review_artifacts"]
