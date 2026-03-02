"""Database query helpers for GC Agent persistence operations."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from gc_agent.db.client import get_client
from gc_agent.state import Draft, Job, OpenItem, ParsedIntent


class DatabaseError(RuntimeError):
    """Raised when a Supabase operation fails with contextual details."""


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
    }
    return Draft.model_validate(payload)


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


async def _run_db(operation: str, fn: Callable[[], Any]) -> Any:
    """Execute a blocking Supabase operation in a worker thread."""
    try:
        return await asyncio.to_thread(fn)
    except Exception as exc:
        raise DatabaseError(f"{operation} failed: {exc}") from exc


async def get_active_jobs(gc_id: str) -> list[Job]:
    """Fetch active jobs and nested open items for a GC account."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("jobs")
            .select(
                "id,name,type,status,address,contract_value,contract_type,"
                "est_completion,notes,last_updated,open_items(id,job_id,type,description,owner,status,"
                "days_silent,due_date,created_at)"
            )
            .eq("gc_id", gc_id)
            .eq("status", "active")
            .order("name")
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_active_jobs", _query)
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
    payload = {
        "id": item.id,
        "job_id": item.job_id,
        "gc_id": gc_id,
        "type": item.type,
        "description": item.description,
        "owner": item.owner,
        "status": item.status,
        "days_silent": item.days_silent,
        "due_date": item.due_date.isoformat() if item.due_date else None,
    }

    def _query() -> None:
        client.table("open_items").insert(payload).execute()

    await _run_db("insert_open_item", _query)


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
    payload = [
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
        }
        for draft in drafts
    ]

    def _query() -> None:
        client.table("draft_queue").upsert(payload, on_conflict="id").execute()

    await _run_db("insert_drafts", _query)


async def get_queued_drafts(gc_id: str) -> list[Draft]:
    """Return queued drafts for a GC account ordered by most recent first."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(
                "id,job_id,type,title,content,why,status,was_edited,approval_status,"
                "approval_recorded_at,original_content,created_at,jobs(name)"
            )
            .eq("gc_id", gc_id)
            .eq("status", "queued")
            .order("created_at", desc=True)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_queued_drafts", _query)
    try:
        return [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_queued_drafts mapping failed: {exc}") from exc


async def get_pending_drafts(gc_id: str) -> list[Draft]:
    """Return queued or pending drafts for a GC account ordered by most recent first."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(
                "id,job_id,type,title,content,why,status,was_edited,approval_status,"
                "approval_recorded_at,original_content,created_at,jobs(name)"
            )
            .eq("gc_id", gc_id)
            .in_("status", ["queued", "pending"])
            .order("created_at", desc=True)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_pending_drafts", _query)
    try:
        return [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_pending_drafts mapping failed: {exc}") from exc


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

    await _run_db("update_draft_status", _query)


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

    await _run_db("edit_draft_content", _query)


async def get_draft_record(draft_id: str) -> Optional[dict[str, Any]]:
    """Fetch a raw draft row including gc_id for authorization checks."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(
                "id,job_id,gc_id,type,title,content,why,status,was_edited,approval_status,"
                "approval_recorded_at,original_content,created_at,actioned_at,jobs(name)"
            )
            .eq("id", draft_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_draft_record", _query)
    if not rows:
        return None
    return rows[0]


async def get_draft_by_id(draft_id: str) -> Optional[Draft]:
    """Fetch and map a single draft by ID, returning None when not found."""
    row = await get_draft_record(draft_id)
    if row is None:
        return None
    try:
        return _build_draft(row)
    except Exception as exc:
        raise DatabaseError(f"get_draft_by_id mapping failed: {exc}") from exc


async def approve_all_queued_drafts(gc_id: str) -> int:
    """Approve all queued drafts for a GC account in one operation."""
    client = get_client()

    def _query_rows() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select("id,was_edited")
            .eq("gc_id", gc_id)
            .eq("status", "queued")
            .execute()
        )
        return list(response.data or [])

    queued_rows = await _run_db("approve_all_queued_drafts.select", _query_rows)
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

    await _run_db("approve_all_queued_drafts.update", _update_all)
    return len(normalized_rows)


async def get_actioned_drafts(gc_id: str, limit: int = 50) -> list[Draft]:
    """Fetch approved, edited, or discarded drafts ordered by actioned_at desc."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(
                "id,job_id,type,title,content,why,status,was_edited,approval_status,"
                "approval_recorded_at,original_content,created_at,actioned_at,jobs(name)"
            )
            .eq("gc_id", gc_id)
            .in_("status", ["approved", "edited", "discarded"])
            .order("actioned_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_actioned_drafts", _query)
    try:
        return [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_actioned_drafts mapping failed: {exc}") from exc


async def get_approved_with_edit_drafts(gc_id: str, limit: int = 50) -> list[Draft]:
    """Fetch approved drafts that required an edit first, newest first."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("draft_queue")
            .select(
                "id,job_id,type,title,original_content,content,why,status,was_edited,approval_status,"
                "approval_recorded_at,created_at,actioned_at,jobs(name)"
            )
            .eq("gc_id", gc_id)
            .eq("approval_status", "approved_with_edit")
            .order("approval_recorded_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_approved_with_edit_drafts", _query)
    try:
        return [_build_draft(row) for row in rows]
    except Exception as exc:
        raise DatabaseError(f"get_approved_with_edit_drafts mapping failed: {exc}") from exc


async def get_recent_update_logs(gc_id: str, job_id: str, limit: int = 10) -> list[dict[str, Any]]:
    """Return recent update_log rows for a job, newest first."""
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("update_log")
            .select("id,job_id,input_type,raw_input,parsed_changes,drafts_created,created_at")
            .eq("gc_id", gc_id)
            .eq("job_id", job_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return list(response.data or [])

    rows = await _run_db("get_recent_update_logs", _query)
    try:
        return [
            {
                "id": str(row.get("id", "")),
                "job_id": str(row.get("job_id", "")),
                "input_type": str(row.get("input_type", "")),
                "raw_input": str(row.get("raw_input", "")),
                "parsed_changes": row.get("parsed_changes") if isinstance(row.get("parsed_changes"), dict) else {},
                "drafts_created": row.get("drafts_created") if isinstance(row.get("drafts_created"), list) else [],
                "created_at": row.get("created_at"),
            }
            for row in rows
        ]
    except Exception as exc:
        raise DatabaseError(f"get_recent_update_logs mapping failed: {exc}") from exc


async def write_update_log(
    gc_id: str,
    input_type: str,
    raw_input: str,
    parsed: ParsedIntent,
    draft_ids: list[str],
) -> None:
    """Persist update processing metadata for auditability and replay."""
    client = get_client()
    payload = {
        "id": uuid4().hex,
        "job_id": None,
        "gc_id": gc_id,
        "input_type": input_type,
        "raw_input": raw_input,
        "parsed_changes": parsed.model_dump(mode="json"),
        "drafts_created": draft_ids,
        "created_at": _utcnow_iso(),
    }

    def _query() -> None:
        client.table("update_log").insert(payload).execute()

    await _run_db("write_update_log", _query)


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
    "write_update_log",
    "get_gc_by_clerk_user_id",
    "get_gc_profile_by_clerk_user_id",
    "upsert_gc_registration",
    "get_gc_by_phone",
]
