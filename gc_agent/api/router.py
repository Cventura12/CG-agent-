"""Public contractor-facing API router."""

from __future__ import annotations

from importlib import import_module
import logging
import asyncio
import os
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile, status
from pydantic import BaseModel, Field

from gc_agent.api.auth import DEFAULT_ESTIMATE_GC_ID, require_api_key
from gc_agent.api.quote_pdf import render_quote_pdf
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.email_delivery import send_email_message
from gc_agent.nodes.followup_trigger import ensure_quote_followup, stop_quote_followup
from gc_agent.nodes.send_and_track import send_and_track
from gc_agent.responsibilities import responsibilities_catalog
from gc_agent.spreadsheet_export import build_quote_xlsx
from gc_agent.nodes.update_memory import build_prompt_tuning_signals, update_memory
from gc_agent.state import AgentState, Draft
from gc_agent.telemetry import write_agent_trace
from gc_agent.tools.upload_storage import is_allowed_upload, upload_quote_source_file
from gc_agent.workspace_review import build_workspace_review_artifacts
from gc_agent.webhooks.twilio import send_sms_message, send_whatsapp_message

open_router = APIRouter()
router = APIRouter(dependencies=[Depends(require_api_key)])
APP_VERSION = "0.1"
LOGGER = logging.getLogger(__name__)


class _GraphProxy:
    """Lazy runtime graph proxy so API imports do not require langgraph up front."""

    _module: Any | None

    def __init__(self) -> None:
        self._module = None

    def _resolve(self) -> Any:
        if self._module is None:
            self._module = import_module("gc_agent.graph")
        return self._module

    async def run_update(self, *args: Any, **kwargs: Any) -> Any:
        return await self._resolve().run_update(*args, **kwargs)

    async def run_query(self, *args: Any, **kwargs: Any) -> Any:
        return await self._resolve().run_query(*args, **kwargs)

    async def run_briefing(self, *args: Any, **kwargs: Any) -> Any:
        return await self._resolve().run_briefing(*args, **kwargs)


graph = _GraphProxy()


async def run_single_estimate(*args: Any, **kwargs: Any) -> Any:
    """Lazily import the estimate CLI runner only when the quote endpoint needs it."""
    cli_module = import_module("gc_agent.cli")
    return await cli_module.run_single_estimate(*args, **kwargs)


async def _get_transcript_quote_prefill(*args: object, **kwargs: object):
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.get_transcript_quote_prefill(*args, **kwargs)


async def _link_transcript_to_job(*args: object, **kwargs: object):
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.link_transcript_to_job(*args, **kwargs)


async def _mark_transcript_reviewed(*args: object, **kwargs: object):
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.mark_transcript_reviewed(*args, **kwargs)


async def _discard_transcript(*args: object, **kwargs: object):
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.discard_transcript(*args, **kwargs)


def _confirmation_enabled() -> bool:
    return os.getenv("ARBOR_CONFIRMATION_ENABLED", "").strip().lower() in {"1", "true", "yes"}


def _confirmation_channel() -> str:
    channel = os.getenv("ARBOR_CONFIRMATION_CHANNEL", "sms").strip().lower()
    return channel if channel in {"sms", "whatsapp"} else "sms"


def _build_confirmation_message(draft: Draft) -> str:
    summary = draft.title or "Update"
    job_label = draft.job_name or "the job"
    return f"Confirming for {job_label}: {summary}. Reply YES if correct."


async def _log_transcript_as_update(*args: object, **kwargs: object):
    transcript_module = import_module("gc_agent.call_transcripts")
    return await transcript_module.log_transcript_as_update(*args, **kwargs)


class QuoteRequest(BaseModel):
    """Request body for generating a quote from field notes or a transcript."""

    input: str = Field(min_length=1)
    contractor_id: str = Field(default=DEFAULT_ESTIMATE_GC_ID, min_length=1)
    session_id: str = ""
    transcript_id: str = ""
    job_id: str = ""


class ApproveDraftRequest(BaseModel):
    """Request body for approving a queued draft."""

    contractor_id: str = Field(min_length=1)


class UpdateRequest(BaseModel):
    """Request body for routing a job update into the v4 path."""

    input: str = Field(min_length=1)
    contractor_id: str = Field(min_length=1)


class QueryRequest(BaseModel):
    """Request body for routing a GC question into query mode."""

    input: str = Field(min_length=1)
    contractor_id: str = Field(min_length=1)


class EditDraftRequest(BaseModel):
    """Request body for editing a draft before approval."""

    contractor_id: str = Field(min_length=1)
    content: str = Field(min_length=1)


class TranscriptActionRequest(BaseModel):
    """Request body for transcript inbox actions in the public API."""

    contractor_id: str = Field(min_length=1)


class PublicLinkTranscriptJobRequest(TranscriptActionRequest):
    """Payload for linking a transcript inbox item to a job in the public API."""

    job_id: str = Field(min_length=1)


class QuoteDecisionRequest(BaseModel):
    """Request body for quote approve/discard decisions."""

    contractor_id: str = Field(min_length=1)
    feedback_note: str = ""


class QuoteEditRequest(QuoteDecisionRequest):
    """Request body for quote edit + approve with a final quote payload."""

    final_quote_draft: dict[str, Any] = Field(default_factory=dict)
    edited_scope_of_work: str = ""
    edited_total_price: float | None = None


class QuoteSendRequest(BaseModel):
    """Request body for one-tap quote delivery to the client."""

    contractor_id: str = Field(min_length=1)
    channel: str = Field(default="whatsapp", min_length=1)
    destination: str = Field(min_length=3)
    recipient_name: str = ""
    message_override: str = ""


def _serialize_draft(draft: Draft) -> dict[str, Any]:
    """Serialize a Draft model into JSON-safe response data."""
    return draft.model_dump(mode="json")


