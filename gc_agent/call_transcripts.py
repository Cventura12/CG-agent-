"""Transcript ingest orchestration for the normalized GC Agent input surface."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.input_surface import InboundInput, to_agent_state
from gc_agent.nodes.flag_risks import flag_risks
from gc_agent.nodes.parse_call_transcript import parse_call_transcript
from gc_agent.nodes.parse_update import parse_update
from gc_agent.state import (
    AgentState,
    CallTranscriptAnalysis,
    Draft,
    Job,
    TranscriptIngestResult,
    TranscriptQuotePrefill,
)
from gc_agent.telemetry import log_ingress_trace, trace_node_execution, write_agent_trace

UPDATE_LIKE_TRANSCRIPT_CLASSES = {
    "job_update",
    "reschedule",
    "complaint_or_issue",
    "followup_response",
    "vendor_or_subcontractor",
}
ESTIMATE_RELATED_TRANSCRIPT_CLASSES = {"estimate_request"}

_PARSE_CALL_TRANSCRIPT = trace_node_execution("parse_call_transcript", parse_call_transcript)
_PARSE_UPDATE = trace_node_execution("parse_update", parse_update)
_FLAG_RISKS = trace_node_execution("flag_risks", flag_risks)


def _normalize_phone(value: str) -> str:
    """Normalize phone-like values for deterministic transcript matching."""
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) > 10:
        return digits[-10:]
    return digits


def _merge_unique(items: list[str], extras: list[str]) -> list[str]:
    """Return ordered unique strings from two lists."""
    result: list[str] = []
    seen: set[str] = set()
    for raw in [*items, *extras]:
        normalized = raw.strip()
        lowered = normalized.lower()
        if not normalized or lowered in seen:
            continue
        seen.add(lowered)
        result.append(normalized)
    return result


def _string_list(value: Any) -> list[str]:
    """Normalize a JSON array into trimmed string values."""
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    for raw in value:
        item = str(raw).strip()
        if item:
            normalized.append(item)
    return normalized


def _normalize_classification(value: Any) -> str:
    """Clamp transcript classification values to the supported enum."""
    normalized = str(value or "").strip().lower()
    valid = {
        "estimate_request",
        "quote_question",
        "job_update",
        "reschedule",
        "complaint_or_issue",
        "followup_response",
        "vendor_or_subcontractor",
        "unknown",
    }
    return normalized if normalized in valid else "unknown"


def _normalize_urgency(value: Any) -> str:
    """Clamp transcript urgency values to the supported enum."""
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"low", "normal", "high"} else "normal"


def _job_name_for_id(jobs: list[Job], job_id: str) -> str:
    """Return the job display name when the active context already contains it."""
    matched = next((job for job in jobs if job.id == job_id), None)
    return matched.name if matched is not None else "Unknown Job"


def _build_review_draft(
    *,
    analysis: CallTranscriptAnalysis,
    transcript_id: str,
    state: AgentState,
    job_name: str,
    linked_quote_id: str,
) -> Draft:
    """Build one summary-first queue artifact for transcript review."""
    lines = [
        f"Transcript ID: {transcript_id}",
        f"Summary: {analysis.summary}",
        f"Intent: {analysis.classification.replace('_', ' ')}",
        f"Urgency: {analysis.urgency}",
    ]
    if linked_quote_id.strip():
        lines.append(f"Linked quote: {linked_quote_id.strip()}")
    if analysis.next_actions:
        lines.append("Next actions:")
        lines.extend(f"- {item}" for item in analysis.next_actions)
    if analysis.risks:
        lines.append("Risks:")
        lines.extend(f"- {item}" for item in analysis.risks)
    if analysis.missing_information:
        lines.append("Missing information:")
        lines.extend(f"- {item}" for item in analysis.missing_information)
    excerpt = state.raw_input.strip()
    if excerpt:
        lines.append("Transcript:")
        lines.append(excerpt[:1200] + ("..." if len(excerpt) > 1200 else ""))

    return Draft(
        id=uuid4().hex,
        job_id=state.active_job_id,
        job_name=job_name,
        type="transcript-review",
        title="Call transcript review",
        content="\n".join(lines).strip(),
        why=(
            f"Transcript classified as {analysis.classification.replace('_', ' ')} "
            f"with {analysis.urgency} urgency."
        ),
        status="queued",
        trace_id=state.trace_id,
    )


async def _resolve_context(
    payload: InboundInput,
    gc_id: str,
    jobs: list[Job],
) -> tuple[str, str, str, str]:
    """Resolve linked quote/job context from explicit IDs or recent quote delivery history."""
    linked_quote_id = ""
    linked_job_id = ""
    caller_name = payload.caller_name.strip()
    match_source = "unlinked"

    if payload.quote_id.strip():
        record = await queries.get_quote_draft_record(payload.quote_id.strip())
        if record is not None and str(record.get("gc_id", "")).strip() == gc_id:
            linked_quote_id = str(record.get("id", "")).strip()
            linked_job_id = str(record.get("job_id", "")).strip()
            match_source = "explicit_quote"

    if not linked_job_id and payload.job_id.strip():
        explicit_job = next((job for job in jobs if job.id == payload.job_id.strip()), None)
        if explicit_job is not None:
            linked_job_id = explicit_job.id
            match_source = "explicit_job"

    if not linked_job_id and not linked_quote_id:
        normalized_phone = _normalize_phone(payload.from_number.strip())
        if normalized_phone:
            recent_match = await queries.find_recent_quote_delivery_match(gc_id, normalized_phone)
            if recent_match is not None:
                linked_quote_id = str(recent_match.get("quote_id", "")).strip()
                linked_job_id = str(recent_match.get("job_id", "")).strip()
                caller_name = caller_name or str(recent_match.get("recipient_name", "")).strip()
                match_source = "recent_quote_delivery"

    return linked_job_id, linked_quote_id, caller_name, match_source


def _analysis_fallback(error_text: str) -> CallTranscriptAnalysis:
    """Return a safe manual-review fallback when transcript parsing fails."""
    return CallTranscriptAnalysis(
        classification="unknown",
        confidence=None,
        summary="Manual transcript review needed.",
        urgency="normal",
        risks=[],
        missing_information=["Transcript classification failed"],
        next_actions=["Review transcript and decide next action"],
        job_type=None,
        scope_items=[],
        customer_questions=[],
        insurance_involved=None,
        scheduling_notes=[],
    )


def _transcript_metadata(
    payload: InboundInput,
    *,
    match_source: str,
    processing_error: str = "",
    created_draft_ids: list[str] | None = None,
) -> dict[str, Any]:
    """Build one consistent transcript metadata payload for persistence."""
    metadata = dict(payload.metadata)
    metadata["ingest_intent"] = payload.intent
    metadata["match_source"] = match_source
    if processing_error.strip():
        metadata["processing_error"] = processing_error.strip()
    if created_draft_ids:
        metadata["created_draft_ids"] = list(created_draft_ids)
    return metadata


def _analysis_to_extracted_json(
    analysis: CallTranscriptAnalysis,
    *,
    parsed_update_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the stored extracted_json payload for transcript records."""
    extracted = {
        "urgency": analysis.urgency,
        "job_type": analysis.job_type,
        "scope_items": list(analysis.scope_items),
        "customer_questions": list(analysis.customer_questions),
        "insurance_involved": analysis.insurance_involved,
        "scheduling_notes": list(analysis.scheduling_notes),
        "missing_information": list(analysis.missing_information),
    }
    if parsed_update_payload:
        extracted["parsed_update"] = parsed_update_payload
    return extracted


