"""Database query helpers for GC Agent persistence operations."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from uuid import uuid4

from gc_agent.db.client import get_client
from gc_agent.state import CallTranscriptRecord, Draft, DraftTranscriptContext, Job, OpenItem, ParsedIntent


class DatabaseError(RuntimeError):
    """Raised when a Supabase operation fails with contextual details."""


CALL_TRANSCRIPT_SELECT_COLUMNS = (
    "id,gc_id,job_id,quote_id,call_id,source,provider,caller_phone,caller_name,"
    "started_at,duration_seconds,recording_url,transcript_text,summary,classification,"
    "confidence,extracted_json,risk_flags,recommended_actions,trace_id,metadata,"
    "created_at,updated_at"
)


def _utcnow_iso() -> str:
    """Return timezone-aware UTC timestamp as ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def _parse_datetime(value: Any) -> Optional[datetime]:
    """Parse an ISO datetime string into a datetime object when possible."""
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None

    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"

    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def _to_float(value: Any) -> float:
    """Normalize numeric-like inputs to float values."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return 0.0
    return 0.0


def _to_int(value: Any, default: int = 0) -> int:
    """Normalize integer-like inputs for counters and summary payloads."""
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return default
        try:
            return int(candidate)
        except ValueError:
            return default
    return default


def _optional_int(value: Any) -> int | None:
    """Normalize integer-like inputs while preserving null values."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return _to_int(value)


def _optional_float(value: Any) -> float | None:
    """Normalize numeric-like inputs while preserving null values."""
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        candidate = value.strip().replace(",", "").replace("$", "")
        try:
            return float(candidate)
        except ValueError:
            return None
    return None


def _normalize_transcript_confidence(value: Any) -> float | None:
    """Normalize transcript confidence values onto a stable 0-100 scale."""
    numeric = _optional_float(value)
    if numeric is None:
        return None
    if 0 < numeric <= 1:
        numeric *= 100
    if numeric < 0:
        numeric = 0.0
    if numeric > 100:
        numeric = 100.0
    return round(numeric, 2)


def _compute_days_silent(created_at: Any, fallback: Any = 0) -> int:
    """Compute days_silent from created_at, falling back to stored value when needed."""
    created_dt = _parse_datetime(created_at)
    if created_dt is None:
        try:
            return max(int(fallback), 0)
        except Exception:
            return 0

    now = datetime.now(timezone.utc)
    if created_dt.tzinfo is None:
        created_dt = created_dt.replace(tzinfo=timezone.utc)
    return max((now - created_dt).days, 0)


def _extract_job_name(jobs_ref: Any) -> str:
    """Extract job name from nested relation payload returned by Supabase."""
    if isinstance(jobs_ref, dict):
        return str(jobs_ref.get("name", "")).strip()
    if isinstance(jobs_ref, list) and jobs_ref and isinstance(jobs_ref[0], dict):
        return str(jobs_ref[0].get("name", "")).strip()
    return ""


def _extract_quote_id_from_description(description: Any) -> str:
    """Extract quote marker from legacy follow-up descriptions when quote_id is absent."""
    if not isinstance(description, str) or not description.strip():
        return ""
    marker = "Quote ID:"
    if marker not in description:
        return ""
    tail = description.split(marker, 1)[1].strip()
    return tail.split()[0].strip(".,;:") if tail else ""


def _build_open_item(row: dict[str, Any]) -> OpenItem:
    """Convert open_items table row to OpenItem model."""
    payload = {
        "id": str(row.get("id", "")),
        "job_id": str(row.get("job_id", "")),
        "type": row.get("type", "follow-up"),
        "description": str(row.get("description", "")).strip(),
        "owner": str(row.get("owner", "")).strip() or "GC",
        "status": row.get("status", "open"),
        "days_silent": _compute_days_silent(row.get("created_at"), row.get("days_silent", 0)),
        "due_date": row.get("due_date"),
        "trace_id": str(row.get("trace_id", "")).strip(),
    }
    return OpenItem.model_validate(payload)


def _build_job(row: dict[str, Any]) -> Job:
    """Convert jobs table row with nested open_items into Job model."""
    nested_open_items = row.get("open_items") or []
    open_items = [
        _build_open_item(item)
        for item in nested_open_items
        if isinstance(item, dict) and str(item.get("status", "")).strip().lower() != "resolved"
    ]

    payload = {
        "id": str(row.get("id", "")),
        "name": str(row.get("name", "")).strip(),
        "type": str(row.get("type", "")).strip(),
        "status": row.get("status", "active"),
        "address": str(row.get("address", "")).strip(),
        "contract_value": int(row.get("contract_value") or 0),
        "contract_type": str(row.get("contract_type", "")).strip(),
        "est_completion": str(row.get("est_completion") or ""),
        "notes": str(row.get("notes", "")),
        "last_updated": str(row.get("last_updated") or ""),
        "open_items": open_items,
    }
    return Job.model_validate(payload)


def _build_draft(row: dict[str, Any]) -> Draft:
    """Convert draft_queue row with nested job relation into a Draft model."""
    job_name = _extract_job_name(row.get("jobs")) or "Unknown Job"
    payload = {
        "id": str(row.get("id", "")),
        "job_id": str(row.get("job_id", "")),
        "job_name": job_name,
        "type": row.get("type", "follow-up"),
        "title": str(row.get("title", "")),
        "original_content": str(row.get("original_content", "")).strip() or None,
        "content": str(row.get("content", "")),
        "why": str(row.get("why", "")),
        "status": row.get("status", "queued"),
        "was_edited": bool(row.get("was_edited", False)),
        "approval_status": row.get("approval_status"),
        "approval_recorded_at": row.get("approval_recorded_at"),
        "created_at": row.get("created_at") or _utcnow_iso(),
        "trace_id": str(row.get("trace_id", "")).strip(),
    }
    return Draft.model_validate(payload)


def _build_call_transcript_record(row: dict[str, Any]) -> CallTranscriptRecord:
    """Convert a call_transcripts row into a normalized transcript record."""
    transcript_text = str(row.get("transcript_text", "")).strip()
    summary = str(row.get("summary", "")).strip()
    payload = {
        "id": str(row.get("id", "")).strip(),
        "gc_id": str(row.get("gc_id", "")).strip(),
        "job_id": str(row.get("job_id", "")).strip(),
        "quote_id": str(row.get("quote_id", "")).strip(),
        "call_id": str(row.get("call_id", "")).strip(),
        "source": str(row.get("source", "")).strip() or "call_transcript",
        "provider": str(row.get("provider", "")).strip(),
        "caller_phone": str(row.get("caller_phone", "")).strip(),
        "caller_name": str(row.get("caller_name", "")).strip(),
        "started_at": str(row.get("started_at", "")).strip() or None,
        "duration_seconds": _optional_int(row.get("duration_seconds")),
        "recording_url": str(row.get("recording_url", "")).strip(),
        "transcript_text": transcript_text,
        "summary": summary or _transcript_summary_preview("", transcript_text, max_chars=180),
        "classification": _normalize_transcript_classification(row.get("classification")),
        "confidence": _normalize_transcript_confidence(row.get("confidence")),
        "extracted_json": row.get("extracted_json") if isinstance(row.get("extracted_json"), dict) else {},
        "risk_flags": _string_list(row.get("risk_flags")),
        "recommended_actions": _string_list(row.get("recommended_actions")),
        "trace_id": str(row.get("trace_id", "")).strip(),
        "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
        "created_at": str(row.get("created_at", "")).strip() or None,
        "updated_at": str(row.get("updated_at", "")).strip() or None,
    }
    return CallTranscriptRecord.model_validate(payload)


def _extract_transcript_id_from_draft_content(content: str) -> str:
    """Extract the embedded transcript ID from transcript-review draft content."""
    if not isinstance(content, str):
        return ""
    marker = "Transcript ID:"
    if marker not in content:
        return ""
    tail = content.split(marker, 1)[1].strip()
    return tail.splitlines()[0].strip(" .,:;") if tail else ""


def _string_list(value: Any) -> list[str]:
    """Normalize loosely-typed JSON arrays into trimmed string lists."""
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for raw in value:
        normalized = str(raw).strip()
        if normalized:
            items.append(normalized)
    return items


def _normalize_transcript_classification(value: Any) -> str:
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


def _normalize_transcript_urgency(value: Any) -> str:
    """Clamp transcript urgency values to the supported enum."""
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"low", "normal", "high"} else "normal"


def _build_draft_transcript_context(row: dict[str, Any]) -> DraftTranscriptContext:
    """Build queue-friendly transcript metadata from a transcript record row."""
    extracted_json = row.get("extracted_json") if isinstance(row.get("extracted_json"), dict) else {}
    caller_name = str(row.get("caller_name", "")).strip()
    caller_phone = str(row.get("caller_phone", "")).strip()
    source = str(row.get("source", "")).strip() or "call_transcript"
    source_label = source.replace("_", " ").strip().title() if source else "Call transcript"
    if caller_name and caller_phone:
        caller_label = f"{caller_name} - {caller_phone}"
    else:
        caller_label = caller_name or caller_phone or source_label

    payload = {
        "transcript_id": str(row.get("id", "")).strip(),
        "source": source,
        "provider": str(row.get("provider", "")).strip(),
        "caller_label": caller_label,
        "caller_phone": caller_phone,
        "summary": _transcript_summary_preview(
            str(row.get("summary", "")).strip(),
            str(row.get("transcript_text", "")).strip(),
        ) or "Manual transcript review needed.",
        "classification": _normalize_transcript_classification(row.get("classification")),
        "urgency": _normalize_transcript_urgency(extracted_json.get("urgency")),
        "confidence": _normalize_transcript_confidence(row.get("confidence")),
        "recommended_actions": _string_list(row.get("recommended_actions")),
        "risk_flags": _string_list(row.get("risk_flags")),
        "missing_information": _string_list(extracted_json.get("missing_information")),
        "transcript_text": str(row.get("transcript_text", "")).strip(),
        "linked_quote_id": str(row.get("quote_id", "")).strip(),
        "recording_url": str(row.get("recording_url", "")).strip(),
        "started_at": str(row.get("started_at", "")).strip() or None,
        "duration_seconds": _optional_int(row.get("duration_seconds")),
    }
    return DraftTranscriptContext.model_validate(payload)


def _transcript_summary_preview(summary: str, transcript_text: str, max_chars: int = 220) -> str:
    """Return a compact contractor-facing transcript summary fallback."""
    candidate = summary.strip() or transcript_text.strip()
    if len(candidate) <= max_chars:
        return candidate
    return candidate[: max_chars - 3].rstrip() + "..."