def _serialize_job(job: Any) -> dict[str, Any]:
    """Serialize a Job model into JSON-safe response data."""
    if hasattr(job, "model_dump"):
        return job.model_dump(mode="json")
    return dict(job)


def _compute_public_job_health(job: Any) -> str:
    """Derive one compact health label for the public jobs surface."""
    open_items = getattr(job, "open_items", []) or []
    oldest_silent = max((getattr(item, "days_silent", 0) for item in open_items), default=0)
    if oldest_silent >= 7:
        return "blocked"
    if len(open_items) > 0:
        return "at-risk"
    return "on-track"


def _serialize_public_open_item(item: Any) -> dict[str, Any]:
    """Serialize one open item with derived operational flags for the workspace."""
    payload = item.model_dump(mode="json") if hasattr(item, "model_dump") else dict(item)
    normalized_type = str(payload.get("type", "")).strip().lower()
    description = str(payload.get("description", "")).strip().lower()
    financial_exposure = normalized_type in {"co", "approval", "quote"} or any(
        fragment in description
        for fragment in (
            "change order",
            "scope change",
            "additional work",
            "extra work",
            "approval",
            "signoff",
            "cost",
            "allowance",
        )
    )
    change_related = normalized_type == "co" or any(
        fragment in description
        for fragment in ("change order", "scope change", "additional work", "extra work", "revised price")
    )
    followthrough_related = normalized_type in {"follow-up", "followup"}
    payload["financial_exposure"] = financial_exposure
    payload["change_related"] = change_related
    payload["followthrough_related"] = followthrough_related
    payload["stalled"] = int(payload.get("days_silent") or 0) >= 3
    payload["kind_label"] = (
        "Money at risk"
        if financial_exposure
        else "Change to review"
        if change_related
        else "Follow-through"
        if followthrough_related
        else normalized_type.replace("-", " ") if normalized_type else "Open item"
    )
    return payload


def _serialize_public_job(job: Any) -> dict[str, Any]:
    """Serialize a public job payload including health and operational summary."""
    payload = _serialize_job(job)
    open_items = [_serialize_public_open_item(item) for item in getattr(job, "open_items", []) or []]
    payload["open_items"] = open_items
    payload["operational_summary"] = {
        "open_item_count": len(open_items),
        "financial_exposure_count": sum(1 for item in open_items if item.get("financial_exposure")),
        "unresolved_change_count": sum(1 for item in open_items if item.get("change_related")),
        "approval_count": sum(1 for item in open_items if str(item.get("type", "")).strip().lower() == "approval"),
        "followthrough_count": sum(1 for item in open_items if item.get("followthrough_related")),
        "stalled_count": sum(1 for item in open_items if item.get("stalled")),
    }
    payload["health"] = _compute_public_job_health(job)
    return payload