def _record_trace_event(
    *,
    trace_id: str,
    gc_id: str,
    job_id: str,
    node_name: str,
    status: str,
    error_text: str = "",
    input_preview: dict[str, Any] | None = None,
    output_preview: dict[str, Any] | None = None,
) -> None:
    """Write one operational trace row for transcript-only branches."""
    write_agent_trace(
        trace_id=trace_id,
        gc_id=gc_id,
        job_id=job_id,
        input_surface="call_transcript",
        flow="transcript",
        node_name=node_name,
        status=status,
        error_text=error_text or None,
        input_preview=input_preview or {},
        output_preview=output_preview or {},
    )


def _build_ingest_result(
    *,
    trace_id: str,
    transcript_id: str,
    analysis: CallTranscriptAnalysis,
    linked_job_id: str,
    linked_quote_id: str,
    created_draft_ids: list[str],
    errors: list[str],
) -> TranscriptIngestResult:
    """Return one typed transcript ingest result."""
    return TranscriptIngestResult(
        trace_id=trace_id,
        transcript_id=transcript_id,
        summary=analysis.summary or "Manual transcript review needed.",
        classification=analysis.classification,
        confidence=analysis.confidence,
        urgency=analysis.urgency,
        risk_flags=list(analysis.risks),
        missing_information=list(analysis.missing_information),
        next_actions=list(analysis.next_actions),
        active_job_id=linked_job_id.strip(),
        linked_quote_id=linked_quote_id.strip(),
        created_draft_ids=list(created_draft_ids),
        errors=[item for item in errors if str(item).strip()],
    )