async def _attach_transcript_context_to_drafts(drafts: list[Draft], gc_id: str) -> list[Draft]:
    """Hydrate transcript-review drafts with transcript metadata from call_transcripts."""
    if not drafts:
        return drafts

    transcript_trace_ids = {
        draft.trace_id.strip()
        for draft in drafts
        if draft.type == "transcript-review" and draft.trace_id.strip()
    }
    transcript_ids = {
        _extract_transcript_id_from_draft_content(draft.content)
        for draft in drafts
        if draft.type == "transcript-review"
    }
    transcript_ids.discard("")
    if not transcript_trace_ids and not transcript_ids:
        return drafts

    client = get_client()
    gc_value = gc_id.strip()
    if not gc_value:
        return drafts

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("call_transcripts")
            .select(CALL_TRANSCRIPT_SELECT_COLUMNS)
            .eq("gc_id", gc_value)
            .order("created_at", desc=True)
            .limit(max(100, len(transcript_trace_ids) * 10, len(transcript_ids) * 10))
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("attach_transcript_context_to_drafts", _query)
    by_trace_id: dict[str, DraftTranscriptContext] = {}
    by_transcript_id: dict[str, DraftTranscriptContext] = {}

    for row in rows:
        trace_id = str(row.get("trace_id", "")).strip()
        transcript_id = str(row.get("id", "")).strip()
        if trace_id not in transcript_trace_ids and transcript_id not in transcript_ids:
            continue
        context = _build_draft_transcript_context(row)
        if trace_id and trace_id not in by_trace_id:
            by_trace_id[trace_id] = context
        if transcript_id and transcript_id not in by_transcript_id:
            by_transcript_id[transcript_id] = context
        if len(by_trace_id) >= len(transcript_trace_ids) and len(by_transcript_id) >= len(transcript_ids):
            break

    enriched: list[Draft] = []
    for draft in drafts:
        if draft.type != "transcript-review":
            enriched.append(draft)
            continue
        transcript_id = _extract_transcript_id_from_draft_content(draft.content)
        context = None
        if draft.trace_id.strip():
            context = by_trace_id.get(draft.trace_id.strip())
        if context is None and transcript_id:
            context = by_transcript_id.get(transcript_id)
        enriched.append(draft.model_copy(update={"transcript": context}))

    return enriched


async def find_existing_call_transcript_for_ingest(
    gc_id: str,
    *,
    source: str = "",
    call_id: str = "",
    trace_id: str = "",
) -> Optional[dict[str, Any]]:
    """Find an already persisted transcript record for replay-safe ingest."""
    client = get_client()
    gc_value = gc_id.strip()
    source_value = source.strip()
    call_value = call_id.strip()
    trace_value = trace_id.strip()
    if not gc_value:
        return None
    if not call_value and not trace_value:
        return None

    def _query() -> list[dict[str, Any]]:
        if call_value:
            query = (
                client.table("call_transcripts")
                .select(CALL_TRANSCRIPT_SELECT_COLUMNS)
                .eq("gc_id", gc_value)
                .eq("call_id", call_value)
                .order("created_at", desc=True)
                .limit(1)
            )
            if source_value:
                query = query.eq("source", source_value)
            response = query.execute()
            rows = list(response.data or [])
            if rows:
                return rows

        if trace_value:
            query = (
                client.table("call_transcripts")
                .select(CALL_TRANSCRIPT_SELECT_COLUMNS)
                .eq("gc_id", gc_value)
                .eq("trace_id", trace_value)
                .order("created_at", desc=True)
                .limit(1)
            )
            if source_value:
                query = query.eq("source", source_value)
            response = query.execute()
            return list(response.data or [])

        return []

    rows = await _run_db("find_existing_call_transcript_for_ingest", _query)
    if not rows:
        return None
    return _build_call_transcript_record(rows[0]).model_dump(mode="json")


async def get_related_transcript_review_draft_ids(
    gc_id: str,
    *,
    job_id: str = "",
    trace_id: str = "",
    transcript_id: str = "",
    limit: int = 12,
) -> list[str]:
    """Return transcript-review draft ids related by trace id or embedded transcript id."""
    client = get_client()
    gc_value = gc_id.strip()
    job_value = job_id.strip()
    trace_value = trace_id.strip()
    transcript_value = transcript_id.strip()
    if not gc_value or (not trace_value and not transcript_value):
        return []

    def _query() -> list[dict[str, Any]]:
        query = (
            client.table("draft_queue")
            .select("id,trace_id,content")
            .eq("gc_id", gc_value)
            .eq("type", "transcript-review")
            .order("created_at", desc=True)
            .limit(max(int(limit or 12), 1))
        )
        if job_value:
            query = query.eq("job_id", job_value)
        response = query.execute()
        return list(response.data or [])

    rows = await _run_db("get_related_transcript_review_draft_ids", _query)
    related_ids: list[str] = []
    for row in rows:
        draft_id = str(row.get("id", "")).strip()
        if not draft_id:
            continue
        row_trace_id = str(row.get("trace_id", "")).strip()
        row_transcript_id = _extract_transcript_id_from_draft_content(str(row.get("content", "")))
        if trace_value and row_trace_id == trace_value:
            related_ids.append(draft_id)
            continue
        if transcript_value and row_transcript_id == transcript_value:
            related_ids.append(draft_id)
    return related_ids


def _approval_tracking_fields(existing_row: dict[str, Any] | None, status: str) -> dict[str, Any]:
    """Return approval-tracking fields for final queue actions."""
    normalized_status = str(status).strip().lower()
    if normalized_status not in {"approved", "discarded"}:
        return {}

    if normalized_status == "approved":
        was_edited = bool((existing_row or {}).get("was_edited", False))
        approval_status = "approved_with_edit" if was_edited else "approved_without_edit"
    else:
        approval_status = "discarded"

    return {
        "approval_status": approval_status,
        "approval_recorded_at": _utcnow_iso(),
    }


_UNSET = object()


async def _run_db(operation: str, fn: Callable[[], Any]) -> Any:
    """Execute a blocking Supabase operation in a worker thread."""
    try:
        return await asyncio.to_thread(fn)
    except Exception as exc:
        raise DatabaseError(f"{operation} failed: {exc}") from exc


def _is_missing_column_error(exc: Exception) -> bool:
    """Return True when a DB exception indicates missing columns on older schemas."""
    text = str(exc).lower()
    if "42703" in text or "pgrst204" in text:
        return True
    return "column" in text and ("does not exist" in text or "could not find" in text)