def _to_float(value: Any) -> float:
    """Normalize numeric-like values for delta math."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _quote_delta(
    original_quote: dict[str, Any],
    final_quote: dict[str, Any],
) -> dict[str, Any]:
    """Summarize contractor edits for memory and product analytics."""
    changed_fields: list[str] = []
    for key in sorted(set(original_quote) | set(final_quote)):
        if original_quote.get(key) != final_quote.get(key):
            changed_fields.append(key)

    original_total = _to_float(original_quote.get("total_price"))
    final_total = _to_float(final_quote.get("total_price"))
    price_delta = round(final_total - original_total, 2)
    price_delta_pct = round((price_delta / original_total) * 100, 2) if original_total else None

    return {
        "changed": bool(changed_fields),
        "changed_fields": changed_fields,
        "scope_changed": original_quote.get("scope_of_work") != final_quote.get("scope_of_work"),
        "line_items_changed": original_quote.get("line_items") != final_quote.get("line_items"),
        "price_delta": price_delta,
        "price_delta_pct": price_delta_pct,
        "prompt_tuning_signals": build_prompt_tuning_signals(original_quote, final_quote),
    }


def _apply_quote_edits(
    base_quote: dict[str, Any],
    payload: QuoteEditRequest,
) -> dict[str, Any]:
    """Build the final quote that will be sent after contractor edits."""
    final_quote = dict(base_quote)
    if payload.final_quote_draft:
        final_quote.update(payload.final_quote_draft)

    if payload.edited_scope_of_work.strip():
        final_quote["scope_of_work"] = payload.edited_scope_of_work.strip()
    if payload.edited_total_price is not None:
        final_quote["total_price"] = float(payload.edited_total_price)
    return final_quote


def _quote_for_delivery(record: dict[str, Any]) -> dict[str, Any]:
    """Select the safest quote payload for downstream customer-facing output."""
    return _select_quote_source(record, context="delivery")


def _is_valid_quote_source(candidate: Any) -> bool:
    """Return True when a quote payload is complete enough for PDF/send output."""
    if not isinstance(candidate, dict) or not candidate:
        return False
    if not str(candidate.get("scope_of_work", "")).strip():
        return False
    if "total_price" not in candidate:
        return False

    line_items = candidate.get("line_items")
    if line_items is not None and not isinstance(line_items, list):
        return False

    exclusions = candidate.get("exclusions")
    if exclusions is not None and not isinstance(exclusions, list):
        return False
    return True


def _select_quote_source(record: dict[str, Any], *, context: str) -> dict[str, Any]:
    """Use final edited quote when safe, otherwise fall back to the generated draft."""
    original_quote = record.get("quote_draft")
    fallback = dict(original_quote) if isinstance(original_quote, dict) else {}
    final_quote = record.get("final_quote_draft")
    if isinstance(final_quote, dict) and final_quote:
        if _is_valid_quote_source(final_quote):
            return dict(final_quote)

        error_text = f"{context}: final_quote_draft malformed; falling back to quote_draft"
        LOGGER.warning(error_text)
        write_agent_trace(
            trace_id=str(record.get("trace_id", "")).strip(),
            gc_id=str(record.get("gc_id", "")).strip(),
            job_id=str(record.get("job_id", "")).strip(),
            input_surface="api",
            flow="estimate",
            node_name="quote_source_select",
            status="error",
            error_text=error_text,
            input_preview={
                "quote_id": str(record.get("id", "")).strip(),
                "context": context,
                "final_quote_keys": sorted(final_quote.keys()),
            },
            output_preview={"fallback_keys": sorted(fallback.keys())},
        )
    return fallback


def _build_delivery_message(
    *,
    quote_id: str,
    quote: dict[str, Any],
    recipient_name: str,
    message_override: str,
) -> str:
    """Format a concise client-facing quote message."""
    if message_override.strip():
        return message_override.strip()

    company = str(quote.get("company_name", "Arbor")).strip() or "Arbor"
    address = str(quote.get("project_address", "your project")).strip() or "your project"
    total = _to_float(quote.get("total_price"))
    scope = str(quote.get("scope_of_work", "")).strip()
    scope_preview = scope if len(scope) <= 240 else scope[:237].rstrip() + "..."
    greeting = f"Hi {recipient_name.strip()}," if recipient_name.strip() else "Hi,"
    total_line = f"Estimated total: ${total:,.0f}." if total > 0 else "Estimated total available in attached quote."
    return (
        f"{greeting} {company} prepared your quote for {address}.\n"
        f"{total_line}\n"
        f"Scope: {scope_preview}\n"
        f"Reference: {quote_id}"
    ).strip()


def _build_delivery_subject(*, quote_id: str, quote: dict[str, Any]) -> str:
    """Format a concise email subject for an outbound quote."""
    company = str(quote.get("company_name", "Arbor")).strip() or "Arbor"
    address = str(quote.get("project_address", "your project")).strip() or "your project"
    return f"{company} quote for {address} ({quote_id})"


def _normalize_source_files(source_files: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    """Keep only JSON-safe uploaded source metadata."""
    normalized: list[dict[str, Any]] = []
    for item in source_files or []:
        if not isinstance(item, dict):
            continue
        storage_ref = str(item.get("storage_ref", "")).strip()
        if not storage_ref:
            continue
        normalized.append(
            {
                "storage_ref": storage_ref,
                "bucket": str(item.get("bucket", "")).strip(),
                "path": str(item.get("path", "")).strip(),
                "filename": str(item.get("filename", "")).strip(),
                "content_type": str(item.get("content_type", "")).strip(),
                "size_bytes": int(item.get("size_bytes", 0) or 0),
            }
        )
    return normalized


async def _create_quote_response(
    *,
    raw_input: str,
    contractor_id: str,
    session_id: str = "",
    source_files: list[dict[str, Any]] | None = None,
    transcript_id: str = "",
    job_id: str = "",
) -> dict[str, Any]:
    """Run the estimate flow and persist one quote draft response."""
    normalized_source_files = _normalize_source_files(source_files)
    transcript_value = transcript_id.strip()
    requested_job_id = job_id.strip()
    transcript_record = None
    if transcript_value:
        try:
            transcript_record = await queries.get_call_transcript_by_id(transcript_value, contractor_id)
        except DatabaseError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"transcript lookup failed: {exc}",
            ) from exc
    try:
        state = await run_single_estimate(
            raw_input,
            session_id=session_id,
            gc_id=contractor_id,
            uploaded_files=normalized_source_files,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"quote generation failed: {exc}",
        ) from exc

    if not state.quote_draft:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="quote generation returned no quote_draft",
        )

    quote_id = session_id.strip() or str(uuid4())
    estimate_confidence = _estimate_confidence(state, transcript_record=transcript_record)
    assumptions_raw = state.materials.get("assumptions")
    assumptions = (
        [str(item).strip() for item in assumptions_raw if str(item).strip()]
        if isinstance(assumptions_raw, list)
        else []
    )
    clarification_questions = [
        str(item).strip()
        for item in state.clarification_questions
        if str(item).strip()
    ]
    quote_draft = dict(state.quote_draft)
    transcript_caller = (
        str((transcript_record or {}).get("caller_name", "")).strip()
        if isinstance(transcript_record, dict)
        else ""
    )
    if transcript_caller and not str(quote_draft.get("customer_name", "")).strip():
        quote_draft["customer_name"] = transcript_caller

    resolved_job_id = (
        state.active_job_id.strip()
        or requested_job_id
        or (str((transcript_record or {}).get("job_id", "")).strip() if isinstance(transcript_record, dict) else "")
    )
    pricing_context = state.memory_context.get("pricing_context")
    has_pricing_context = isinstance(pricing_context, dict) and bool(pricing_context)
    contractor_profile = (
        state.memory_context.get("contractor_profile", {})
        if isinstance(state.memory_context.get("contractor_profile"), dict)
        else {}
    )
    pricing_signals = (
        contractor_profile.get("pricing_signals", {})
        if isinstance(contractor_profile.get("pricing_signals"), dict)
        else {}
    )
    cold_start = {
        "active": not bool(state.memory_context.get("has_relevant_memory")) and not has_pricing_context,
        "primary_trade": str(pricing_signals.get("primary_trade", "")).strip() or "general_construction",
    }
    try:
        await queries.upsert_quote_draft(
            quote_id=quote_id,
            gc_id=contractor_id,
            job_id=resolved_job_id,
            trace_id=state.trace_id,
            quote_draft=quote_draft,
            rendered_quote=state.rendered_quote,
            estimate_confidence=estimate_confidence,
            source_files=normalized_source_files,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"quote persistence failed: {exc}",
        ) from exc

    if transcript_value and isinstance(transcript_record, dict):
        existing_metadata = (
            transcript_record.get("metadata")
            if isinstance(transcript_record.get("metadata"), dict)
            else {}
        )
        try:
            await queries.update_call_transcript(
                transcript_value,
                contractor_id,
                quote_id=quote_id,
                job_id=resolved_job_id,
                trace_id=state.trace_id,
                metadata={
                    **existing_metadata,
                    "quote_prefill_used": True,
                    "quote_prefill_quote_id": quote_id,
                },
            )
        except DatabaseError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"transcript linkage failed: {exc}",
            ) from exc

    return {
        "quote_id": quote_id,
        "trace_id": state.trace_id,
        "quote_draft": quote_draft,
        "rendered_quote": state.rendered_quote,
        "estimate_confidence": estimate_confidence,
        "review_required": bool(estimate_confidence.get("review_required", True)),
        "send_blocked": bool(estimate_confidence.get("send_blocked", True)),
        "blocking_reasons": list(estimate_confidence.get("blocking_reasons", [])),
        "missing_information": list(estimate_confidence.get("missing_information", [])),
        "evidence_signals": list(estimate_confidence.get("evidence_signals", [])),
        "assumptions": assumptions,
        "clarification_questions": clarification_questions,
        "cold_start": cold_start,
        "active_job_id": resolved_job_id,
        "errors": state.errors,
        "source_files": normalized_source_files,
    }


def _estimate_confidence(state: AgentState, *, transcript_record: dict[str, Any] | None = None) -> dict[str, Any]:
    """Compute user-facing estimate confidence based on extraction/data completeness."""
    extraction_conf = str(state.job_scope.get("extraction_confidence", "medium")).strip().lower()
    if extraction_conf not in {"high", "medium", "low"}:
        extraction_conf = "medium"

    missing_fields_raw = state.job_scope.get("missing_fields")
    missing_fields = (
        [str(item).strip() for item in missing_fields_raw if str(item).strip()]
        if isinstance(missing_fields_raw, list)
        else []
    )
    missing_prices_raw = state.materials.get("missing_prices")
    missing_prices = (
        [str(item).strip() for item in missing_prices_raw if str(item).strip()]
        if isinstance(missing_prices_raw, list)
        else []
    )
    transcript_missing = []
    transcript_extracted = (
        transcript_record.get("extracted_json")
        if isinstance(transcript_record, dict) and isinstance(transcript_record.get("extracted_json"), dict)
        else {}
    )
    transcript_missing_raw = transcript_extracted.get("missing_information") if isinstance(transcript_extracted, dict) else []
    if isinstance(transcript_missing_raw, list):
        transcript_missing = [str(item).strip() for item in transcript_missing_raw if str(item).strip()]

    pricing_context = state.memory_context.get("pricing_context")
    pricing_context_count = len(pricing_context) if isinstance(pricing_context, dict) else 0
    similar_jobs = state.memory_context.get("similar_jobs")
    similar_job_count = len(similar_jobs) if isinstance(similar_jobs, list) else 0

    base_score = {"high": 88, "medium": 70, "low": 52}[extraction_conf]
    score = base_score
    score -= min(len(missing_fields) * 5, 25)
    score -= min(len(missing_prices) * 4, 20)
    score -= min(len(transcript_missing) * 3, 12)
    if state.clarification_needed:
        score -= 8
    if state.errors:
        score -= 12
    if pricing_context_count >= 2:
        score += 6
    if similar_job_count >= 1:
        score += 4
    score = max(10, min(score, 98))

    level = "high" if score >= 80 else "medium" if score >= 60 else "low"
    reasons: list[str] = [f"Extraction confidence from field input: {extraction_conf}."]
    evidence_signals: list[str] = []
    if pricing_context_count:
        evidence_signals.append(f"Contractor pricing context matched {pricing_context_count} pricing signals.")
    if similar_job_count:
        evidence_signals.append(f"Historical memory found {similar_job_count} comparable job example(s).")
    if transcript_record:
        evidence_signals.append("Estimate request was linked to a stored call transcript.")
    if missing_fields:
        reasons.append(f"Missing scope fields: {', '.join(missing_fields[:4])}.")
    if missing_prices:
        reasons.append(f"Missing price inputs: {', '.join(missing_prices[:4])}.")
    if transcript_missing:
        reasons.append(f"Transcript left open details: {', '.join(transcript_missing[:4])}.")
    if state.clarification_needed:
        reasons.append("Clarification questions are still open.")
    if state.errors:
        reasons.append("One or more node errors were recorded during generation.")
    if len(reasons) == 1:
        reasons.append("Key scope and pricing inputs were available.")
    if not evidence_signals:
        evidence_signals.append("Estimate relies primarily on current field input and contractor defaults.")

    missing_information = []
    for item in [*missing_fields, *missing_prices, *transcript_missing, *state.clarification_questions]:
        normalized = str(item).strip()
        if normalized and normalized not in missing_information:
            missing_information.append(normalized)

    review_required = level != "high" or bool(missing_information) or bool(state.errors) or state.clarification_needed
    blocking_reasons = []
    if review_required:
        blocking_reasons.append("Approve or edit the quote before sending it to the customer.")
    if missing_information:
        blocking_reasons.append("Confirm the missing job details before treating this quote as final.")
    if state.errors:
        blocking_reasons.append("Generation recorded runtime errors. Review the draft carefully.")

    return {
        "level": level,
        "score": score,
        "extraction_confidence": extraction_conf,
        "missing_fields": missing_fields,
        "missing_prices": missing_prices,
        "reasons": reasons,
        "review_required": review_required,
        "send_blocked": review_required,
        "blocking_reasons": blocking_reasons,
        "missing_information": missing_information,
        "evidence_signals": evidence_signals,
    }


async def _deliver_quote_message(channel: str, destination: str, body: str) -> str:
    """Lazily import Twilio senders to avoid hard dependency at API import time."""
    twilio_module = import_module("gc_agent.webhooks.twilio")
    if channel == "whatsapp":
        sender = getattr(twilio_module, "send_whatsapp_message")
    else:
        sender = getattr(twilio_module, "send_sms_message")
    return await sender(destination, body)


async def _deliver_quote_email(
    destination: str,
    subject: str,
    body: str,
    *,
    pdf_bytes: bytes,
    quote_id: str,
) -> str:
    """Send quote email through SMTP and return the Message-ID."""
    filename = f"gc-agent-quote-{quote_id}.pdf"
    return await asyncio.to_thread(
        send_email_message,
        destination,
        subject,
        body,
        pdf_bytes=pdf_bytes,
        pdf_filename=filename,
    )


@router.post("/quote")
async def create_quote(payload: QuoteRequest) -> dict[str, Any]:
    """Run the v5 estimating path and return the generated quote payload."""
    return await _create_quote_response(
        raw_input=payload.input,
        contractor_id=payload.contractor_id,
        session_id=payload.session_id,
        transcript_id=payload.transcript_id,
        job_id=payload.job_id,
    )


@router.post("/quote/upload")
async def create_quote_upload(
    contractor_id: str = Form(default=DEFAULT_ESTIMATE_GC_ID),
    input: str = Form(default=""),
    session_id: str = Form(default=""),
    transcript_id: str = Form(default=""),
    job_id: str = Form(default=""),
    file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    """Run the quote flow from typed notes plus one uploaded PDF/image."""
    notes = input.strip()
    if not notes and file is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Provide typed notes, an uploaded file, or both",
        )

    source_files: list[dict[str, Any]] = []
    if file is not None:
        filename = str(file.filename or "").strip()
        content_type = str(file.content_type or "").strip().lower()
        if not filename or not is_allowed_upload(filename, content_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only PDF, JPG, and PNG uploads are supported",
            )

        payload = await file.read()
        try:
            stored = await asyncio.to_thread(
                upload_quote_source_file,
                contractor_id=contractor_id,
                session_id=session_id,
                filename=filename,
                content_type=content_type,
                payload=payload,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"quote upload failed: {exc}",
            ) from exc

        source_files.append(stored)

    return await _create_quote_response(
        raw_input=notes,
        contractor_id=contractor_id,
        session_id=session_id,
        source_files=source_files,
        transcript_id=transcript_id,
        job_id=job_id,
    )


@router.get("/quote/{quote_id}/pdf")
async def get_quote_pdf(
    quote_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> Response:
    """Render and return a stored quote draft as a PDF document."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")

    if str(record.get("gc_id", "")).strip() != contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    try:
        pdf_bytes = render_quote_pdf(quote_id, _select_quote_source(record, context="pdf"))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    filename = f"gc-agent-quote-{quote_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-GC-Trace-Id": str(record.get("trace_id", "")).strip(),
        },
    )