def _analysis_from_record(record: dict[str, Any]) -> CallTranscriptAnalysis:
    """Rehydrate a safe transcript analysis view from one persisted record."""
    extracted_json = record.get("extracted_json") if isinstance(record.get("extracted_json"), dict) else {}
    return CallTranscriptAnalysis(
        classification=_normalize_classification(record.get("classification")),
        confidence=record.get("confidence") if isinstance(record.get("confidence"), (int, float)) else None,
        summary=str(record.get("summary", "")).strip() or "Manual transcript review needed.",
        urgency=_normalize_urgency(extracted_json.get("urgency")),
        risks=_string_list(record.get("risk_flags")),
        missing_information=_string_list(extracted_json.get("missing_information")),
        next_actions=_string_list(record.get("recommended_actions")),
        job_type=str(extracted_json.get("job_type", "")).strip() or None,
        scope_items=_string_list(extracted_json.get("scope_items")),
        customer_questions=_string_list(extracted_json.get("customer_questions")),
        insurance_involved=(
            extracted_json.get("insurance_involved")
            if isinstance(extracted_json.get("insurance_involved"), bool)
            else None
        ),
        scheduling_notes=_string_list(extracted_json.get("scheduling_notes")),
    )


def _build_quote_input(prefill: TranscriptQuotePrefill, transcript_text: str) -> str:
    """Convert transcript analysis into the existing note-driven quote input format."""
    lines: list[str] = [
        "Call transcript estimate request",
        f"Summary: {prefill.summary or 'Transcript captured for estimate review.'}",
    ]
    if prefill.customer_name:
        lines.append(f"Customer: {prefill.customer_name}")
    if prefill.caller_phone:
        lines.append(f"Caller phone: {prefill.caller_phone}")
    if prefill.job_type:
        lines.append(f"Job type: {prefill.job_type}")
    if prefill.urgency:
        lines.append(f"Urgency: {prefill.urgency}")
    if prefill.insurance_involved is True:
        lines.append("Insurance involved: yes")
    elif prefill.insurance_involved is False:
        lines.append("Insurance involved: no")

    if prefill.scope_items:
        lines.append("Scope items:")
        lines.extend(f"- {item}" for item in prefill.scope_items)

    if prefill.customer_questions:
        lines.append("Customer questions:")
        lines.extend(f"- {item}" for item in prefill.customer_questions)

    if prefill.scheduling_notes:
        lines.append("Scheduling notes:")
        lines.extend(f"- {item}" for item in prefill.scheduling_notes)

    if prefill.missing_information:
        lines.append("Missing information to confirm:")
        lines.extend(f"- {item}" for item in prefill.missing_information)

    if prefill.recommended_actions:
        lines.append("Recommended next actions:")
        lines.extend(f"- {item}" for item in prefill.recommended_actions)

    excerpt = transcript_text.strip()
    if excerpt:
        lines.append("Transcript excerpt:")
        lines.append(excerpt[:697].rstrip() + "..." if len(excerpt) > 700 else excerpt)

    lines.append(
        "Use this transcript as field notes and surface assumptions or clarification questions instead of inventing missing details."
    )
    return "\n".join(line for line in lines if line.strip()).strip()