async def get_active_jobs(gc_id: str) -> list[Job]:
    """Fetch active jobs and nested open items for a GC account."""
    client = get_client()

    def _query(include_trace_id: bool = True) -> list[dict[str, Any]]:
        open_item_columns = (
            "id,job_id,type,description,owner,status,days_silent,due_date,created_at,trace_id"
            if include_trace_id
            else "id,job_id,type,description,owner,status,days_silent,due_date,created_at"
        )
        response = (
            client.table("jobs")
            .select(
                "id,name,type,status,address,contract_value,contract_type,"
                f"est_completion,notes,last_updated,open_items({open_item_columns})"
            )
            .eq("gc_id", gc_id)
            .eq("status", "active")
            .order("name")
            .execute()
        )
        return list(response.data or [])

    try:
        rows = await _run_db("get_active_jobs", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_active_jobs.legacy", lambda: _query(include_trace_id=False))
    try:
        return [_build_job(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_active_jobs mapping failed: {exc}") from exc


async def upsert_job(job: Job, gc_id: str) -> None:
    """Upsert a job row and refresh last_updated timestamp."""
    client = get_client()
    payload = {
        "id": job.id,
        "gc_id": gc_id,
        "name": job.name,
        "type": job.type,
        "status": job.status,
        "address": job.address,
        "contract_value": job.contract_value,
        "contract_type": job.contract_type,
        "est_completion": job.est_completion or None,
        "notes": job.notes,
        "last_updated": _utcnow_iso(),
    }

    def _query() -> None:
        client.table("jobs").upsert(payload, on_conflict="id").execute()

    await _run_db("upsert_job", _query)


async def insert_open_item(item: OpenItem, gc_id: str) -> None:
    """Insert a new open item row for a GC account."""
    client = get_client()
    payload: dict[str, Any] = {
        "id": item.id,
        "job_id": item.job_id,
        "gc_id": gc_id,
        "type": item.type,
        "description": item.description,
        "owner": item.owner,
        "status": item.status,
        "days_silent": item.days_silent,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "trace_id": item.trace_id.strip() or None,
    }

    def _query() -> None:
        client.table("open_items").insert(payload).execute()

    try:
        await _run_db("insert_open_item", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy_payload = dict(payload)
        legacy_payload.pop("trace_id", None)

        def _legacy_query() -> None:
            client.table("open_items").insert(legacy_payload).execute()

        await _run_db("insert_open_item.legacy", _legacy_query)


async def resolve_open_item(item_id: str, gc_id: str) -> None:
    """Mark an open item as resolved and set resolved timestamp."""
    client = get_client()
    payload = {
        "status": "resolved",
        "resolved_at": _utcnow_iso(),
    }

    def _query() -> None:
        (
            client.table("open_items")
            .update(payload)
            .eq("id", item_id)
            .eq("gc_id", gc_id)
            .execute()
        )

    await _run_db("resolve_open_item", _query)


async def insert_drafts(drafts: list[Draft], gc_id: str) -> None:
    """Bulk upsert drafts into draft_queue with content/status conflict updates."""
    if not drafts:
        return

    client = get_client()
    payload: list[dict[str, Any]] = [
        {
            "id": draft.id,
            "job_id": draft.job_id,
            "gc_id": gc_id,
            "type": draft.type,
            "title": draft.title,
            "content": draft.content,
            "why": draft.why,
            "status": draft.status,
            "created_at": draft.created_at.isoformat(),
            "trace_id": draft.trace_id.strip() or None,
        }
        for draft in drafts
    ]

    def _query() -> None:
        client.table("draft_queue").upsert(payload, on_conflict="id").execute()

    try:
        await _run_db("insert_drafts", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy_payload = [{k: v for k, v in row.items() if k != "trace_id"} for row in payload]

        def _legacy_query() -> None:
            client.table("draft_queue").upsert(legacy_payload, on_conflict="id").execute()

        await _run_db("insert_drafts.legacy", _legacy_query)


async def get_queued_drafts(gc_id: str) -> list[Draft]:
    """Return queued drafts for a GC account ordered by most recent first."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .eq("status", "queued")
            .order("created_at", desc=True)
            .execute()
        )
        return list(response.data or [])

    extended_columns = (
        "id,job_id,type,title,content,why,status,was_edited,approval_status,"
        "approval_recorded_at,original_content,created_at,trace_id,jobs(name)"
    )
    legacy_columns = "id,job_id,type,title,content,why,status,created_at,jobs(name)"
    try:
        rows = await _run_db("get_queued_drafts", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_queued_drafts.legacy", lambda: _query(legacy_columns))
    try:
        drafts = [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_queued_drafts mapping failed: {exc}") from exc
    return await _attach_transcript_context_to_drafts(drafts, gc_id)


async def get_pending_drafts(gc_id: str) -> list[Draft]:
    """Return queued or pending drafts for a GC account ordered by most recent first."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .in_("status", ["queued", "pending"])
            .order("created_at", desc=True)
            .execute()
        )
        return list(response.data or [])

    extended_columns = (
        "id,job_id,type,title,content,why,status,was_edited,approval_status,"
        "approval_recorded_at,original_content,created_at,trace_id,jobs(name)"
    )
    legacy_columns = "id,job_id,type,title,content,why,status,created_at,jobs(name)"
    try:
        rows = await _run_db("get_pending_drafts", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_pending_drafts.legacy", lambda: _query(legacy_columns))
    try:
        drafts = [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_pending_drafts mapping failed: {exc}") from exc
    return await _attach_transcript_context_to_drafts(drafts, gc_id)


async def update_draft_status(
    draft_id: str,
    status: str,
    edited_content: Optional[str] = None,
) -> None:
    """Update draft status/actioned timestamp and optional edited content."""
    client = get_client()
    existing_row = await get_draft_record(draft_id) if status in {"approved", "discarded"} else None
    payload: dict[str, Any] = {
        "status": status,
        "actioned_at": _utcnow_iso(),
    }
    payload.update(_approval_tracking_fields(existing_row, status))
    if edited_content is not None:
        payload["content"] = edited_content

    def _query() -> None:
        client.table("draft_queue").update(payload).eq("id", draft_id).execute()

    try:
        await _run_db("update_draft_status", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy_payload: dict[str, Any] = {
            "status": status,
            "actioned_at": _utcnow_iso(),
        }
        if edited_content is not None:
            legacy_payload["content"] = edited_content

        def _legacy_query() -> None:
            client.table("draft_queue").update(legacy_payload).eq("id", draft_id).execute()

        await _run_db("update_draft_status.legacy", _legacy_query)


async def edit_draft_content(draft_id: str, content: str) -> None:
    """Persist edited draft content while keeping the item in the active queue."""
    client = get_client()
    existing_row = await get_draft_record(draft_id)
    original_content = ""
    if existing_row:
        original_content = (
            str(existing_row.get("original_content", "")).strip()
            or str(existing_row.get("content", "")).strip()
        )

    payload: dict[str, Any] = {
        "content": content,
        "status": "queued",
        "was_edited": True,
    }
    if original_content:
        payload["original_content"] = original_content

    def _query() -> None:
        client.table("draft_queue").update(payload).eq("id", draft_id).execute()

    try:
        await _run_db("edit_draft_content", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy_payload = {
            "content": content,
            "status": "queued",
        }

        def _legacy_query() -> None:
            client.table("draft_queue").update(legacy_payload).eq("id", draft_id).execute()

        await _run_db("edit_draft_content.legacy", _legacy_query)


async def get_draft_record(draft_id: str) -> Optional[dict[str, Any]]:
    """Fetch a raw draft row including gc_id for authorization checks."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("id", draft_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    extended_columns = (
        "id,job_id,gc_id,type,title,content,why,status,was_edited,approval_status,"
        "approval_recorded_at,original_content,created_at,actioned_at,trace_id,jobs(name)"
    )
    legacy_columns = "id,job_id,gc_id,type,title,content,why,status,created_at,actioned_at,jobs(name)"
    try:
        rows = await _run_db("get_draft_record", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_draft_record.legacy", lambda: _query(legacy_columns))
    if not rows:
        return None
    return rows[0]


async def get_draft_by_id(draft_id: str) -> Optional[Draft]:
    """Fetch and map a single draft by ID, returning None when not found."""
    row = await get_draft_record(draft_id)
    if row is None:
        return None
    try:
        draft = _build_draft(row)
    except Exception as exc:
        raise DatabaseError(f"get_draft_by_id mapping failed: {exc}") from exc
    gc_id = str(row.get("gc_id", "")).strip()
    enriched = await _attach_transcript_context_to_drafts([draft], gc_id)
    return enriched[0] if enriched else draft


async def approve_all_queued_drafts(gc_id: str) -> int:
    """Approve all queued drafts for a GC account in one operation."""
    client = get_client()

    def _query_rows(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .eq("status", "queued")
            .execute()
        )
        return list(response.data or [])

    try:
        queued_rows = await _run_db("approve_all_queued_drafts.select", lambda: _query_rows("id,was_edited"))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        queued_rows = await _run_db("approve_all_queued_drafts.select.legacy", lambda: _query_rows("id"))
    normalized_rows = [row for row in queued_rows if str(row.get("id", "")).strip()]
    if not normalized_rows:
        return 0

    def _update_all() -> None:
        for row in normalized_rows:
            draft_id = str(row.get("id", "")).strip()
            payload = {
                "status": "approved",
                "actioned_at": _utcnow_iso(),
                **_approval_tracking_fields(row, "approved"),
            }
            client.table("draft_queue").update(payload).eq("id", draft_id).execute()

    try:
        await _run_db("approve_all_queued_drafts.update", _update_all)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise

        def _legacy_update_all() -> None:
            for row in normalized_rows:
                draft_id = str(row.get("id", "")).strip()
                payload = {
                    "status": "approved",
                    "actioned_at": _utcnow_iso(),
                }
                client.table("draft_queue").update(payload).eq("id", draft_id).execute()

        await _run_db("approve_all_queued_drafts.update.legacy", _legacy_update_all)
    return len(normalized_rows)


async def get_actioned_drafts(gc_id: str, limit: int = 50) -> list[Draft]:
    """Fetch approved, edited, or discarded drafts ordered by actioned_at desc."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .in_("status", ["approved", "edited", "discarded"])
            .order("actioned_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    extended_columns = (
        "id,job_id,type,title,content,why,status,was_edited,approval_status,"
        "approval_recorded_at,original_content,created_at,actioned_at,trace_id,jobs(name)"
    )
    legacy_columns = "id,job_id,type,title,content,why,status,created_at,actioned_at,jobs(name)"
    try:
        rows = await _run_db("get_actioned_drafts", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_actioned_drafts.legacy", lambda: _query(legacy_columns))
    try:
        drafts = [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_actioned_drafts mapping failed: {exc}") from exc
    return await _attach_transcript_context_to_drafts(drafts, gc_id)


async def get_approved_with_edit_drafts(gc_id: str, limit: int = 50) -> list[Draft]:
    """Fetch approved drafts that required an edit first, newest first."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .eq("approval_status", "approved_with_edit")
            .order("approval_recorded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    extended_columns = (
        "id,job_id,type,title,original_content,content,why,status,was_edited,approval_status,"
        "approval_recorded_at,created_at,actioned_at,trace_id,jobs(name)"
    )
    try:
        rows = await _run_db("get_approved_with_edit_drafts", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        return []
    try:
        drafts = [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_approved_with_edit_drafts mapping failed: {exc}") from exc
    return await _attach_transcript_context_to_drafts(drafts, gc_id)


async def get_recent_update_logs(gc_id: str, job_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Return recent update_log rows for a job, newest first."""
    client = get_client()

    def _query(select_columns: str) -> list[dict[str, Any]]:
        response = (
            client.table("update_log")
            .select(select_columns)
            .eq("gc_id", gc_id)
            .eq("job_id", job_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    extended_columns = "id,job_id,input_type,raw_input,parsed_changes,drafts_created,trace_id,created_at"
    legacy_columns = "id,job_id,input_type,raw_input,parsed_changes,drafts_created,created_at"
    try:
        rows = await _run_db("get_recent_update_logs", lambda: _query(extended_columns))
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_recent_update_logs.legacy", lambda: _query(legacy_columns))
    try:
        return [
            {
                "id": str(row.get("id", "")),
                "job_id": str(row.get("job_id", "")),
                "input_type": str(row.get("input_type", "")),
                "raw_input": str(row.get("raw_input", "")),
                "parsed_changes": row.get("parsed_changes") if isinstance(row.get("parsed_changes"), dict) else {},
                "drafts_created": row.get("drafts_created") if isinstance(row.get("drafts_created"), list) else [],
                "trace_id": str(row.get("trace_id", "")).strip(),
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    except Exception as exc:
        raise DatabaseError(f"get_recent_update_logs mapping failed: {exc}") from exc


async def get_job_audit_timeline(gc_id: str, job_id: str, limit: int = 80) -> list[dict[str, Any]]:
    """Return merged job activity timeline across updates, quotes, sends, and queue actions."""
    client = get_client()
    gc_value = gc_id.strip()
    job_value = job_id.strip()
    if not gc_value or not job_value:
        return []

    capped_limit = max(1, min(int(limit or 80), 200))

    def _query() -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        try:
            update_response = (
                client.table("update_log")
                .select("id,created_at,input_type,raw_input,trace_id")
                .eq("gc_id", gc_value)
                .eq("job_id", job_value)
                .order("created_at", desc=True)
                .limit(capped_limit)
                .execute()
            )
            for row in list(update_response.data or []):
                created_at = row.get("created_at")
                events.append(
                    {
                        "id": f"update-{str(row.get('id', '')).strip()}",
                        "event_type": "update_ingested",
                        "timestamp": created_at,
                        "title": "Update captured",
                        "summary": str(row.get("raw_input", "")).strip()[:220],
                        "trace_id": str(row.get("trace_id", "")).strip(),
                        "metadata": {
                            "input_type": str(row.get("input_type", "")).strip(),
                        },
                    }
                )
        except Exception:
            pass

        try:
            transcript_response = (
                client.table("call_transcripts")
                .select(
                    "id,created_at,source,provider,caller_phone,caller_name,summary,"
                    "classification,quote_id,trace_id,transcript_text,extracted_json"
                )
                .eq("gc_id", gc_value)
                .eq("job_id", job_value)
                .order("created_at", desc=True)
                .limit(capped_limit)
                .execute()
            )
            for row in list(transcript_response.data or []):
                extracted_json = row.get("extracted_json") if isinstance(row.get("extracted_json"), dict) else {}
                context = _build_draft_transcript_context(
                    {
                        **row,
                        "risk_flags": [],
                        "recommended_actions": [],
                    }
                )
                events.append(
                    {
                        "id": f"transcript-{str(row.get('id', '')).strip()}",
                        "event_type": "call_transcript_received",
                        "timestamp": row.get("created_at"),
                        "title": "Call captured",
                        "summary": _transcript_summary_preview(
                            str(row.get("summary", "")).strip(),
                            str(row.get("transcript_text", "")).strip(),
                        ),
                        "trace_id": str(row.get("trace_id", "")).strip(),
                        "metadata": {
                            "transcript_id": str(row.get("id", "")).strip(),
                            "caller_label": context.caller_label,
                            "classification": str(row.get("classification", "")).strip(),
                            "urgency": str(extracted_json.get("urgency", "normal")).strip() or "normal",
                            "quote_id": str(row.get("quote_id", "")).strip(),
                            "source": str(row.get("source", "")).strip(),
                            "provider": str(row.get("provider", "")).strip(),
                        },
                    }
                )
        except Exception:
            pass

        try:
            draft_response = (
                client.table("draft_queue")
                .select("id,actioned_at,status,title,type,trace_id")
                .eq("gc_id", gc_value)
                .eq("job_id", job_value)
                .in_("status", ["approved", "edited", "discarded"])
                .order("actioned_at", desc=True)
                .limit(capped_limit)
                .execute()
            )
            for row in list(draft_response.data or []):
                actioned_at = row.get("actioned_at")
                status = str(row.get("status", "")).strip().lower()
                if status == "approved":
                    event_type = "draft_approved"
                    title = "Draft approved"
                elif status == "edited":
                    event_type = "draft_edited"
                    title = "Draft edited"
                else:
                    event_type = "draft_discarded"
                    title = "Draft discarded"
                events.append(
                    {
                        "id": f"draft-{str(row.get('id', '')).strip()}-{status}",
                        "event_type": event_type,
                        "timestamp": actioned_at,
                        "title": title,
                        "summary": str(row.get("title", "")).strip(),
                        "trace_id": str(row.get("trace_id", "")).strip(),
                        "metadata": {
                            "draft_type": str(row.get("type", "")).strip(),
                            "status": status,
                        },
                    }
                )
        except Exception:
            pass

        try:
            quote_response = (
                client.table("quote_drafts")
                .select("id,created_at,updated_at,actioned_at,approval_status,trace_id,quote_draft")
                .eq("gc_id", gc_value)
                .eq("job_id", job_value)
                .order("updated_at", desc=True)
                .limit(capped_limit)
                .execute()
            )
            for row in list(quote_response.data or []):
                quote_id = str(row.get("id", "")).strip()
                trace_id = str(row.get("trace_id", "")).strip()
                quote_payload = row.get("quote_draft") if isinstance(row.get("quote_draft"), dict) else {}
                total = _to_float(quote_payload.get("total_price"))
                total_text = f"${total:,.0f}" if total > 0 else "price pending"
                created_at = row.get("created_at")
                events.append(
                    {
                        "id": f"quote-{quote_id}-generated",
                        "event_type": "quote_generated",
                        "timestamp": created_at,
                        "title": "Quote generated",
                        "summary": f"Generated quote {quote_id} ({total_text}).",
                        "trace_id": trace_id,
                        "metadata": {"quote_id": quote_id},
                    }
                )

                approval_status = str(row.get("approval_status", "")).strip().lower()
                actioned_at = row.get("actioned_at")
                if approval_status in {"approved", "edited", "discarded"} and actioned_at:
                    events.append(
                        {
                            "id": f"quote-{quote_id}-{approval_status}",
                            "event_type": f"quote_{approval_status}",
                            "timestamp": actioned_at,
                            "title": f"Quote {approval_status}",
                            "summary": f"Quote {quote_id} marked {approval_status}.",
                            "trace_id": trace_id,
                            "metadata": {"quote_id": quote_id, "approval_status": approval_status},
                        }
                    )
        except Exception:
            pass

        try:
            delivery_response = (
                client.table("quote_delivery_log")
                .select("id,quote_id,created_at,channel,destination,delivery_status,trace_id")
                .eq("gc_id", gc_value)
                .eq("job_id", job_value)
                .order("created_at", desc=True)
                .limit(capped_limit)
                .execute()
            )
            for row in list(delivery_response.data or []):
                delivery_status = str(row.get("delivery_status", "")).strip().lower()
                channel = str(row.get("channel", "")).strip().lower()
                status_text = delivery_status or "pending"
                events.append(
                    {
                        "id": f"delivery-{str(row.get('id', '')).strip()}",
                        "event_type": f"quote_send_{status_text}",
                        "timestamp": row.get("created_at"),
                        "title": f"Quote {status_text}",
                        "summary": (
                            f"Quote {str(row.get('quote_id', '')).strip()} {status_text} via {channel} "
                            f"to {str(row.get('destination', '')).strip()}."
                        ),
                        "trace_id": str(row.get("trace_id", "")).strip(),
                        "metadata": {
                            "quote_id": str(row.get("quote_id", "")).strip(),
                            "channel": channel,
                            "delivery_status": delivery_status,
                        },
                    }
                )
        except Exception:
            pass

        ranked: list[dict[str, Any]] = []
        for event in events:
            stamp = event.get("timestamp")
            parsed = _parse_datetime(stamp)
            event["_sort_ts"] = parsed.isoformat() if parsed else ""
            ranked.append(event)

        ranked.sort(key=lambda item: str(item.get("_sort_ts", "")), reverse=True)
        for item in ranked:
            item.pop("_sort_ts", None)
        return ranked[:capped_limit]

    return await _run_db("get_job_audit_timeline", _query)


async def get_usage_analytics(gc_id: str, window_days: int = 30) -> dict[str, Any]:
    """Return product usage analytics over a rolling day window."""
    client = get_client()
    gc_value = gc_id.strip()
    if not gc_value:
        raise DatabaseError("get_usage_analytics failed: gc_id is required")

    clamped_window = max(1, min(int(window_days or 30), 90))
    since_dt = datetime.now(timezone.utc) - timedelta(days=clamped_window)
    since_iso = since_dt.isoformat()

    def _safe_rows(table: str, columns: str) -> tuple[list[dict[str, Any]], str | None]:
        try:
            response = (
                client.table(table)
                .select(columns)
                .eq("gc_id", gc_value)
                .gte("created_at", since_iso)
                .execute()
            )
            return list(response.data or []), None
        except Exception as exc:
            return [], f"{table}: {exc}"

    def _safe_rows_updated_at(table: str, columns: str) -> tuple[list[dict[str, Any]], str | None]:
        try:
            response = (
                client.table(table)
                .select(columns)
                .eq("gc_id", gc_value)
                .gte("updated_at", since_iso)
                .execute()
            )
            return list(response.data or []), None
        except Exception as exc:
            return [], f"{table}: {exc}"

    def _query() -> dict[str, Any]:
        warnings: list[str] = []

        quote_rows, quote_error = _safe_rows_updated_at(
            "quote_drafts",
            "id,created_at,updated_at,approval_status,was_edited,memory_updated,quote_draft",
        )
        if quote_error:
            warnings.append(quote_error)

        delivery_rows, delivery_error = _safe_rows(
            "quote_delivery_log",
            "id,created_at,channel,delivery_status",
        )
        if delivery_error:
            warnings.append(delivery_error)

        queue_rows, queue_error = _safe_rows(
            "draft_queue",
            "id,created_at,status,approval_status,was_edited",
        )
        if queue_error:
            warnings.append(queue_error)

        update_rows, update_error = _safe_rows(
            "update_log",
            "id,created_at,drafts_created",
        )
        if update_error:
            warnings.append(update_error)

        trace_rows, trace_error = _safe_rows(
            "agent_trace",
            "id,created_at,flow,node_name,status,latency_ms",
        )
        if trace_error:
            warnings.append(trace_error)

        quotes_generated = len(quote_rows)
        quotes_approved = 0
        quotes_edited = 0
        quotes_discarded = 0
        memory_updates = 0
        quote_total_values: list[float] = []

        for row in quote_rows:
            status = str(row.get("approval_status", "")).strip().lower()
            if status == "approved":
                quotes_approved += 1
            elif status == "edited":
                quotes_edited += 1
            elif status == "discarded":
                quotes_discarded += 1
            if bool(row.get("memory_updated", False)):
                memory_updates += 1

            quote_payload = row.get("quote_draft")
            if isinstance(quote_payload, dict):
                total = _to_float(quote_payload.get("total_price"))
                if total > 0:
                    quote_total_values.append(total)

        decisions_total = quotes_approved + quotes_edited + quotes_discarded
        approval_rate = round(((quotes_approved + quotes_edited) / decisions_total) * 100, 2) if decisions_total else 0.0
        avg_quote_value = round(sum(quote_total_values) / len(quote_total_values), 2) if quote_total_values else 0.0

        deliveries_sent = 0
        deliveries_failed = 0
        channel_breakdown: dict[str, int] = {}
        for row in delivery_rows:
            status = str(row.get("delivery_status", "")).strip().lower()
            if status == "sent":
                deliveries_sent += 1
            elif status == "failed":
                deliveries_failed += 1

            channel = str(row.get("channel", "unknown")).strip().lower() or "unknown"
            channel_breakdown[channel] = channel_breakdown.get(channel, 0) + 1

        updates_ingested = len(update_rows)
        drafts_suggested = 0
        for row in update_rows:
            drafts = row.get("drafts_created")
            if isinstance(drafts, list):
                drafts_suggested += len(drafts)

        queue_pending = 0
        queue_approved = 0
        queue_discarded = 0
        queue_edited = 0
        for row in queue_rows:
            status = str(row.get("status", "")).strip().lower()
            approval_status = str(row.get("approval_status", "")).strip().lower()
            was_edited = bool(row.get("was_edited", False))
            if status in {"queued", "pending"}:
                queue_pending += 1
            if status == "approved":
                queue_approved += 1
            if status == "discarded":
                queue_discarded += 1
            if approval_status == "approved_with_edit" or was_edited:
                queue_edited += 1

        total_trace = len(trace_rows)
        trace_errors = 0
        trace_latency_samples: list[int] = []
        flow_breakdown: dict[str, int] = {}
        for row in trace_rows:
            status = str(row.get("status", "")).strip().lower()
            if status == "error":
                trace_errors += 1
            latency = row.get("latency_ms")
            if isinstance(latency, int) and latency >= 0:
                trace_latency_samples.append(latency)

            flow = str(row.get("flow", "unknown")).strip().lower() or "unknown"
            flow_breakdown[flow] = flow_breakdown.get(flow, 0) + 1

        avg_node_latency_ms = (
            round(sum(trace_latency_samples) / len(trace_latency_samples), 2)
            if trace_latency_samples
            else 0.0
        )
        trace_error_rate = round((trace_errors / total_trace) * 100, 2) if total_trace else 0.0

        return {
            "window_days": clamped_window,
            "since": since_iso,
            "quotes": {
                "generated": quotes_generated,
                "approved": quotes_approved,
                "edited": quotes_edited,
                "discarded": quotes_discarded,
                "approval_rate_pct": approval_rate,
                "avg_quote_value": avg_quote_value,
                "memory_updates": memory_updates,
            },
            "delivery": {
                "sent": deliveries_sent,
                "failed": deliveries_failed,
                "channel_breakdown": channel_breakdown,
            },
            "updates": {
                "ingested": updates_ingested,
                "drafts_suggested": drafts_suggested,
            },
            "queue": {
                "pending": queue_pending,
                "approved": queue_approved,
                "discarded": queue_discarded,
                "edited": queue_edited,
            },
            "runtime": {
                "trace_rows": total_trace,
                "trace_errors": trace_errors,
                "trace_error_rate_pct": trace_error_rate,
                "avg_node_latency_ms": avg_node_latency_ms,
                "flow_breakdown": flow_breakdown,
            },
            "warnings": warnings,
        }

    return await _run_db("get_usage_analytics", _query)


async def insert_call_transcript(
    *,
    gc_id: str,
    source: str,
    transcript_text: str,
    job_id: str = "",
    quote_id: str = "",
    call_id: str = "",
    provider: str = "",
    caller_phone: str = "",
    caller_name: str = "",
    started_at: str | None = None,
    duration_seconds: int | None = None,
    recording_url: str = "",
    summary: str = "",
    classification: str = "",
    confidence: float | None = None,
    extracted_json: dict[str, Any] | None = None,
    risk_flags: list[Any] | None = None,
    recommended_actions: list[Any] | None = None,
    trace_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> str:
    """Persist one call transcript for later processing and audit."""
    client = get_client()
    gc_value = gc_id.strip()
    source_value = source.strip()
    transcript_value = transcript_text.strip()
    if not gc_value:
        raise DatabaseError("insert_call_transcript failed: gc_id is required")
    if not source_value:
        raise DatabaseError("insert_call_transcript failed: source is required")
    if not transcript_value:
        raise DatabaseError("insert_call_transcript failed: transcript_text is required")

    transcript_id = uuid4().hex
    timestamp = _utcnow_iso()
    payload = {
        "id": transcript_id,
        "gc_id": gc_value,
        "job_id": job_id.strip() or None,
        "quote_id": quote_id.strip() or None,
        "call_id": call_id.strip() or None,
        "source": source_value,
        "provider": provider.strip() or None,
        "caller_phone": caller_phone.strip() or None,
        "caller_name": caller_name.strip() or None,
        "started_at": started_at.strip() if isinstance(started_at, str) and started_at.strip() else started_at,
        "duration_seconds": _optional_int(duration_seconds),
        "recording_url": recording_url.strip() or None,
        "transcript_text": transcript_value,
        "summary": summary.strip() or None,
        "classification": classification.strip() or None,
        "confidence": _optional_float(confidence),
        "extracted_json": extracted_json if isinstance(extracted_json, dict) else {},
        "risk_flags": risk_flags if isinstance(risk_flags, list) else [],
        "recommended_actions": recommended_actions if isinstance(recommended_actions, list) else [],
        "trace_id": trace_id.strip() or None,
        "metadata": metadata if isinstance(metadata, dict) else {},
        "created_at": timestamp,
        "updated_at": timestamp,
    }

    def _query() -> None:
        client.table("call_transcripts").insert(payload).execute()

    await _run_db("insert_call_transcript", _query)
    return transcript_id


async def update_call_transcript(
    transcript_id: str,
    gc_id: str,
    *,
    job_id: str | None | object = _UNSET,
    quote_id: str | None | object = _UNSET,
    call_id: str | None | object = _UNSET,
    provider: str | None | object = _UNSET,
    caller_phone: str | None | object = _UNSET,
    caller_name: str | None | object = _UNSET,
    started_at: str | None | object = _UNSET,
    duration_seconds: int | None | object = _UNSET,
    recording_url: str | None | object = _UNSET,
    summary: str | None | object = _UNSET,
    classification: str | None | object = _UNSET,
    confidence: float | None | object = _UNSET,
    extracted_json: dict[str, Any] | None | object = _UNSET,
    risk_flags: list[Any] | None | object = _UNSET,
    recommended_actions: list[Any] | None | object = _UNSET,
    trace_id: str | None | object = _UNSET,
    metadata: dict[str, Any] | None | object = _UNSET,
) -> None:
    """Update enrichment fields on an existing call transcript record."""
    client = get_client()
    transcript_value = transcript_id.strip()
    gc_value = gc_id.strip()
    if not transcript_value:
        raise DatabaseError("update_call_transcript failed: transcript_id is required")
    if not gc_value:
        raise DatabaseError("update_call_transcript failed: gc_id is required")

    payload: dict[str, Any] = {"updated_at": _utcnow_iso()}

    if job_id is not _UNSET:
        payload["job_id"] = (str(job_id).strip() or None) if isinstance(job_id, str) else job_id
    if quote_id is not _UNSET:
        payload["quote_id"] = (str(quote_id).strip() or None) if isinstance(quote_id, str) else quote_id
    if call_id is not _UNSET:
        payload["call_id"] = (str(call_id).strip() or None) if isinstance(call_id, str) else call_id
    if provider is not _UNSET:
        payload["provider"] = (str(provider).strip() or None) if isinstance(provider, str) else provider
    if caller_phone is not _UNSET:
        payload["caller_phone"] = (
            str(caller_phone).strip() or None
        ) if isinstance(caller_phone, str) else caller_phone
    if caller_name is not _UNSET:
        payload["caller_name"] = (
            str(caller_name).strip() or None
        ) if isinstance(caller_name, str) else caller_name
    if started_at is not _UNSET:
        payload["started_at"] = (str(started_at).strip() or None) if isinstance(started_at, str) else started_at
    if duration_seconds is not _UNSET:
        payload["duration_seconds"] = _optional_int(duration_seconds)
    if recording_url is not _UNSET:
        payload["recording_url"] = (
            str(recording_url).strip() or None
        ) if isinstance(recording_url, str) else recording_url
    if summary is not _UNSET:
        payload["summary"] = (str(summary).strip() or None) if isinstance(summary, str) else summary
    if classification is not _UNSET:
        payload["classification"] = (
            (str(classification).strip() or None) if isinstance(classification, str) else classification
        )
    if confidence is not _UNSET:
        payload["confidence"] = _optional_float(confidence)
    if extracted_json is not _UNSET:
        payload["extracted_json"] = extracted_json if isinstance(extracted_json, dict) else {}
    if risk_flags is not _UNSET:
        payload["risk_flags"] = risk_flags if isinstance(risk_flags, list) else []
    if recommended_actions is not _UNSET:
        payload["recommended_actions"] = (
            recommended_actions if isinstance(recommended_actions, list) else []
        )
    if trace_id is not _UNSET:
        payload["trace_id"] = (str(trace_id).strip() or None) if isinstance(trace_id, str) else trace_id
    if metadata is not _UNSET:
        payload["metadata"] = metadata if isinstance(metadata, dict) else {}

    def _query() -> None:
        (
            client.table("call_transcripts")
            .update(payload)
            .eq("id", transcript_value)
            .eq("gc_id", gc_value)
            .execute()
        )

    await _run_db("update_call_transcript", _query)


async def get_call_transcript_by_id(transcript_id: str, gc_id: str) -> Optional[dict[str, Any]]:
    """Fetch one transcript record by ID for the owning GC account."""
    client = get_client()
    transcript_value = transcript_id.strip()
    gc_value = gc_id.strip()
    if not transcript_value or not gc_value:
        return None

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("call_transcripts")
            .select(
                "id,gc_id,job_id,quote_id,call_id,source,provider,caller_phone,caller_name,"
                "started_at,duration_seconds,recording_url,transcript_text,summary,classification,"
                "confidence,extracted_json,risk_flags,recommended_actions,trace_id,metadata,"
                "created_at,updated_at"
            )
            .eq("id", transcript_value)
            .eq("gc_id", gc_value)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_call_transcript_by_id", _query)
    if not rows:
        return None
    return _build_call_transcript_record(rows[0]).model_dump(mode="json")


async def get_call_transcripts_for_job(gc_id: str, job_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Fetch transcript history for one job in newest-first order."""
    client = get_client()
    gc_value = gc_id.strip()
    job_value = job_id.strip()
    if not gc_value or not job_value:
        return []

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("call_transcripts")
            .select(
                "id,gc_id,job_id,quote_id,call_id,source,provider,caller_phone,caller_name,"
                "started_at,duration_seconds,recording_url,transcript_text,summary,classification,"
                "confidence,extracted_json,risk_flags,recommended_actions,trace_id,metadata,"
                "created_at,updated_at"
            )
            .eq("gc_id", gc_value)
            .eq("job_id", job_value)
            .order("created_at", desc=True)
            .limit(max(int(limit or 20), 1))
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_call_transcripts_for_job", _query)
    return [_build_call_transcript_record(row).model_dump(mode="json") for row in rows]


async def get_call_transcripts_for_quote(gc_id: str, quote_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """Fetch transcript history linked to one quote in newest-first order."""
    client = get_client()
    gc_value = gc_id.strip()
    quote_value = quote_id.strip()
    if not gc_value or not quote_value:
        return []

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("call_transcripts")
            .select(
                "id,gc_id,job_id,quote_id,call_id,source,provider,caller_phone,caller_name,"
                "started_at,duration_seconds,recording_url,transcript_text,summary,classification,"
                "confidence,extracted_json,risk_flags,recommended_actions,trace_id,metadata,"
                "created_at,updated_at"
            )
            .eq("gc_id", gc_value)
            .eq("quote_id", quote_value)
            .order("created_at", desc=True)
            .limit(max(int(limit or 20), 1))
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_call_transcripts_for_quote", _query)
    return [_build_call_transcript_record(row).model_dump(mode="json") for row in rows]


async def get_job_call_history(gc_id: str, job_id: str, limit: int = 12) -> list[dict[str, Any]]:
    """Return summary-first transcript history for a job detail view."""
    gc_value = gc_id.strip()
    job_value = job_id.strip()
    if not gc_value or not job_value:
        return []

    transcripts = await get_call_transcripts_for_job(gc_value, job_value, limit=max(int(limit or 12), 1))
    if not transcripts:
        return []

    history: list[dict[str, Any]] = []
    for transcript in transcripts:
        context = _build_draft_transcript_context(transcript)
        trace_id = str(transcript.get("trace_id", "")).strip()
        related_queue_item_ids = await get_related_transcript_review_draft_ids(
            gc_value,
            job_id=job_value,
            trace_id=trace_id,
            transcript_id=context.transcript_id,
            limit=8,
        )
        history.append(
            {
                "id": context.transcript_id,
                "timestamp": context.started_at or transcript.get("created_at"),
                "trace_id": trace_id,
                "caller_label": context.caller_label,
                "caller_phone": context.caller_phone,
                "source": context.source,
                "provider": context.provider,
                "summary": _transcript_summary_preview(context.summary, context.transcript_text),
                "classification": context.classification,
                "urgency": context.urgency,
                "confidence": context.confidence,
                "risk_flags": list(context.risk_flags),
                "recommended_actions": list(context.recommended_actions),
                "missing_information": list(context.missing_information),
                "transcript_text": context.transcript_text,
                "linked_quote_id": context.linked_quote_id,
                "related_queue_item_ids": related_queue_item_ids,
                "recording_url": context.recording_url,
                "started_at": context.started_at,
                "duration_seconds": context.duration_seconds,
            }
        )

    return history


async def list_recent_call_transcripts(gc_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """List recent transcript records for a GC account in newest-first order."""
    client = get_client()
    gc_value = gc_id.strip()
    if not gc_value:
        return []

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("call_transcripts")
            .select(
                "id,gc_id,job_id,quote_id,call_id,source,provider,caller_phone,caller_name,"
                "started_at,duration_seconds,recording_url,transcript_text,summary,classification,"
                "confidence,extracted_json,risk_flags,recommended_actions,trace_id,metadata,"
                "created_at,updated_at"
            )
            .eq("gc_id", gc_value)
            .order("created_at", desc=True)
            .limit(max(int(limit or 50), 1))
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("list_recent_call_transcripts", _query)
    return [_build_call_transcript_record(row).model_dump(mode="json") for row in rows]


def _normalize_phone_destination(value: str) -> str:
    """Normalize phone-like values for deterministic transcript caller matching."""
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) > 10:
        return digits[-10:]
    return digits


async def find_recent_quote_delivery_match(gc_id: str, destination: str) -> Optional[dict[str, Any]]:
    """Return the newest quote delivery attempt matching a caller destination for one GC."""
    client = get_client()
    gc_value = gc_id.strip()
    normalized_destination = _normalize_phone_destination(destination)
    if not gc_value or not normalized_destination:
        return None

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("quote_delivery_log")
            .select("quote_id,job_id,recipient_name,channel,trace_id,destination,created_at")
            .eq("gc_id", gc_value)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("find_recent_quote_delivery_match", _query)
    for row in rows:
        candidate = _normalize_phone_destination(str(row.get("destination", "")).strip())
        if candidate and candidate == normalized_destination:
            return {
                "quote_id": str(row.get("quote_id", "")).strip(),
                "job_id": str(row.get("job_id", "")).strip(),
                "recipient_name": str(row.get("recipient_name", "")).strip(),
                "channel": str(row.get("channel", "")).strip().lower(),
                "trace_id": str(row.get("trace_id", "")).strip(),
                "destination": str(row.get("destination", "")).strip(),
                "created_at": row.get("created_at"),
            }
    return None


async def upsert_quote_draft(
    *,
    quote_id: str,
    gc_id: str,
    job_id: str = "",
    trace_id: str = "",
    quote_draft: dict[str, Any],
    rendered_quote: str,
    estimate_confidence: dict[str, Any] | None = None,
    source_files: list[dict[str, Any]] | None = None,
) -> None:
    """Persist one generated quote draft so PDF rendering survives restarts."""
    client = get_client()
    payload = {
        "id": quote_id,
        "gc_id": gc_id,
        "job_id": job_id.strip() or None,
        "trace_id": trace_id.strip() or None,
        "quote_draft": quote_draft,
        "final_quote_draft": None,
        "approval_status": "pending",
        "was_edited": False,
        "feedback_note": None,
        "quote_delta": {},
        "actioned_at": None,
        "memory_updated": False,
        "memory_summary": None,
        "estimate_confidence": estimate_confidence if isinstance(estimate_confidence, dict) else {},
        "source_files": [item for item in (source_files or []) if isinstance(item, dict)],
        "rendered_quote": rendered_quote,
        "updated_at": _utcnow_iso(),
    }

    def _query(include_source_files: bool = True) -> None:
        candidate = dict(payload)
        if not include_source_files:
            candidate.pop("source_files", None)
        client.table("quote_drafts").upsert(candidate, on_conflict="id").execute()

    try:
        await _run_db("upsert_quote_draft", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        await _run_db("upsert_quote_draft.legacy", lambda: _query(include_source_files=False))


async def get_quote_draft_record(quote_id: str) -> Optional[dict[str, Any]]:
    """Fetch one stored quote draft by ID."""
    client = get_client()

    def _query(include_source_files: bool = True) -> list[dict[str, Any]]:
        source_file_columns = ",source_files" if include_source_files else ""
        response = (
            client.table("quote_drafts")
            .select(
                "id,gc_id,job_id,trace_id,quote_draft,final_quote_draft,rendered_quote,"
                "approval_status,was_edited,feedback_note,quote_delta,actioned_at,memory_updated,"
                f"memory_summary,estimate_confidence{source_file_columns},created_at,updated_at"
            )
            .eq("id", quote_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    try:
        rows = await _run_db("get_quote_draft_record", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        rows = await _run_db("get_quote_draft_record.legacy", lambda: _query(include_source_files=False))
    if not rows:
        return None
    row = rows[0]
    return {
        "id": str(row.get("id", "")).strip(),
        "gc_id": str(row.get("gc_id", "")).strip(),
        "job_id": str(row.get("job_id", "")).strip(),
        "trace_id": str(row.get("trace_id", "")).strip(),
        "quote_draft": row.get("quote_draft") if isinstance(row.get("quote_draft"), dict) else {},
        "final_quote_draft": (
            row.get("final_quote_draft")
            if isinstance(row.get("final_quote_draft"), dict)
            else {}
        ),
        "rendered_quote": str(row.get("rendered_quote", "")),
        "approval_status": str(row.get("approval_status", "pending")).strip() or "pending",
        "was_edited": bool(row.get("was_edited", False)),
        "feedback_note": str(row.get("feedback_note", "")).strip(),
        "quote_delta": row.get("quote_delta") if isinstance(row.get("quote_delta"), dict) else {},
        "actioned_at": row.get("actioned_at"),
        "memory_updated": bool(row.get("memory_updated", False)),
        "memory_summary": str(row.get("memory_summary", "")).strip(),
        "estimate_confidence": (
            row.get("estimate_confidence")
            if isinstance(row.get("estimate_confidence"), dict)
            else {}
        ),
        "source_files": [
            item
            for item in (row.get("source_files") or [])
            if isinstance(item, dict)
        ],
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


async def get_quote_delivery_attempts(quote_id: str, gc_id: str) -> list[dict[str, Any]]:
    """Fetch stored delivery attempts for one quote in newest-first order."""
    client = get_client()
    quote_value = quote_id.strip()
    gc_value = gc_id.strip()
    if not quote_value or not gc_value:
        return []

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("quote_delivery_log")
            .select(
                "id,quote_id,gc_id,job_id,trace_id,channel,destination,recipient_name,"
                "message_preview,delivery_status,provider_message_id,error_message,created_at"
            )
            .eq("quote_id", quote_value)
            .eq("gc_id", gc_value)
            .order("created_at", desc=True)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_quote_delivery_attempts", _query)
    attempts: list[dict[str, Any]] = []
    for row in rows:
        attempts.append(
            {
                "id": str(row.get("id", "")).strip(),
                "quote_id": str(row.get("quote_id", "")).strip(),
                "gc_id": str(row.get("gc_id", "")).strip(),
                "job_id": str(row.get("job_id", "")).strip(),
                "trace_id": str(row.get("trace_id", "")).strip(),
                "channel": str(row.get("channel", "")).strip().lower(),
                "destination": str(row.get("destination", "")).strip(),
                "recipient_name": str(row.get("recipient_name", "")).strip(),
                "message_preview": str(row.get("message_preview", "")).strip(),
                "delivery_status": str(row.get("delivery_status", "")).strip().lower() or "pending",
                "provider_message_id": str(row.get("provider_message_id", "")).strip(),
                "error_message": str(row.get("error_message", "")).strip(),
                "created_at": row.get("created_at"),
            }
        )
    return attempts


def _build_followup_state_payload(
    *,
    quote_id: str,
    job_id: str,
    item: dict[str, Any] | None,
    delivery_attempts: list[dict[str, Any]],
    quote_approval_status: str = "",
    quote_actioned_at: Any = None,
) -> dict[str, Any]:
    """Build a contractor-facing follow-up runtime summary from open item state."""
    latest_attempt = delivery_attempts[0] if delivery_attempts else {}
    channel = str(latest_attempt.get("channel", "")).strip().lower() or None
    stop_statuses = {"discarded", "converted", "accepted", "closed", "expired"}
    approval_status = quote_approval_status.strip().lower()

    if item is None:
        return {
            "open_item_id": None,
            "quote_id": quote_id.strip() or None,
            "job_id": job_id.strip() or None,
            "status": "none",
            "next_due_at": None,
            "reminder_count": 0,
            "last_reminder_at": None,
            "stopped_at": None,
            "stop_reason": None,
            "channel": channel,
        }

    raw_status = str(item.get("status", "")).strip().lower()
    stop_reason = str(item.get("stop_reason", "")).strip().lower() or None
    stopped_at = item.get("stopped_at") or item.get("resolved_at")
    if approval_status in stop_statuses:
        stop_reason = stop_reason or f"quote_{approval_status}"
        stopped_at = stopped_at or quote_actioned_at

    if stopped_at or raw_status == "resolved" or approval_status in stop_statuses:
        status = "stopped"
        next_due_at = None
    elif channel:
        status = "scheduled"
        next_due_at = item.get("next_due_at") or item.get("due_date")
    else:
        status = "pending_destination"
        next_due_at = item.get("next_due_at") or item.get("due_date")

    return {
        "open_item_id": str(item.get("id", "")).strip() or None,
        "quote_id": str(item.get("quote_id", "")).strip() or quote_id.strip() or None,
        "job_id": str(item.get("job_id", "")).strip() or job_id.strip() or None,
        "status": status,
        "next_due_at": next_due_at,
        "reminder_count": max(_to_int(item.get("reminder_count"), 0), 0),
        "last_reminder_at": item.get("last_reminder_at"),
        "stopped_at": stopped_at,
        "stop_reason": stop_reason,
        "channel": channel,
    }


async def _get_followup_rows(gc_id: str, job_id: str | None = None) -> list[dict[str, Any]]:
    """Fetch follow-up open items for a GC account, optionally scoped to one job."""
    client = get_client()
    gc_value = gc_id.strip()
    if not gc_value:
        return []

    def _query() -> list[dict[str, Any]]:
        query = (
            client.table("open_items")
            .select(
                "id,job_id,gc_id,quote_id,type,description,status,due_date,created_at,"
                "resolved_at,trace_id,reminder_count,last_reminder_at,next_due_at,stopped_at,stop_reason"
            )
            .eq("gc_id", gc_value)
            .in_("type", ["followup", "follow-up"])
            .order("created_at", desc=True)
        )
        if job_id and job_id.strip():
            query = query.eq("job_id", job_id.strip())
        response = query.execute()
        return list(response.data or [])

    rows = await _run_db("_get_followup_rows", _query)
    normalized: list[dict[str, Any]] = []
    for row in rows:
        payload = dict(row)
        payload["quote_id"] = str(row.get("quote_id", "")).strip() or _extract_quote_id_from_description(
            row.get("description", "")
        )
        normalized.append(payload)
    return normalized


async def get_quote_followup_state(quote_id: str, gc_id: str) -> dict[str, Any]:
    """Return the latest follow-up runtime state for one quote."""
    quote_value = quote_id.strip()
    gc_value = gc_id.strip()
    if not quote_value or not gc_value:
        return _build_followup_state_payload(
            quote_id=quote_value,
            job_id="",
            item=None,
            delivery_attempts=[],
        )

    quote_record = await get_quote_draft_record(quote_value)
    rows = await _get_followup_rows(gc_value)
    item = next((row for row in rows if str(row.get("quote_id", "")).strip() == quote_value), None)
    delivery_attempts = await get_quote_delivery_attempts(quote_value, gc_value)
    return _build_followup_state_payload(
        quote_id=quote_value,
        job_id=str((quote_record or {}).get("job_id", "")).strip(),
        item=item,
        delivery_attempts=delivery_attempts,
        quote_approval_status=str((quote_record or {}).get("approval_status", "")).strip(),
        quote_actioned_at=(quote_record or {}).get("actioned_at"),
    )


async def get_job_followup_state(gc_id: str, job_id: str) -> dict[str, Any] | None:
    """Return the latest follow-up runtime state for a job's active quote, when present."""
    job_value = job_id.strip()
    gc_value = gc_id.strip()
    if not job_value or not gc_value:
        return None

    rows = await _get_followup_rows(gc_value, job_value)
    if not rows:
        return None

    active_item = next(
        (
            row
            for row in rows
            if str(row.get("status", "")).strip().lower() in {"open", "in-progress", "overdue", ""}
        ),
        None,
    )
    item = active_item or rows[0]
    quote_value = str(item.get("quote_id", "")).strip()
    quote_record = await get_quote_draft_record(quote_value) if quote_value else None
    delivery_attempts = await get_quote_delivery_attempts(quote_value, gc_value) if quote_value else []
    return _build_followup_state_payload(
        quote_id=quote_value,
        job_id=job_value,
        item=item,
        delivery_attempts=delivery_attempts,
        quote_approval_status=str((quote_record or {}).get("approval_status", "")).strip(),
        quote_actioned_at=(quote_record or {}).get("actioned_at"),
    )


async def finalize_quote_draft_feedback(
    *,
    quote_id: str,
    gc_id: str,
    final_quote_draft: dict[str, Any],
    approval_status: str,
    was_edited: bool,
    quote_delta: dict[str, Any],
    feedback_note: str = "",
    memory_updated: bool = False,
    memory_summary: str = "",
) -> None:
    """Persist quote decision metadata and final edited payload."""
    client = get_client()
    payload = {
        "final_quote_draft": final_quote_draft,
        "approval_status": approval_status.strip() or "pending",
        "was_edited": bool(was_edited),
        "feedback_note": feedback_note.strip() or None,
        "quote_delta": quote_delta,
        "actioned_at": _utcnow_iso(),
        "memory_updated": bool(memory_updated),
        "memory_summary": memory_summary.strip() or None,
        "updated_at": _utcnow_iso(),
    }

    def _query() -> None:
        (
            client.table("quote_drafts")
            .update(payload)
            .eq("id", quote_id)
            .eq("gc_id", gc_id)
            .execute()
        )

    await _run_db("finalize_quote_draft_feedback", _query)


async def insert_quote_delivery_log(
    *,
    quote_id: str,
    gc_id: str,
    job_id: str = "",
    trace_id: str = "",
    channel: str,
    destination: str,
    recipient_name: str = "",
    message_preview: str = "",
    delivery_status: str,
    provider_message_id: str = "",
    error_message: str = "",
) -> str:
    """Persist one outbound quote delivery attempt/result."""
    client = get_client()
    delivery_id = f"qdl-{uuid4().hex[:12]}"
    payload = {
        "id": delivery_id,
        "quote_id": quote_id,
        "gc_id": gc_id,
        "job_id": job_id.strip() or None,
        "trace_id": trace_id.strip() or None,
        "channel": channel.strip(),
        "destination": destination.strip(),
        "recipient_name": recipient_name.strip() or None,
        "message_preview": message_preview.strip() or None,
        "delivery_status": delivery_status.strip(),
        "provider_message_id": provider_message_id.strip() or None,
        "error_message": error_message.strip() or None,
        "created_at": _utcnow_iso(),
    }

    def _query() -> None:
        client.table("quote_delivery_log").insert(payload).execute()

    await _run_db("insert_quote_delivery_log", _query)
    return delivery_id


async def apply_twilio_delivery_status(
    *,
    provider_message_id: str,
    delivery_status: str,
    error_message: str = "",
) -> dict[str, int]:
    """Apply Twilio callback status to quote and briefing delivery logs."""
    client = get_client()
    message_id = provider_message_id.strip()
    if not message_id:
        return {"updated_rows": 0, "quote_rows": 0, "briefing_rows": 0}

    normalized_status = delivery_status.strip().lower() or "pending"
    normalized_error = error_message.strip() or None

    quote_payload: dict[str, Any] = {
        "delivery_status": normalized_status,
    }
    if normalized_error:
        quote_payload["error_message"] = normalized_error

    briefing_payload: dict[str, Any] = {
        "delivery_status": normalized_status,
    }
    if normalized_error:
        briefing_payload["error_message"] = normalized_error

    def _update_quote_log() -> int:
        response = (
            client.table("quote_delivery_log")
            .update(quote_payload)
            .eq("provider_message_id", message_id)
            .execute()
        )
        return len(response.data or [])

    def _update_briefing_log_exact() -> int:
        response = (
            client.table("briefing_log")
            .update(briefing_payload)
            .eq("twilio_sid", message_id)
            .execute()
        )
        return len(response.data or [])

    def _update_briefing_log_contains() -> int:
        response = (
            client.table("briefing_log")
            .update(briefing_payload)
            .ilike("twilio_sid", f"%{message_id}%")
            .execute()
        )
        return len(response.data or [])

    quote_rows = 0
    briefing_rows = 0

    try:
        quote_rows = await _run_db("apply_twilio_delivery_status.quote", _update_quote_log)
    except DatabaseError:
        # quote_delivery_log may not exist on older schemas; ignore.
        quote_rows = 0

    try:
        briefing_rows = await _run_db("apply_twilio_delivery_status.briefing_exact", _update_briefing_log_exact)
    except DatabaseError:
        briefing_rows = 0

    if briefing_rows == 0:
        try:
            briefing_rows = await _run_db(
                "apply_twilio_delivery_status.briefing_contains",
                _update_briefing_log_contains,
            )
        except DatabaseError:
            briefing_rows = 0

    return {
        "updated_rows": int(quote_rows + briefing_rows),
        "quote_rows": int(quote_rows),
        "briefing_rows": int(briefing_rows),
    }


ONBOARDING_DEFAULTS_BY_TRADE: dict[str, dict[str, float]] = {
    "general_construction": {
        "labor_rate_per_square": 92.0,
        "default_markup_pct": 25.0,
        "tear_off_per_square": 58.0,
        "laminated_shingles_per_square": 142.0,
        "synthetic_underlayment_per_square": 20.0,
    },
    "roofing": {
        "labor_rate_per_square": 95.0,
        "default_markup_pct": 27.0,
        "tear_off_per_square": 62.0,
        "laminated_shingles_per_square": 148.0,
        "synthetic_underlayment_per_square": 21.0,
    },
    "remodel": {
        "labor_rate_per_square": 88.0,
        "default_markup_pct": 24.0,
        "tear_off_per_square": 54.0,
        "laminated_shingles_per_square": 136.0,
        "synthetic_underlayment_per_square": 19.0,
    },
}


def _normalize_primary_trade(value: Any) -> str:
    """Normalize primary-trade input to a supported template key."""
    raw = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if raw in ONBOARDING_DEFAULTS_BY_TRADE:
        return raw
    if "roof" in raw:
        return "roofing"
    if "remodel" in raw:
        return "remodel"
    return "general_construction"


def get_onboarding_defaults(primary_trade: str = "general_construction") -> dict[str, float]:
    """Return default onboarding pricing values for the selected trade."""
    normalized = _normalize_primary_trade(primary_trade)
    base = ONBOARDING_DEFAULTS_BY_TRADE["general_construction"]
    selected = ONBOARDING_DEFAULTS_BY_TRADE.get(normalized, base)
    merged = dict(base)
    merged.update(selected)
    return {key: round(_to_float(value), 2) for key, value in merged.items()}


async def get_onboarding_pricing(gc_id: str) -> dict[str, Any]:
    """Fetch contractor pricing onboarding profile and completion status."""
    from gc_agent.tools import supabase

    gc_value = gc_id.strip()
    default_trade = "general_construction"
    default_template = get_onboarding_defaults(default_trade)
    if not gc_value:
        return {
            "company_name": "",
            "labor_rate_per_square": default_template["labor_rate_per_square"],
            "default_markup_pct": default_template["default_markup_pct"],
            "tear_off_per_square": default_template["tear_off_per_square"],
            "laminated_shingles_per_square": default_template["laminated_shingles_per_square"],
            "synthetic_underlayment_per_square": default_template["synthetic_underlayment_per_square"],
            "preferred_supplier": "",
            "preferred_shingle_brand": "",
            "primary_trade": default_trade,
            "service_area": "",
            "recommended_defaults": default_template,
            "notes": "",
            "onboarding_complete": False,
            "missing_fields": ["company_name", "labor_rate_per_square", "default_markup_pct"],
        }

    def _query() -> dict[str, Any]:
        profile = supabase.get_contractor_profile(gc_value) or {}
        price_map = supabase.get_price_list_map(gc_value)
        pricing_signals = dict(profile.get("pricing_signals") or {})
        material_preferences = dict(profile.get("material_preferences") or {})
        primary_trade = _normalize_primary_trade(pricing_signals.get("primary_trade"))
        service_area = str(pricing_signals.get("service_area", "")).strip()
        recommended_defaults = get_onboarding_defaults(primary_trade)

        company_name = str(profile.get("company_name", "")).strip()
        labor_rate = _to_float(
            pricing_signals.get("labor_rate_per_square")
            or price_map.get("labor_rate_per_square")
        )
        markup_pct = _to_float(
            pricing_signals.get("default_markup_pct")
            or price_map.get("default_markup_pct")
        )
        tear_off = _to_float(
            pricing_signals.get("tear_off_per_square")
            or price_map.get("tear_off_per_square")
        )
        laminated = _to_float(
            pricing_signals.get("laminated_shingles_per_square")
            or price_map.get("laminated_shingles_per_square")
        )
        underlayment = _to_float(
            pricing_signals.get("synthetic_underlayment_per_square")
            or price_map.get("synthetic_underlayment_per_square")
        )

        missing_fields: list[str] = []
        if not company_name:
            missing_fields.append("company_name")
        if labor_rate <= 0:
            missing_fields.append("labor_rate_per_square")
        if markup_pct <= 0:
            missing_fields.append("default_markup_pct")
        if tear_off <= 0:
            missing_fields.append("tear_off_per_square")
        if laminated <= 0:
            missing_fields.append("laminated_shingles_per_square")
        if underlayment <= 0:
            missing_fields.append("synthetic_underlayment_per_square")

        return {
            "company_name": company_name,
            "labor_rate_per_square": round(
                labor_rate if labor_rate > 0 else recommended_defaults["labor_rate_per_square"],
                2,
            ),
            "default_markup_pct": round(
                markup_pct if markup_pct > 0 else recommended_defaults["default_markup_pct"],
                2,
            ),
            "tear_off_per_square": round(
                tear_off if tear_off > 0 else recommended_defaults["tear_off_per_square"],
                2,
            ),
            "laminated_shingles_per_square": round(
                laminated if laminated > 0 else recommended_defaults["laminated_shingles_per_square"],
                2,
            ),
            "synthetic_underlayment_per_square": round(
                underlayment if underlayment > 0 else recommended_defaults["synthetic_underlayment_per_square"],
                2,
            ),
            "preferred_supplier": str(material_preferences.get("preferred_supplier", "")).strip(),
            "preferred_shingle_brand": str(material_preferences.get("preferred_shingle_brand", "")).strip(),
            "primary_trade": primary_trade,
            "service_area": service_area,
            "recommended_defaults": recommended_defaults,
            "notes": str(profile.get("notes", "")).strip(),
            "onboarding_complete": len(missing_fields) == 0,
            "missing_fields": missing_fields,
        }

    return await _run_db("get_onboarding_pricing", _query)


async def upsert_onboarding_pricing(
    gc_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Persist pricing onboarding fields to contractor_profile and price_list."""
    from gc_agent.tools import supabase

    gc_value = gc_id.strip()
    if not gc_value:
        raise DatabaseError("upsert_onboarding_pricing failed: gc_id is required")

    def _query() -> None:
        existing_profile = supabase.get_contractor_profile(gc_value) or {}
        pricing_signals = dict(existing_profile.get("pricing_signals") or {})
        material_preferences = dict(existing_profile.get("material_preferences") or {})

        company_name = str(payload.get("company_name", "")).strip() or str(
            existing_profile.get("company_name", "")
        ).strip()
        notes = str(payload.get("notes", "")).strip() or str(existing_profile.get("notes", "")).strip()
        primary_trade = _normalize_primary_trade(
            payload.get("primary_trade") or pricing_signals.get("primary_trade")
        )
        service_area = str(
            payload.get("service_area") or pricing_signals.get("service_area") or ""
        ).strip()
        defaults = get_onboarding_defaults(primary_trade)

        labor_rate = round(
            _to_float(payload.get("labor_rate_per_square")) or defaults["labor_rate_per_square"],
            2,
        )
        markup_pct = round(
            _to_float(payload.get("default_markup_pct")) or defaults["default_markup_pct"],
            2,
        )
        tear_off = round(
            _to_float(payload.get("tear_off_per_square")) or defaults["tear_off_per_square"],
            2,
        )
        laminated = round(
            _to_float(payload.get("laminated_shingles_per_square"))
            or defaults["laminated_shingles_per_square"],
            2,
        )
        underlayment = round(
            _to_float(payload.get("synthetic_underlayment_per_square"))
            or defaults["synthetic_underlayment_per_square"],
            2,
        )

        if labor_rate > 0:
            pricing_signals["labor_rate_per_square"] = labor_rate
        if markup_pct > 0:
            pricing_signals["default_markup_pct"] = markup_pct
        if tear_off > 0:
            pricing_signals["tear_off_per_square"] = tear_off
        if laminated > 0:
            pricing_signals["laminated_shingles_per_square"] = laminated
        if underlayment > 0:
            pricing_signals["synthetic_underlayment_per_square"] = underlayment
        if primary_trade:
            pricing_signals["primary_trade"] = primary_trade
        if service_area:
            pricing_signals["service_area"] = service_area

        supplier = str(payload.get("preferred_supplier", "")).strip()
        shingle_brand = str(payload.get("preferred_shingle_brand", "")).strip()
        if supplier:
            material_preferences["preferred_supplier"] = supplier
        if shingle_brand:
            material_preferences["preferred_shingle_brand"] = shingle_brand

        supabase.upsert_contractor_profile(
            {
                "contractor_id": gc_value,
                "company_name": company_name,
                "preferred_scope_language": list(existing_profile.get("preferred_scope_language") or []),
                "pricing_signals": pricing_signals,
                "material_preferences": material_preferences,
                "notes": notes,
            }
        )
        supabase.upsert_price_list_entries(
            gc_value,
            {
                "labor_rate_per_square": labor_rate,
                "default_markup_pct": markup_pct,
                "tear_off_per_square": tear_off,
                "laminated_shingles_per_square": laminated,
                "synthetic_underlayment_per_square": underlayment,
            },
        )

    await _run_db("upsert_onboarding_pricing", _query)
    return await get_onboarding_pricing(gc_value)


async def write_update_log(
    gc_id: str,
    input_type: str,
    raw_input: str,
    parsed: ParsedIntent | None,
    draft_ids: list[str],
    *,
    trace_id: str = "",
    risk_flags: list[str] | None = None,
    job_id: str | None = None,
    affected_job_ids: list[str] | None = None,
    errors: list[str] | None = None,
) -> None:
    """Persist update processing metadata for auditability and replay."""
    client = get_client()
    parsed_changes = parsed.model_dump(mode="json") if parsed is not None else {}
    if risk_flags:
        parsed_changes["risk_flags"] = [str(flag).strip() for flag in risk_flags if str(flag).strip()]
    if affected_job_ids:
        parsed_changes["affected_job_ids"] = [
            str(value).strip()
            for value in affected_job_ids
            if str(value).strip()
        ]
    if errors:
        parsed_changes["errors"] = [str(value).strip() for value in errors if str(value).strip()]

    payload = {
        "id": uuid4().hex,
        "job_id": str(job_id or "").strip() or None,
        "gc_id": gc_id,
        "input_type": input_type,
        "raw_input": raw_input,
        "parsed_changes": parsed_changes,
        "drafts_created": draft_ids,
        "trace_id": trace_id.strip() or None,
        "created_at": _utcnow_iso(),
    }

    def _query() -> None:
        client.table("update_log").insert(payload).execute()

    try:
        await _run_db("write_update_log", _query)
    except DatabaseError as exc:
        if not _is_missing_column_error(exc):
            raise
        legacy_payload = dict(payload)
        legacy_payload.pop("trace_id", None)

        def _legacy_query() -> None:
            client.table("update_log").insert(legacy_payload).execute()

        await _run_db("write_update_log.legacy", _legacy_query)


async def get_gc_by_clerk_user_id(clerk_user_id: str) -> Optional[str]:
    """Resolve internal GC UUID by Clerk user ID."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("gc_users")
            .select("id")
            .eq("clerk_user_id", clerk_user_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_gc_by_clerk_user_id", _query)
    if not rows:
        return None

    gc_id = str(rows[0].get("id", "")).strip()
    return gc_id or None


async def get_gc_profile_by_clerk_user_id(clerk_user_id: str) -> Optional[dict[str, str]]:
    """Fetch profile fields for the GC mapped to a Clerk user ID."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("gc_users")
            .select("id,name,phone_number,clerk_user_id")
            .eq("clerk_user_id", clerk_user_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_gc_profile_by_clerk_user_id", _query)
    if not rows:
        return None

    row = rows[0]
    return {
        "id": str(row.get("id", "")).strip(),
        "name": str(row.get("name", "")).strip(),
        "phone_number": str(row.get("phone_number", "")).strip(),
        "clerk_user_id": str(row.get("clerk_user_id", "")).strip(),
    }


async def upsert_gc_registration(clerk_user_id: str, phone_number: str) -> dict[str, str]:
    """Create or update gc_users mapping from Clerk user ID to phone number."""
    client = get_client()
    normalized_clerk_id = clerk_user_id.strip()
    normalized_phone = phone_number.strip()
    default_name = "GC User"

    if not normalized_clerk_id:
        raise DatabaseError("upsert_gc_registration failed: clerk_user_id is required")
    if not normalized_phone:
        raise DatabaseError("upsert_gc_registration failed: phone_number is required")

    def _query() -> dict[str, str]:
        by_clerk = (
            client.table("gc_users")
            .select("id,name,phone_number,clerk_user_id")
            .eq("clerk_user_id", normalized_clerk_id)
            .limit(1)
            .execute()
        )
        existing_by_clerk = list(by_clerk.data or [])
        if existing_by_clerk:
            row = existing_by_clerk[0]
            (
                client.table("gc_users")
                .update({"phone_number": normalized_phone})
                .eq("id", row.get("id"))
                .execute()
            )
            return {
                "id": str(row.get("id", "")).strip(),
                "name": str(row.get("name", "")).strip() or default_name,
                "phone_number": normalized_phone,
                "clerk_user_id": normalized_clerk_id,
            }

        by_phone = (
            client.table("gc_users")
            .select("id,name,phone_number,clerk_user_id")
            .eq("phone_number", normalized_phone)
            .limit(1)
            .execute()
        )
        existing_by_phone = list(by_phone.data or [])
        if existing_by_phone:
            row = existing_by_phone[0]
            (
                client.table("gc_users")
                .update({"clerk_user_id": normalized_clerk_id})
                .eq("id", row.get("id"))
                .execute()
            )
            return {
                "id": str(row.get("id", "")).strip(),
                "name": str(row.get("name", "")).strip() or default_name,
                "phone_number": normalized_phone,
                "clerk_user_id": normalized_clerk_id,
            }

        inserted = (
            client.table("gc_users")
            .insert(
                {
                    "phone_number": normalized_phone,
                    "name": default_name,
                    "clerk_user_id": normalized_clerk_id,
                }
            )
            .execute()
        )
        rows = list(inserted.data or [])
        if not rows:
            raise RuntimeError("gc_users insert returned no rows")

        row = rows[0]
        return {
            "id": str(row.get("id", "")).strip(),
            "name": str(row.get("name", "")).strip() or default_name,
            "phone_number": str(row.get("phone_number", "")).strip() or normalized_phone,
            "clerk_user_id": str(row.get("clerk_user_id", "")).strip() or normalized_clerk_id,
        }

    return await _run_db("upsert_gc_registration", _query)


async def get_gc_by_phone(phone_number: str) -> Optional[str]:
    """Look up GC account ID from a registered phone number."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("gc_users")
            .select("id")
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_gc_by_phone", _query)
    if not rows:
        return None

    gc_id = str(rows[0].get("id", "")).strip()
    return gc_id or None


def _days_until(date_value: Any) -> int | None:
    """Return whole days until a target date, or None when missing/unparseable."""
    if isinstance(date_value, datetime):
        target = date_value.date()
    elif isinstance(date_value, str) and date_value.strip():
        text = date_value.strip()
        if "T" in text:
            text = text.split("T", 1)[0]
        try:
            target = date.fromisoformat(text)
        except ValueError:
            return None
    else:
        return None

    today = datetime.now(timezone.utc).date()
    return (target - today).days


def _material_suggestion_for_group(job_type: str) -> list[str]:
    """Return generic material bundle suggestions based on grouped job type."""
    normalized = job_type.lower()
    if "roof" in normalized:
        return [
            "Architectural shingles (bundle order)",
            "Synthetic underlayment rolls",
            "Ice and water shield",
            "Ridge cap + drip edge packs",
        ]
    if "drywall" in normalized:
        return [
            "Drywall sheets by thickness",
            "Joint compound + tape",
            "Corner bead bundles",
            "Fastener cartons",
        ]
    if "concrete" in normalized:
        return [
            "Ready-mix batch scheduling",
            "Rebar + mesh bundles",
            "Form materials",
        ]
    return [
        "Core materials as one supplier PO",
        "Fasteners + consumables restock",
        "Delivery coordination for all grouped jobs",
    ]


async def get_multi_job_insights(gc_id: str, horizon_days: int = 14) -> dict[str, Any]:
    """Generate cross-job ordering opportunities from active jobs in the horizon window."""
    client = get_client()
    gc_value = gc_id.strip()
    if not gc_value:
        raise DatabaseError("get_multi_job_insights failed: gc_id is required")

    clamped_horizon = max(3, min(int(horizon_days or 14), 60))

    def _query() -> dict[str, Any]:
        response = (
            client.table("jobs")
            .select("id,name,type,contract_type,contract_value,est_completion,status,last_updated")
            .eq("gc_id", gc_value)
            .eq("status", "active")
            .order("est_completion")
            .execute()
        )
        rows = [row for row in list(response.data or []) if isinstance(row, dict)]

        grouped: dict[str, dict[str, Any]] = {}
        today = datetime.now(timezone.utc).date()

        for row in rows:
            days_until = _days_until(row.get("est_completion"))
            if days_until is not None and days_until < 0:
                continue
            if days_until is not None and days_until > clamped_horizon:
                continue

            job_type = str(row.get("type", "")).strip() or "general"
            contract_type = str(row.get("contract_type", "")).strip() or "unspecified"
            group_key = f"{job_type.lower()}::{contract_type.lower()}"

            bucket = grouped.setdefault(
                group_key,
                {
                    "job_type": job_type,
                    "contract_type": contract_type,
                    "jobs": [],
                },
            )
            bucket["jobs"].append(
                {
                    "id": str(row.get("id", "")).strip(),
                    "name": str(row.get("name", "")).strip() or "Untitled Job",
                    "est_completion": row.get("est_completion"),
                    "days_until_completion": days_until,
                    "contract_value": _to_float(row.get("contract_value")),
                    "last_updated": row.get("last_updated"),
                }
            )

        opportunities: list[dict[str, Any]] = []
        for group_key, bucket in grouped.items():
            jobs_in_group = [job for job in bucket["jobs"] if str(job.get("id", "")).strip()]
            if len(jobs_in_group) < 2:
                continue

            count = len(jobs_in_group)
            total_value = sum(float(job.get("contract_value") or 0.0) for job in jobs_in_group)
            savings_pct = round(min(3.0 + max(count - 2, 0) * 1.5, 8.0), 2)
            savings_amount = round(total_value * (savings_pct / 100.0), 2) if total_value > 0 else 0.0

            known_completion = sum(
                1
                for job in jobs_in_group
                if isinstance(job.get("days_until_completion"), int)
            )
            confidence = "high" if known_completion == count and total_value > 0 else "medium"
            rationale_parts = [
                f"{count} active {bucket['job_type']} jobs are within the next {clamped_horizon} days.",
                "Combining core material orders can reduce per-job delivery and supplier minimum fees.",
            ]
            if total_value > 0:
                rationale_parts.append(
                    f"Estimated savings is {savings_pct}% of grouped contract value (~${savings_amount:,.0f})."
                )

            opportunities.append(
                {
                    "group_key": group_key,
                    "job_type": bucket["job_type"],
                    "contract_type": bucket["contract_type"],
                    "job_count": count,
                    "jobs": jobs_in_group,
                    "suggested_materials": _material_suggestion_for_group(bucket["job_type"]),
                    "estimated_savings_pct": savings_pct,
                    "estimated_savings_amount": savings_amount,
                    "confidence": confidence,
                    "rationale": " ".join(rationale_parts),
                    "recommended_order_window_days": 2,
                    "generated_at": datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).isoformat(),
                }
            )

        opportunities.sort(
            key=lambda item: (
                float(item.get("estimated_savings_amount") or 0.0),
                int(item.get("job_count") or 0),
            ),
            reverse=True,
        )

        total_jobs_considered = sum(len(bucket["jobs"]) for bucket in grouped.values())
        return {
            "horizon_days": clamped_horizon,
            "generated_at": _utcnow_iso(),
            "summary": {
                "active_jobs_considered": total_jobs_considered,
                "opportunities_found": len(opportunities),
                "estimated_total_savings_amount": round(
                    sum(float(item.get("estimated_savings_amount") or 0.0) for item in opportunities), 2
                ),
            },
            "opportunities": opportunities,
        }

    return await _run_db("get_multi_job_insights", _query)


__all__ = [
    "DatabaseError",
    "get_active_jobs",
    "upsert_job",
    "insert_open_item",
    "resolve_open_item",
    "insert_drafts",
    "get_queued_drafts",
    "get_pending_drafts",
    "get_draft_record",
    "get_draft_by_id",
    "update_draft_status",
    "edit_draft_content",
    "approve_all_queued_drafts",
    "get_actioned_drafts",
    "get_approved_with_edit_drafts",
    "get_recent_update_logs",
    "get_job_audit_timeline",
    "get_usage_analytics",
    "insert_call_transcript",
    "find_existing_call_transcript_for_ingest",
    "update_call_transcript",
    "get_call_transcript_by_id",
    "get_call_transcripts_for_job",
    "get_call_transcripts_for_quote",
    "get_job_call_history",
    "list_recent_call_transcripts",
    "get_related_transcript_review_draft_ids",
    "find_recent_quote_delivery_match",
    "upsert_quote_draft",
    "get_quote_draft_record",
    "get_quote_delivery_attempts",
    "get_quote_followup_state",
    "get_job_followup_state",
    "finalize_quote_draft_feedback",
    "insert_quote_delivery_log",
    "apply_twilio_delivery_status",
    "get_onboarding_defaults",
    "get_onboarding_pricing",
    "upsert_onboarding_pricing",
    "write_update_log",
    "get_gc_by_clerk_user_id",
    "get_gc_profile_by_clerk_user_id",
    "upsert_gc_registration",
    "get_gc_by_phone",
    "get_multi_job_insights",
]