@router.get("/quote/{quote_id}/export/xlsx")
async def export_quote_xlsx(
    quote_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> Response:
    """Render and return a stored quote draft as an XLSX document."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")

    if str(record.get("gc_id", "")).strip() != contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    quote_source = _select_quote_source(record, context="xlsx_export")
    xlsx_bytes = build_quote_xlsx(
        quote_id,
        quote_source,
        approval_status=str(record.get("approval_status", "")).strip(),
        trace_id=str(record.get("trace_id", "")).strip(),
    )
    filename = f"gc-agent-quote-{quote_id}.xlsx"
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "X-GC-Trace-Id": str(record.get("trace_id", "")).strip(),
        },
    )


@router.get("/quote/{quote_id}/delivery")
async def get_quote_delivery(
    quote_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return all known outbound delivery attempts for a quote."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    try:
        deliveries = await queries.get_quote_delivery_attempts(quote_id, contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "deliveries": [
            {
                "delivery_id": str(row.get("id", "")).strip(),
                "channel": str(row.get("channel", "")).strip().lower(),
                "recipient": str(row.get("recipient_name", "")).strip(),
                "destination": str(row.get("destination", "")).strip(),
                "status": str(row.get("delivery_status", "")).strip().lower() or "pending",
                "sent_at": row.get("created_at"),
                "external_id": str(row.get("provider_message_id", "")).strip(),
                "error_message": str(row.get("error_message", "")).strip(),
            }
            for row in deliveries
        ],
    }


@router.get("/quote/{quote_id}/followup")
async def get_quote_followup(
    quote_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return the current follow-up state for one quote."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    try:
        followup = await queries.get_quote_followup_state(quote_id, contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "followup": followup,
    }


@router.post("/quote/{quote_id}/followup/stop")
async def stop_quote_followup_route(
    quote_id: str,
    payload: QuoteDecisionRequest,
) -> dict[str, Any]:
    """Manually stop automatic follow-up reminders for a quote."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    result = await stop_quote_followup(payload.contractor_id, quote_id)
    if str(result.get("reason", "")).strip() == "not_found":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="no active follow-up found for quote")

    try:
        followup = await queries.get_quote_followup_state(quote_id, payload.contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "stopped": bool(result.get("stopped", False)),
        "reason": str(result.get("reason", "")).strip(),
        "followup": followup,
    }