async def get_transcript_quote_prefill(transcript_id: str, gc_id: str) -> TranscriptQuotePrefill | None:
    """Return a quote-workspace prefill payload for one persisted transcript."""
    record = await queries.get_call_transcript_by_id(transcript_id, gc_id)
    if record is None:
        return None

    extracted_json = record.get("extracted_json") if isinstance(record.get("extracted_json"), dict) else {}
    classification = str(record.get("classification", "")).strip() or "unknown"
    customer_name = str(record.get("caller_name", "")).strip()
    prefill = TranscriptQuotePrefill(
        transcript_id=str(record.get("id", "")).strip(),
        trace_id=str(record.get("trace_id", "")).strip(),
        classification=_normalize_classification(classification),
        confidence=record.get("confidence") if isinstance(record.get("confidence"), (int, float)) else None,
        summary=str(record.get("summary", "")).strip() or "Manual transcript review needed.",
        urgency=_normalize_urgency(extracted_json.get("urgency")),
        caller_name=customer_name,
        caller_phone=str(record.get("caller_phone", "")).strip(),
        linked_job_id=str(record.get("job_id", "")).strip(),
        linked_quote_id=str(record.get("quote_id", "")).strip(),
        customer_name=customer_name,
        job_type=str(extracted_json.get("job_type", "")).strip(),
        scope_items=_string_list(extracted_json.get("scope_items")),
        customer_questions=_string_list(extracted_json.get("customer_questions")),
        insurance_involved=(
            extracted_json.get("insurance_involved")
            if isinstance(extracted_json.get("insurance_involved"), bool)
            else None
        ),
        missing_information=_string_list(extracted_json.get("missing_information")),
        recommended_actions=_string_list(record.get("recommended_actions")),
        scheduling_notes=_string_list(extracted_json.get("scheduling_notes")),
        estimate_related=classification in ESTIMATE_RELATED_TRANSCRIPT_CLASSES,
    )
    return prefill.model_copy(update={"quote_input": _build_quote_input(prefill, str(record.get("transcript_text", "")))})


async def process_call_transcript(payload: InboundInput, gc_id: str, trace_id: str) -> dict[str, Any]:
    """Persist, classify, and queue one transcript through the normalized ingest path."""
    transcript_text = payload.raw_text.strip()
    if not transcript_text:
        raise ValueError("raw_text is required for call_transcript ingest")

    jobs = await queries.get_active_jobs(gc_id)
    linked_job_id, linked_quote_id, caller_name, match_source = await _resolve_context(payload, gc_id, jobs)

    state = to_agent_state(payload, trace_id=trace_id, gc_id=gc_id).model_copy(
        update={
            "mode": "transcript",
            "raw_input": transcript_text,
            "gc_id": gc_id,
            "jobs": jobs,
            "active_job_id": linked_job_id,
            "trace_id": trace_id,
            "thread_id": payload.external_id.strip() or trace_id,
            "from_number": payload.from_number.strip(),
        }
    )

    log_ingress_trace(
        state,
        input_surface="call_transcript",
        payload=payload.model_dump(mode="json"),
    )

    existing_record = await queries.find_existing_call_transcript_for_ingest(
        gc_id,
        source=payload.surface,
        call_id=payload.call_id,
        trace_id=trace_id,
    )
    if existing_record is not None:
        existing_job_id = str(existing_record.get("job_id", "")).strip() or linked_job_id
        existing_quote_id = str(existing_record.get("quote_id", "")).strip() or linked_quote_id
        pending_updates: dict[str, Any] = {}
        if linked_job_id and not str(existing_record.get("job_id", "")).strip():
            pending_updates["job_id"] = linked_job_id
        if linked_quote_id and not str(existing_record.get("quote_id", "")).strip():
            pending_updates["quote_id"] = linked_quote_id
        if caller_name and not str(existing_record.get("caller_name", "")).strip():
            pending_updates["caller_name"] = caller_name
        if trace_id and not str(existing_record.get("trace_id", "")).strip():
            pending_updates["trace_id"] = trace_id
        if payload.recording_url.strip() and not str(existing_record.get("recording_url", "")).strip():
            pending_updates["recording_url"] = payload.recording_url.strip()
        if payload.duration_seconds is not None and existing_record.get("duration_seconds") is None:
            pending_updates["duration_seconds"] = payload.duration_seconds
        if pending_updates:
            await queries.update_call_transcript(
                str(existing_record.get("id", "")).strip(),
                gc_id,
                **pending_updates,
            )
            existing_record = (
                await queries.get_call_transcript_by_id(str(existing_record.get("id", "")).strip(), gc_id)
                or existing_record
            )

        created_draft_ids = await queries.get_related_transcript_review_draft_ids(
            gc_id,
            job_id=existing_job_id,
            trace_id=str(existing_record.get("trace_id", "")).strip() or trace_id,
            transcript_id=str(existing_record.get("id", "")).strip(),
        )
        if existing_job_id and not created_draft_ids:
            analysis = _analysis_from_record(existing_record)
            review_draft = _build_review_draft(
                analysis=analysis,
                transcript_id=str(existing_record.get("id", "")).strip(),
                state=state.model_copy(update={"active_job_id": existing_job_id}),
                job_name=_job_name_for_id(jobs, existing_job_id),
                linked_quote_id=existing_quote_id,
            )
            try:
                await queries.insert_drafts([review_draft], gc_id)
                created_draft_ids = [review_draft.id]
                await queries.update_call_transcript(
                    str(existing_record.get("id", "")).strip(),
                    gc_id,
                    metadata=_transcript_metadata(
                        payload,
                        match_source=match_source,
                        created_draft_ids=created_draft_ids,
                    ),
                )
            except DatabaseError as exc:
                _record_trace_event(
                    trace_id=trace_id,
                    gc_id=gc_id,
                    job_id=existing_job_id,
                    node_name="transcript_idempotency_queue_draft",
                    status="error",
                    error_text=str(exc),
                    input_preview={"transcript_id": str(existing_record.get("id", "")).strip()},
                )
                return _build_ingest_result(
                    trace_id=trace_id,
                    transcript_id=str(existing_record.get("id", "")).strip(),
                    analysis=analysis,
                    linked_job_id=existing_job_id,
                    linked_quote_id=existing_quote_id,
                    created_draft_ids=[],
                    errors=[f"queue draft creation failed: {exc}"],
                ).model_dump(mode="json")
        _record_trace_event(
            trace_id=trace_id,
            gc_id=gc_id,
            job_id=existing_job_id,
            node_name="transcript_idempotency",
            status="ok",
            input_preview={"call_id": payload.call_id, "source": payload.surface},
            output_preview={"transcript_id": str(existing_record.get("id", "")).strip(), "reused": True},
        )
        return _build_ingest_result(
            trace_id=trace_id,
            transcript_id=str(existing_record.get("id", "")).strip(),
            analysis=_analysis_from_record(existing_record),
            linked_job_id=existing_job_id,
            linked_quote_id=existing_quote_id,
            created_draft_ids=created_draft_ids,
            errors=[],
        ).model_dump(mode="json")

    transcript_id = await queries.insert_call_transcript(
        gc_id=gc_id,
        source=payload.surface,
        transcript_text=transcript_text,
        job_id=linked_job_id,
        quote_id=linked_quote_id,
        call_id=payload.call_id,
        provider=payload.provider,
        caller_phone=payload.from_number,
        caller_name=caller_name,
        started_at=payload.started_at.isoformat() if payload.started_at else None,
        duration_seconds=payload.duration_seconds,
        recording_url=payload.recording_url,
        trace_id=trace_id,
        metadata=_transcript_metadata(payload, match_source=match_source),
    )

    errors: list[str] = []
    parsed_update_payload: dict[str, Any] | None = None

    try:
        analysis_result = await _PARSE_CALL_TRANSCRIPT(state)
        analysis = analysis_result["transcript_analysis"]
        if not isinstance(analysis, CallTranscriptAnalysis):
            analysis = CallTranscriptAnalysis.model_validate(analysis)
    except Exception as exc:
        errors.append(f"parse_call_transcript failed: {exc}")
        analysis = _analysis_fallback(str(exc))
        await queries.update_call_transcript(
            transcript_id,
            gc_id,
            summary=analysis.summary,
            classification=analysis.classification,
            confidence=analysis.confidence,
            extracted_json=_analysis_to_extracted_json(analysis),
            risk_flags=analysis.risks,
            recommended_actions=analysis.next_actions,
            trace_id=trace_id,
            metadata=_transcript_metadata(
                payload,
                match_source=match_source,
                processing_error=str(exc),
            ),
        )
    else:
        if analysis.classification in UPDATE_LIKE_TRANSCRIPT_CLASSES and linked_job_id:
            update_state = state.model_copy(update={"mode": "update"})
            parsed_intent = None
            try:
                parse_result = await _PARSE_UPDATE(update_state)
                parsed_intent = parse_result.get("parsed_intent")
                if parsed_intent is not None:
                    parsed_update_payload = parsed_intent.model_dump(mode="json")
                parse_errors = [str(item).strip() for item in parse_result.get("errors", []) if str(item).strip()]
                errors.extend(parse_errors)
            except Exception as exc:
                errors.append(f"parse_update failed: {exc}")
                _record_trace_event(
                    trace_id=trace_id,
                    gc_id=gc_id,
                    job_id=linked_job_id,
                    node_name="transcript_parse_update",
                    status="error",
                    error_text=str(exc),
                    input_preview={"transcript_id": transcript_id},
                )

            if parsed_intent is not None:
                risk_state = update_state.model_copy(update={"parsed_intent": parsed_intent})
                try:
                    risk_result = await _FLAG_RISKS(risk_state)
                    update_risks = [str(item).strip() for item in risk_result.get("risk_flags", []) if str(item).strip()]
                    analysis.risks = _merge_unique(list(analysis.risks), update_risks)
                    risk_errors = [str(item).strip() for item in risk_result.get("errors", []) if str(item).strip()]
                    errors.extend(risk_errors)
                except Exception as exc:
                    errors.append(f"flag_risks failed: {exc}")
                    _record_trace_event(
                        trace_id=trace_id,
                        gc_id=gc_id,
                        job_id=linked_job_id,
                        node_name="transcript_flag_risks",
                        status="error",
                        error_text=str(exc),
                        input_preview={"transcript_id": transcript_id},
                    )

        await queries.update_call_transcript(
            transcript_id,
            gc_id,
            job_id=linked_job_id,
            quote_id=linked_quote_id,
            summary=analysis.summary,
            classification=analysis.classification,
            confidence=analysis.confidence,
            extracted_json=_analysis_to_extracted_json(analysis, parsed_update_payload=parsed_update_payload),
            risk_flags=analysis.risks,
            recommended_actions=analysis.next_actions,
            trace_id=trace_id,
            caller_name=caller_name,
            metadata=_transcript_metadata(payload, match_source=match_source),
        )

    created_draft_ids: list[str] = []
    if linked_job_id:
        job_name = _job_name_for_id(jobs, linked_job_id)
        review_draft = _build_review_draft(
            analysis=analysis,
            transcript_id=transcript_id,
            state=state,
            job_name=job_name,
            linked_quote_id=linked_quote_id,
        )
        try:
            await queries.insert_drafts([review_draft], gc_id)
            created_draft_ids.append(review_draft.id)
        except DatabaseError as exc:
            errors.append(f"queue draft creation failed: {exc}")
            _record_trace_event(
                trace_id=trace_id,
                gc_id=gc_id,
                job_id=linked_job_id,
                node_name="transcript_queue_draft",
                status="error",
                error_text=str(exc),
                input_preview={"transcript_id": transcript_id, "job_id": linked_job_id},
            )

    if created_draft_ids:
        await queries.update_call_transcript(
            transcript_id,
            gc_id,
            metadata=_transcript_metadata(
                payload,
                match_source=match_source,
                created_draft_ids=created_draft_ids,
            ),
        )

    return _build_ingest_result(
        trace_id=trace_id,
        transcript_id=transcript_id,
        analysis=analysis,
        linked_job_id=linked_job_id,
        linked_quote_id=linked_quote_id,
        created_draft_ids=created_draft_ids,
        errors=errors,
    ).model_dump(mode="json")


__all__ = ["process_call_transcript", "get_transcript_quote_prefill"]