@router.post("/quote/{quote_id}/send")
async def send_quote_to_client(
    quote_id: str,
    payload: QuoteSendRequest,
) -> dict[str, Any]:
    """Deliver a quote to a customer via WhatsApp or SMS in one tap."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")
    approval_status = str(record.get("approval_status", "")).strip().lower()
    if approval_status not in {"approved", "edited"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve or edit the quote before sending it to the customer",
        )

    channel = payload.channel.strip().lower()
    if channel not in {"whatsapp", "sms", "email"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="channel must be 'whatsapp', 'sms', or 'email'",
        )

    quote = _quote_for_delivery(record)
    message_body = _build_delivery_message(
        quote_id=quote_id,
        quote=quote,
        recipient_name=payload.recipient_name,
        message_override=payload.message_override,
    )
    subject = _build_delivery_subject(quote_id=quote_id, quote=quote)

    provider_message_id = ""
    delivery_status = "sent"
    error_message = ""
    try:
        if channel == "email":
            pdf_bytes = render_quote_pdf(quote_id, quote)
            provider_message_id = await _deliver_quote_email(
                payload.destination,
                subject,
                message_body,
                pdf_bytes=pdf_bytes,
                quote_id=quote_id,
            )
        else:
            provider_message_id = await _deliver_quote_message(channel, payload.destination, message_body)
    except Exception as exc:
        delivery_status = "failed"
        error_message = str(exc)

    delivery_id = ""
    try:
        delivery_id = await queries.insert_quote_delivery_log(
            quote_id=quote_id,
            gc_id=payload.contractor_id,
            job_id=str(record.get("job_id", "")).strip(),
            trace_id=str(record.get("trace_id", "")).strip(),
            channel=channel,
            destination=payload.destination,
            recipient_name=payload.recipient_name,
            message_preview=message_body,
            delivery_status=delivery_status,
            provider_message_id=provider_message_id,
            error_message=error_message,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if delivery_status != "sent":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"quote delivery failed: {error_message}",
        )

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "delivery_id": delivery_id,
        "channel": channel,
        "destination": payload.destination,
        "provider_message_id": provider_message_id,
        "status": delivery_status,
    }


@router.post("/quote/{quote_id}/approve")
async def approve_quote(
    quote_id: str,
    payload: QuoteDecisionRequest,
) -> dict[str, Any]:
    """Approve a generated quote as-is and store feedback/memory signals."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    original_quote = dict(record.get("quote_draft") or {})
    final_quote = dict(original_quote)
    quote_delta = _quote_delta(original_quote, final_quote)
    memory_result = await update_memory(
        AgentState(
            gc_id=payload.contractor_id,
            trace_id=str(record.get("trace_id", "")).strip(),
            active_job_id=str(record.get("job_id", "")).strip(),
            quote_draft=original_quote,
            final_quote_draft=final_quote,
            approval_status="approved",
        )
    )
    memory_context = memory_result.get("memory_context")
    memory_updated = bool(isinstance(memory_context, dict) and memory_context.get("memory_updated"))
    memory_summary = (
        str(memory_context.get("last_change_summary", "")).strip()
        if isinstance(memory_context, dict)
        else ""
    )

    try:
        await queries.finalize_quote_draft_feedback(
            quote_id=quote_id,
            gc_id=payload.contractor_id,
            final_quote_draft=final_quote,
            approval_status="approved",
            was_edited=False,
            quote_delta=quote_delta,
            feedback_note=payload.feedback_note,
            memory_updated=memory_updated,
            memory_summary=memory_summary,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    followup_result = {
        "created": False,
        "open_item_id": "",
        "reason": "not_attempted",
    }
    try:
        followup_result = await ensure_quote_followup(
            payload.contractor_id,
            str(record.get("job_id", "")).strip(),
            quote_id,
            str(record.get("trace_id", "")).strip(),
            final_quote=final_quote,
        )
    except Exception as exc:
        LOGGER.warning("quote approve follow-up failed: %s", exc)
        write_agent_trace(
            trace_id=str(record.get("trace_id", "")).strip(),
            gc_id=payload.contractor_id,
            job_id=str(record.get("job_id", "")).strip(),
            input_surface="api",
            flow="estimate",
            node_name="quote_followup",
            status="error",
            error_text=f"approve follow-up failed: {exc}",
            input_preview={"quote_id": quote_id, "approval_status": "approved"},
            output_preview={},
        )

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "approval_status": "approved",
        "was_edited": False,
        "quote_draft": final_quote,
        "quote_delta": quote_delta,
        "memory_updated": memory_updated,
        "followup_created": bool(followup_result.get("created")),
        "followup_open_item_id": str(followup_result.get("open_item_id", "")).strip(),
    }


@router.post("/quote/{quote_id}/edit")
async def edit_quote(
    quote_id: str,
    payload: QuoteEditRequest,
) -> dict[str, Any]:
    """Approve an edited quote and capture edit deltas for memory learning."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    original_quote = dict(record.get("quote_draft") or {})
    final_quote = _apply_quote_edits(original_quote, payload)
    quote_delta = _quote_delta(original_quote, final_quote)
    was_edited = bool(quote_delta.get("changed"))
    approval_status = "edited" if was_edited else "approved"

    memory_result = await update_memory(
        AgentState(
            gc_id=payload.contractor_id,
            trace_id=str(record.get("trace_id", "")).strip(),
            active_job_id=str(record.get("job_id", "")).strip(),
            quote_draft=original_quote,
            final_quote_draft=final_quote,
            approval_status=approval_status,
        )
    )
    memory_context = memory_result.get("memory_context")
    memory_updated = bool(isinstance(memory_context, dict) and memory_context.get("memory_updated"))
    memory_summary = (
        str(memory_context.get("last_change_summary", "")).strip()
        if isinstance(memory_context, dict)
        else ""
    )

    try:
        await queries.finalize_quote_draft_feedback(
            quote_id=quote_id,
            gc_id=payload.contractor_id,
            final_quote_draft=final_quote,
            approval_status=approval_status,
            was_edited=was_edited,
            quote_delta=quote_delta,
            feedback_note=payload.feedback_note,
            memory_updated=memory_updated,
            memory_summary=memory_summary,
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    followup_result = {
        "created": False,
        "open_item_id": "",
        "reason": "not_attempted",
    }
    try:
        followup_result = await ensure_quote_followup(
            payload.contractor_id,
            str(record.get("job_id", "")).strip(),
            quote_id,
            str(record.get("trace_id", "")).strip(),
            final_quote=final_quote,
        )
    except Exception as exc:
        LOGGER.warning("quote edit follow-up failed: %s", exc)
        write_agent_trace(
            trace_id=str(record.get("trace_id", "")).strip(),
            gc_id=payload.contractor_id,
            job_id=str(record.get("job_id", "")).strip(),
            input_surface="api",
            flow="estimate",
            node_name="quote_followup",
            status="error",
            error_text=f"edit follow-up failed: {exc}",
            input_preview={"quote_id": quote_id, "approval_status": approval_status},
            output_preview={},
        )

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "approval_status": approval_status,
        "was_edited": was_edited,
        "quote_draft": final_quote,
        "quote_delta": quote_delta,
        "memory_updated": memory_updated,
        "followup_created": bool(followup_result.get("created")),
        "followup_open_item_id": str(followup_result.get("open_item_id", "")).strip(),
    }


@router.post("/quote/{quote_id}/discard")
async def discard_quote(
    quote_id: str,
    payload: QuoteDecisionRequest,
) -> dict[str, Any]:
    """Discard a generated quote and persist contractor rejection feedback."""
    try:
        record = await queries.get_quote_draft_record(quote_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")
    if str(record.get("gc_id", "")).strip() != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    quote_delta = {
        "changed": False,
        "discarded": True,
        "feedback_note": payload.feedback_note.strip(),
    }
    try:
        await queries.finalize_quote_draft_feedback(
            quote_id=quote_id,
            gc_id=payload.contractor_id,
            final_quote_draft={},
            approval_status="discarded",
            was_edited=False,
            quote_delta=quote_delta,
            feedback_note=payload.feedback_note,
            memory_updated=False,
            memory_summary="",
        )
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "quote_id": quote_id,
        "trace_id": str(record.get("trace_id", "")).strip(),
        "approval_status": "discarded",
        "was_edited": False,
        "quote_delta": quote_delta,
        "memory_updated": False,
    }


@router.get("/queue")
async def get_queue(
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return queued or pending drafts for the given contractor."""
    try:
        drafts = await queries.get_pending_drafts(contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "items": [_serialize_draft(draft) for draft in drafts],
        "count": len(drafts),
    }


@router.get("/responsibilities")
async def get_responsibilities() -> dict[str, Any]:
    """Return canonical GC responsibility definitions."""
    return {
        "items": [item.model_dump(mode="json") for item in responsibilities_catalog()],
        "count": len(responsibilities_catalog()),
    }


@router.get("/transcripts/inbox")
async def get_transcript_inbox(
    contractor_id: str = Query(..., min_length=1),
    limit: int = Query(default=25, ge=1, le=100),
) -> dict[str, Any]:
    """Return transcript inbox items that still need manual routing."""
    try:
        transcripts = await queries.list_unlinked_transcript_inbox(contractor_id, limit=limit)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "items": transcripts,
        "count": len(transcripts),
    }


@router.get("/transcripts/{transcript_id}/quote-prefill")
async def get_transcript_quote_prefill_public(
    transcript_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return quote-workspace prefill derived from one transcript."""
    try:
        prefill = await _get_transcript_quote_prefill(transcript_id, contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if prefill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transcript_id not found")

    return prefill.model_dump(mode="json")


@router.post("/transcripts/{transcript_id}/link-job")
async def link_transcript_job_public(
    transcript_id: str,
    payload: PublicLinkTranscriptJobRequest,
) -> dict[str, Any]:
    """Link a transcript inbox item to an existing job and create queue drafts."""
    try:
        result = await _link_transcript_to_job(transcript_id, payload.contractor_id, payload.job_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transcript_id not found")

    return result


@router.post("/transcripts/{transcript_id}/mark-reviewed")
async def mark_transcript_reviewed_public(
    transcript_id: str,
    payload: TranscriptActionRequest,
) -> dict[str, Any]:
    """Mark one transcript inbox item as reviewed."""
    try:
        result = await _mark_transcript_reviewed(transcript_id, payload.contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transcript_id not found")

    return result


@router.post("/transcripts/{transcript_id}/discard")
async def discard_transcript_public(
    transcript_id: str,
    payload: TranscriptActionRequest,
) -> dict[str, Any]:
    """Discard one transcript inbox item."""
    try:
        result = await _discard_transcript(transcript_id, payload.contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transcript_id not found")

    return result


@router.post("/transcripts/{transcript_id}/log-update")
async def log_transcript_update_public(
    transcript_id: str,
    payload: TranscriptActionRequest,
) -> dict[str, Any]:
    """Convert a linked transcript into the update-log + queue workflow."""
    try:
        result = await _log_transcript_as_update(transcript_id, payload.contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="transcript_id not found")

    return result


@router.post("/queue/{draft_id}/approve")
async def approve_queue_item(
    draft_id: str,
    payload: ApproveDraftRequest,
) -> dict[str, Any]:
    """Approve one draft, then hand it to the send-and-track placeholder."""
    try:
        record = await queries.get_draft_record(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found")

    record_gc_id = str(record.get("gc_id", "")).strip()
    if record_gc_id != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="draft does not belong to contractor")

    try:
        await queries.update_draft_status(draft_id, "approved")
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found after update")

    send_result = await send_and_track(updated)
    workspace_artifacts = await build_workspace_review_artifacts(
        draft=updated,
        contractor_id=payload.contractor_id,
        send_result=send_result,
    )
    confirmation: dict[str, Any] | None = None
    if _confirmation_enabled():
        caller_phone = ""
        if updated.transcript and updated.transcript.caller_phone:
            caller_phone = updated.transcript.caller_phone.strip()
        if caller_phone:
            message = _build_confirmation_message(updated)
            channel = _confirmation_channel()
            try:
                if channel == "whatsapp":
                    sid = await send_whatsapp_message(caller_phone, message)
                else:
                    sid = await send_sms_message(caller_phone, message)
                confirmation = {
                    "status": "sent",
                    "channel": channel,
                    "to": caller_phone,
                    "sid": sid,
                }
            except Exception as exc:
                confirmation = {
                    "status": "failed",
                    "channel": channel,
                    "to": caller_phone,
                    "error": str(exc)[:300],
                }
        else:
            confirmation = {
                "status": "skipped",
                "reason": "missing_caller_phone",
            }
    else:
        confirmation = {
            "status": "skipped",
            "reason": "disabled",
        }
    return {
        "trace_id": updated.trace_id,
        "draft": _serialize_draft(updated),
        "send_result": send_result,
        "workspace_artifacts": workspace_artifacts,
        "confirmation": confirmation,
    }


@router.post("/update")
async def post_update(payload: UpdateRequest) -> dict[str, Any]:
    """Run the v4 job-update path and return created draft actions."""
    try:
        state = await graph.run_update(
            raw_input=payload.input,
            gc_id=payload.contractor_id,
            from_number=f"api:{payload.contractor_id}",
            input_type="chat",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"update processing failed: {exc}",
        ) from exc

    return {
        "trace_id": state.trace_id,
        "draft_actions": [_serialize_draft(draft) for draft in state.drafts_created],
        "risk_flags": state.risk_flags,
        "errors": state.errors,
    }


@router.post("/query")
async def post_query(payload: QueryRequest) -> dict[str, Any]:
    """Run the query path and return the response or queued status."""
    try:
        state = await graph.run_query(
            raw_input=payload.input,
            gc_id=payload.contractor_id,
            from_number=f"api:{payload.contractor_id}",
            input_type="chat",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"query processing failed: {exc}",
        ) from exc

    return {
        "trace_id": state.trace_id,
        "query_response": state.query_response,
        "query_response_draft": state.query_response_draft,
        "query_queued": state.query_queued,
        "query_queue_id": state.query_queue_id,
        "classification": state.query_classification,
        "retrieved": state.query_retrieved,
        "errors": state.errors,
    }


@router.get("/briefing")
async def get_briefing(
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Generate and return the latest morning briefing for a contractor."""
    try:
        briefing = await graph.run_briefing(contractor_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"briefing generation failed: {exc}",
        ) from exc

    return {"briefing": briefing}


@router.get("/jobs")
async def get_jobs(
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return active jobs for a contractor."""
    try:
        jobs = await queries.get_active_jobs(contractor_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "jobs": [_serialize_job(job) for job in jobs],
        "count": len(jobs),
    }


@router.get("/jobs/{job_id}")
async def get_job_detail(
    job_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return one contractor job with persisted updates, calls, and audit timeline."""
    try:
        jobs = await queries.get_active_jobs(contractor_id)
        recent_updates = await queries.get_recent_update_logs(contractor_id, job_id, limit=10)
        call_history = await queries.get_job_call_history(contractor_id, job_id, limit=12)
        audit_timeline = await queries.get_job_audit_timeline(contractor_id, job_id, limit=80)
        followup_state = await queries.get_job_followup_state(contractor_id, job_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    job = next((item for item in jobs if item.id == job_id), None)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job_id not found")

    return {
        "job": _serialize_public_job(job),
        "recent_updates": recent_updates,
        "call_history": call_history,
        "audit_timeline": audit_timeline,
        "followup_state": followup_state,
    }


@router.get("/jobs/{job_id}/followup")
async def get_job_followup_public(
    job_id: str,
    contractor_id: str = Query(..., min_length=1),
) -> dict[str, Any]:
    """Return the live follow-up runtime state for one job."""
    try:
        followup_state = await queries.get_job_followup_state(contractor_id, job_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    return {
        "followup_state": followup_state,
    }


@router.post("/queue/{draft_id}/edit")
async def edit_queue_item(
    draft_id: str,
    payload: EditDraftRequest,
) -> dict[str, Any]:
    """Save edited content and keep the draft queued for final approval."""
    try:
        record = await queries.get_draft_record(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found")

    record_gc_id = str(record.get("gc_id", "")).strip()
    if record_gc_id != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="draft does not belong to contractor")

    try:
        await queries.edit_draft_content(draft_id, payload.content)
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found after update")

    return {
        "trace_id": updated.trace_id,
        "draft": _serialize_draft(updated),
    }


@router.post("/queue/{draft_id}/discard")
async def discard_queue_item(
    draft_id: str,
    payload: ApproveDraftRequest,
) -> dict[str, Any]:
    """Discard a draft and trigger the discard no-op memory hook."""
    try:
        record = await queries.get_draft_record(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found")

    record_gc_id = str(record.get("gc_id", "")).strip()
    if record_gc_id != payload.contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="draft does not belong to contractor")

    try:
        await queries.update_draft_status(draft_id, "discarded")
        updated = await queries.get_draft_by_id(draft_id)
    except DatabaseError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc

    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="draft_id not found after update")

    memory_result = await update_memory(
        AgentState(
            gc_id=payload.contractor_id,
            approval_status="discarded",
            quote_draft={"title": updated.title, "content": updated.content},
            final_quote_draft={"title": updated.title, "content": updated.content},
        )
    )
    return {
        "trace_id": updated.trace_id,
        "draft": _serialize_draft(updated),
        "memory_result": memory_result,
    }


@open_router.get("/health")
async def health() -> dict[str, str]:
    """Return lightweight service health for the public API surface."""
    return {"status": "ok", "version": APP_VERSION}


__all__ = [
    "APP_VERSION",
    "ApproveDraftRequest",
    "EditDraftRequest",
    "QuoteRequest",
    "QuoteDecisionRequest",
    "QuoteEditRequest",
    "QuoteSendRequest",
    "UpdateRequest",
    "approve_quote",
    "approve_queue_item",
    "create_quote",
    "create_quote_upload",
    "discard_quote",
    "discard_queue_item",
    "edit_quote",
    "edit_queue_item",
    "get_briefing",
    "get_jobs",
    "get_queue",
    "get_responsibilities",
    "get_quote_delivery",
    "get_quote_followup",
    "get_quote_pdf",
    "export_quote_xlsx",
    "graph",
    "health",
    "open_router",
    "queries",
    "render_quote_pdf",
    "router",
    "run_single_estimate",
    "send_quote_to_client",
    "send_and_track",
    "stop_quote_followup_route",
    "update_memory",
]
