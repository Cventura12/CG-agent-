"""Lightweight Supabase helpers for the v5 estimating path."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, NotRequired, TypedDict, cast
from uuid import uuid4

from gc_agent.db.client import get_client
from gc_agent.db.client import get_postgres_url

LOGGER = logging.getLogger(__name__)


class JobRow(TypedDict):
    """Typed shape for jobs table rows used by the estimate path."""

    id: str
    gc_id: str
    name: str
    type: str
    status: str
    address: str
    contract_value: int
    contract_type: str
    est_completion: str | None
    notes: str
    last_updated: NotRequired[str]
    created_at: NotRequired[str]


class OpenItemRow(TypedDict):
    """Typed shape for open_items table rows."""

    id: str
    job_id: str
    gc_id: str
    type: str
    description: str
    owner: str
    status: str
    days_silent: int
    due_date: str | None
    quote_id: NotRequired[str | None]
    reminder_count: NotRequired[int]
    last_reminder_at: NotRequired[str | None]
    next_due_at: NotRequired[str | None]
    stopped_at: NotRequired[str | None]
    stop_reason: NotRequired[str | None]
    trace_id: NotRequired[str | None]
    created_at: NotRequired[str]
    resolved_at: NotRequired[str | None]


class DraftQueueRow(TypedDict):
    """Typed shape for draft_queue table rows."""

    id: str
    job_id: str
    gc_id: str
    type: str
    title: str
    content: str
    why: str
    status: str
    trace_id: NotRequired[str | None]
    created_at: NotRequired[str]
    actioned_at: NotRequired[str | None]


class UpdateLogRow(TypedDict):
    """Typed shape for update_log table rows."""

    id: str
    gc_id: str
    job_id: str | None
    input_type: str
    raw_input: str
    parsed_changes: dict[str, Any]
    drafts_created: list[Any]
    trace_id: NotRequired[str | None]
    created_at: NotRequired[str]


class PriceListRow(TypedDict):
    """Typed shape for explicit contractor pricing rows."""

    id: str
    contractor_id: str
    item_key: str
    unit_cost: float
    unit: str
    created_at: NotRequired[str]
    updated_at: NotRequired[str]


class EstimatingMemoryRow(TypedDict):
    """Typed shape for estimating_memory rollup rows."""

    id: str
    contractor_id: str
    job_id: str | None
    trade_type: str
    job_type: str
    material_type: str
    avg_waste_factor: float
    labor_hours_per_unit: float
    avg_markup: float
    scope_language_examples: list[str]
    confidence_score: float
    sample_count: int
    source_memory_id: str | None
    created_at: NotRequired[str]
    last_updated: NotRequired[str]


class JobMemoryRow(TypedDict):
    """Typed shape for job_memory table rows."""

    id: str
    contractor_id: str
    job_id: str | None
    scope_text: str
    summary: str
    embedding: list[float] | None
    metadata: dict[str, Any]
    distance: NotRequired[float]
    created_at: NotRequired[str]


class ContractorProfileRow(TypedDict):
    """Typed shape for contractor_profile table rows."""

    contractor_id: str
    company_name: str
    preferred_scope_language: list[str]
    pricing_signals: dict[str, Any]
    material_preferences: dict[str, Any]
    notes: str
    updated_at: NotRequired[str]
    created_at: NotRequired[str]


def _utcnow_iso() -> str:
    """Return an ISO UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _get_client_or_none() -> Any:
    """Return a configured Supabase client, or None when env is missing."""
    try:
        return get_client()
    except Exception as exc:
        LOGGER.debug("Supabase helper unavailable: %s", exc)
        return None


def _rows(response: Any) -> list[dict[str, Any]]:
    """Normalize a Supabase response into a list of row dicts."""
    data = getattr(response, "data", None)
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _normalize_text(value: Any) -> str:
    """Normalize a scalar for matching."""
    return " ".join(str(value or "").strip().lower().split())


def _to_float_list(value: Any) -> list[float]:
    """Normalize an arbitrary embedding payload into float values."""
    if not isinstance(value, list):
        return []

    floats: list[float] = []
    for item in value:
        try:
            floats.append(float(item))
        except Exception:
            continue
    return floats


def _cosine_distance(left: list[float], right: list[float]) -> float:
    """Compute cosine distance between two vectors."""
    if not left or not right or len(left) != len(right):
        return 1.0

    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 1.0

    cosine_similarity = dot / (left_norm * right_norm)
    cosine_similarity = max(min(cosine_similarity, 1.0), -1.0)
    return 1.0 - cosine_similarity


def _vector_literal(embedding: list[float]) -> str:
    """Render a pgvector literal from a Python list of floats."""
    return "[" + ",".join(f"{value:.10f}" for value in embedding) + "]"


def _to_float(value: Any) -> float:
    """Normalize numeric-like values into floats."""
    try:
        return float(value)
    except Exception:
        return 0.0


def _dedupe_strings(values: list[Any], limit: int = 6) -> list[str]:
    """Normalize, dedupe, and cap string lists."""
    deduped: list[str] = []
    seen: set[str] = set()
    for item in values:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(text)
        if len(deduped) >= limit:
            break
    return deduped


def list_jobs(gc_id: str) -> list[JobRow]:
    """Return all jobs for a GC ordered by recent update."""
    client = _get_client_or_none()
    gc_value = gc_id.strip()
    if client is None or not gc_value:
        return []

    response = (
        client.table("jobs")
        .select(
            "id,gc_id,name,type,status,address,contract_value,contract_type,"
            "est_completion,notes,last_updated,created_at"
        )
        .eq("gc_id", gc_value)
        .order("last_updated", desc=True)
        .execute()
    )
    return [cast(JobRow, row) for row in _rows(response)]


def upsert_job(row: JobRow) -> JobRow | None:
    """Upsert a jobs table row and return the normalized payload."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: JobRow = {
        "id": str(row["id"]).strip(),
        "gc_id": str(row["gc_id"]).strip(),
        "name": str(row["name"]).strip(),
        "type": str(row["type"]).strip() or "roof estimate",
        "status": str(row.get("status", "active")).strip() or "active",
        "address": str(row.get("address", "")).strip(),
        "contract_value": int(row.get("contract_value") or 0),
        "contract_type": str(row.get("contract_type", "TBD")).strip() or "TBD",
        "est_completion": str(row.get("est_completion") or "").strip() or None,
        "notes": str(row.get("notes", "")).strip(),
        "last_updated": _utcnow_iso(),
    }
    client.table("jobs").upsert(payload, on_conflict="id").execute()
    return payload


def find_job_by_address_or_customer(
    gc_id: str,
    address: str = "",
    customer_name: str = "",
) -> JobRow | None:
    """Find the best matching job using address first, then customer-style name."""
    address_key = _normalize_text(address)
    customer_key = _normalize_text(customer_name)
    if not address_key and not customer_key:
        return None

    for row in list_jobs(gc_id):
        row_address = _normalize_text(row.get("address", ""))
        row_name = _normalize_text(row.get("name", ""))
        if row_address and address_key and (address_key in row_address or row_address in address_key):
            return row
        if row_name and customer_key and (customer_key in row_name or row_name in customer_key):
            return row
    return None


def list_open_items(gc_id: str, job_id: str | None = None) -> list[OpenItemRow]:
    """Return open items for a GC, optionally filtered to one job."""
    client = _get_client_or_none()
    gc_value = gc_id.strip()
    if client is None or not gc_value:
        return []

    query = (
        client.table("open_items")
        .select(
            "id,job_id,gc_id,type,description,owner,status,days_silent,"
            "due_date,quote_id,reminder_count,last_reminder_at,next_due_at,"
            "stopped_at,stop_reason,trace_id,created_at,resolved_at"
        )
        .eq("gc_id", gc_value)
        .order("created_at", desc=True)
    )
    if job_id and job_id.strip():
        query = query.eq("job_id", job_id.strip())

    response = query.execute()
    return [cast(OpenItemRow, row) for row in _rows(response)]


def insert_open_item(row: OpenItemRow) -> OpenItemRow | None:
    """Insert a single open item row."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: OpenItemRow = {
        "id": str(row["id"]).strip(),
        "job_id": str(row["job_id"]).strip(),
        "gc_id": str(row["gc_id"]).strip(),
        "type": str(row["type"]).strip(),
        "description": str(row["description"]).strip(),
        "owner": str(row.get("owner", "GC")).strip() or "GC",
        "status": str(row.get("status", "open")).strip() or "open",
        "days_silent": int(row.get("days_silent") or 0),
        "due_date": str(row.get("due_date") or "").strip() or None,
        "quote_id": str(row.get("quote_id") or "").strip() or None,
        "reminder_count": int(row.get("reminder_count") or 0),
        "last_reminder_at": str(row.get("last_reminder_at") or "").strip() or None,
        "next_due_at": str(row.get("next_due_at") or "").strip() or None,
        "stopped_at": str(row.get("stopped_at") or "").strip() or None,
        "stop_reason": str(row.get("stop_reason") or "").strip() or None,
        "trace_id": str(row.get("trace_id") or "").strip() or None,
    }
    client.table("open_items").insert(payload).execute()
    return payload


def update_open_item(
    item_id: str,
    gc_id: str,
    fields: dict[str, Any],
) -> dict[str, Any] | None:
    """Update an open item row and return the applied payload."""
    client = _get_client_or_none()
    item_value = item_id.strip()
    gc_value = gc_id.strip()
    if client is None or not item_value or not gc_value:
        return None

    payload = dict(fields)
    client.table("open_items").update(payload).eq("id", item_value).eq("gc_id", gc_value).execute()
    return payload


def list_draft_queue(gc_id: str) -> list[DraftQueueRow]:
    """Return draft queue rows for a GC."""
    client = _get_client_or_none()
    gc_value = gc_id.strip()
    if client is None or not gc_value:
        return []

    response = (
        client.table("draft_queue")
        .select("id,job_id,gc_id,type,title,content,why,status,trace_id,created_at,actioned_at")
        .eq("gc_id", gc_value)
        .order("created_at", desc=True)
        .execute()
    )
    return [cast(DraftQueueRow, row) for row in _rows(response)]


def upsert_draft_queue(row: DraftQueueRow) -> DraftQueueRow | None:
    """Upsert a draft_queue row."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: DraftQueueRow = {
        "id": str(row["id"]).strip(),
        "job_id": str(row["job_id"]).strip(),
        "gc_id": str(row["gc_id"]).strip(),
        "type": str(row["type"]).strip(),
        "title": str(row["title"]).strip(),
        "content": str(row["content"]).strip(),
        "why": str(row["why"]).strip(),
        "status": str(row.get("status", "queued")).strip() or "queued",
        "trace_id": str(row.get("trace_id") or "").strip() or None,
    }
    client.table("draft_queue").upsert(payload, on_conflict="id").execute()
    return payload


def list_update_logs(gc_id: str) -> list[UpdateLogRow]:
    """Return recent update_log rows for a GC."""
    client = _get_client_or_none()
    gc_value = gc_id.strip()
    if client is None or not gc_value:
        return []

    response = (
        client.table("update_log")
        .select("id,gc_id,job_id,input_type,raw_input,parsed_changes,drafts_created,trace_id,created_at")
        .eq("gc_id", gc_value)
        .order("created_at", desc=True)
        .execute()
    )
    return [cast(UpdateLogRow, row) for row in _rows(response)]


def insert_update_log(row: UpdateLogRow) -> UpdateLogRow | None:
    """Insert an update_log row."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: UpdateLogRow = {
        "id": str(row["id"]).strip(),
        "gc_id": str(row["gc_id"]).strip(),
        "job_id": str(row.get("job_id") or "").strip() or None,
        "input_type": str(row.get("input_type", "estimate")).strip() or "estimate",
        "raw_input": str(row.get("raw_input", "")).strip(),
        "parsed_changes": dict(row.get("parsed_changes") or {}),
        "drafts_created": list(row.get("drafts_created") or []),
        "trace_id": str(row.get("trace_id") or "").strip() or None,
        "created_at": _utcnow_iso(),
    }
    client.table("update_log").insert(payload).execute()
    return payload


def list_price_list(contractor_id: str) -> list[PriceListRow]:
    """Return explicit contractor pricing rows."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value:
        return []

    response = (
        client.table("price_list")
        .select("id,contractor_id,item_key,unit_cost,unit,created_at,updated_at")
        .eq("contractor_id", contractor_value)
        .order("item_key")
        .execute()
    )
    return [cast(PriceListRow, row) for row in _rows(response)]


def get_price_list_map(contractor_id: str) -> dict[str, float]:
    """Return contractor price_list rows as a calculate_materials-friendly dict."""
    pricing: dict[str, float] = {}
    for row in list_price_list(contractor_id):
        key = str(row.get("item_key", "")).strip()
        if not key:
            continue
        pricing[key] = round(_to_float(row.get("unit_cost")), 2)
    return pricing


def upsert_price_list_entries(contractor_id: str, pricing: dict[str, Any]) -> dict[str, float]:
    """Upsert explicit contractor pricing rows from a pricing-context mapping."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value or not isinstance(pricing, dict):
        return {}

    persisted: dict[str, float] = {}
    for item_key, raw_value in pricing.items():
        normalized_key = str(item_key or "").strip()
        numeric = round(_to_float(raw_value), 2)
        if not normalized_key or numeric <= 0:
            continue

        existing = (
            client.table("price_list")
            .select("id")
            .eq("contractor_id", contractor_value)
            .eq("item_key", normalized_key)
            .limit(1)
            .execute()
        )
        existing_rows = _rows(existing)
        payload: PriceListRow = {
            "id": str(existing_rows[0].get("id", "")).strip() or f"price-{uuid4().hex[:12]}",
            "contractor_id": contractor_value,
            "item_key": normalized_key,
            "unit_cost": numeric,
            "unit": "unit",
            "updated_at": _utcnow_iso(),
        }
        if not existing_rows:
            payload["created_at"] = payload["updated_at"]

        client.table("price_list").upsert(payload, on_conflict="id").execute()
        persisted[normalized_key] = numeric

    return persisted


def upsert_price_list_rows(contractor_id: str, rows: list[dict[str, Any]]) -> list[PriceListRow]:
    """Upsert explicit contractor pricing rows while preserving units from imports."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value or not isinstance(rows, list):
        return []

    existing_rows = (
        client.table("price_list")
        .select("id,item_key")
        .eq("contractor_id", contractor_value)
        .execute()
    )
    existing_ids = {
        str(row.get("item_key", "")).strip(): str(row.get("id", "")).strip()
        for row in _rows(existing_rows)
        if str(row.get("item_key", "")).strip()
    }

    payloads: list[PriceListRow] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        item_key = str(row.get("item_key", "")).strip()
        unit = str(row.get("unit", "")).strip() or "unit"
        unit_cost = round(_to_float(row.get("unit_cost")), 2)
        if not item_key or unit_cost <= 0:
            continue

        price_id = existing_ids.get(item_key) or f"price-{uuid4().hex[:12]}"
        payload: PriceListRow = {
            "id": price_id,
            "contractor_id": contractor_value,
            "item_key": item_key,
            "unit_cost": unit_cost,
            "unit": unit,
            "updated_at": _utcnow_iso(),
        }
        if item_key not in existing_ids:
            payload["created_at"] = payload["updated_at"]
        payloads.append(payload)
        existing_ids[item_key] = price_id

    if not payloads:
        return []

    client.table("price_list").upsert(payloads, on_conflict="id").execute()
    return payloads


def list_job_memory(contractor_id: str) -> list[JobMemoryRow]:
    """Return recent job_memory rows for a contractor."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value:
        return []

    response = (
        client.table("job_memory")
        .select("id,contractor_id,job_id,scope_text,summary,embedding,metadata,created_at")
        .eq("contractor_id", contractor_value)
        .order("created_at", desc=True)
        .execute()
    )
    return [cast(JobMemoryRow, row) for row in _rows(response)]


def insert_job_memory(row: JobMemoryRow) -> JobMemoryRow | None:
    """Insert a job_memory row."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: JobMemoryRow = {
        "id": str(row["id"]).strip(),
        "contractor_id": str(row["contractor_id"]).strip(),
        "job_id": str(row.get("job_id") or "").strip() or None,
        "scope_text": str(row.get("scope_text", "")).strip(),
        "summary": str(row.get("summary", "")).strip(),
        "embedding": list(row.get("embedding") or []) or None,
        "metadata": dict(row.get("metadata") or {}),
        "created_at": _utcnow_iso(),
    }
    client.table("job_memory").insert(payload).execute()
    return payload


def list_estimating_memory(contractor_id: str) -> list[EstimatingMemoryRow]:
    """Return estimating_memory rollup rows for a contractor."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value:
        return []

    response = (
        client.table("estimating_memory")
        .select(
            "id,contractor_id,job_id,trade_type,job_type,material_type,"
            "avg_waste_factor,labor_hours_per_unit,avg_markup,scope_language_examples,"
            "confidence_score,sample_count,source_memory_id,created_at,last_updated"
        )
        .eq("contractor_id", contractor_value)
        .order("confidence_score", desc=True)
        .order("last_updated", desc=True)
        .execute()
    )
    return [cast(EstimatingMemoryRow, row) for row in _rows(response)]


def get_best_estimating_memory(
    contractor_id: str,
    trade_type: str = "",
    job_type: str = "",
    material_type: str = "",
) -> EstimatingMemoryRow | None:
    """Return the highest-confidence estimating_memory row that matches the requested scope."""
    trade_key = str(trade_type or "").strip().lower()
    job_key = str(job_type or "").strip().lower()
    material_key = str(material_type or "").strip().lower()

    best_score = -1.0
    best_row: EstimatingMemoryRow | None = None
    for row in list_estimating_memory(contractor_id):
        row_trade = str(row.get("trade_type", "")).strip().lower()
        row_job = str(row.get("job_type", "")).strip().lower()
        row_material = str(row.get("material_type", "")).strip().lower()

        if trade_key and row_trade and row_trade != trade_key:
            continue
        if job_key and row_job and row_job != job_key:
            continue
        if material_key and row_material and row_material != material_key:
            continue

        score = _to_float(row.get("confidence_score"))
        if score > best_score:
            best_score = score
            best_row = row

    return best_row


def upsert_estimating_memory(row: EstimatingMemoryRow) -> EstimatingMemoryRow | None:
    """Insert or roll up an estimating_memory row by contractor/trade/job/material key."""
    client = _get_client_or_none()
    if client is None:
        return None

    contractor_value = str(row.get("contractor_id", "")).strip()
    trade_value = str(row.get("trade_type", "")).strip()
    job_value = str(row.get("job_type", "")).strip()
    material_value = str(row.get("material_type", "")).strip()
    if not contractor_value or not trade_value or not job_value:
        return None

    existing = (
        client.table("estimating_memory")
        .select(
            "id,contractor_id,job_id,trade_type,job_type,material_type,"
            "avg_waste_factor,labor_hours_per_unit,avg_markup,scope_language_examples,"
            "confidence_score,sample_count,source_memory_id,created_at,last_updated"
        )
        .eq("contractor_id", contractor_value)
        .eq("trade_type", trade_value)
        .eq("job_type", job_value)
        .eq("material_type", material_value)
        .limit(1)
        .execute()
    )
    existing_rows = _rows(existing)

    sample_count = max(int(row.get("sample_count") or 1), 1)
    payload: EstimatingMemoryRow = {
        "id": str(row.get("id", "")).strip() or f"estimating-memory-{uuid4().hex[:12]}",
        "contractor_id": contractor_value,
        "job_id": str(row.get("job_id") or "").strip() or None,
        "trade_type": trade_value,
        "job_type": job_value,
        "material_type": material_value,
        "avg_waste_factor": round(_to_float(row.get("avg_waste_factor")), 4),
        "labor_hours_per_unit": round(_to_float(row.get("labor_hours_per_unit")), 4),
        "avg_markup": round(_to_float(row.get("avg_markup")), 4),
        "scope_language_examples": _dedupe_strings(list(row.get("scope_language_examples") or [])),
        "source_memory_id": str(row.get("source_memory_id") or "").strip() or None,
        "last_updated": _utcnow_iso(),
        "sample_count": sample_count,
        "confidence_score": round(min(1.0, sample_count / 10.0), 4),
    }

    if existing_rows:
        existing_row = existing_rows[0]
        previous_samples = max(int(existing_row.get("sample_count") or 0), 0)
        combined_samples = previous_samples + sample_count

        def _weighted(existing_value: Any, new_value: Any) -> float:
            current = _to_float(existing_value)
            incoming = _to_float(new_value)
            if previous_samples <= 0:
                return round(incoming, 4)
            if incoming <= 0:
                return round(current, 4)
            total = (current * previous_samples) + (incoming * sample_count)
            return round(total / combined_samples, 4)

        merged_examples = _dedupe_strings(
            list(existing_row.get("scope_language_examples") or [])
            + list(payload["scope_language_examples"])
        )
        payload.update(
            {
                "id": str(existing_row.get("id", "")).strip() or payload["id"],
                "avg_waste_factor": _weighted(existing_row.get("avg_waste_factor"), payload["avg_waste_factor"]),
                "labor_hours_per_unit": _weighted(
                    existing_row.get("labor_hours_per_unit"),
                    payload["labor_hours_per_unit"],
                ),
                "avg_markup": _weighted(existing_row.get("avg_markup"), payload["avg_markup"]),
                "scope_language_examples": merged_examples,
                "sample_count": combined_samples,
                "confidence_score": round(min(1.0, combined_samples / 10.0), 4),
            }
        )
        client.table("estimating_memory").update(payload).eq("id", payload["id"]).execute()
        return payload

    payload["created_at"] = payload["last_updated"]
    client.table("estimating_memory").insert(payload).execute()
    return payload


def search_job_memory_by_embedding(
    contractor_id: str,
    embedding: list[float],
    limit: int = 3,
) -> list[JobMemoryRow]:
    """Search job_memory by cosine distance, using pgvector when available."""
    contractor_value = contractor_id.strip()
    normalized_embedding = _to_float_list(embedding)
    capped_limit = max(1, int(limit))
    if not contractor_value or not normalized_embedding:
        return []

    postgres_url = get_postgres_url()
    if postgres_url:
        try:
            import psycopg
            from psycopg.rows import dict_row

            vector_value = _vector_literal(normalized_embedding)
            query = """
                select
                    id,
                    contractor_id,
                    job_id,
                    scope_text,
                    summary,
                    metadata,
                    created_at,
                    embedding <=> %s::vector as distance
                from public.job_memory
                where contractor_id = %s
                order by embedding <=> %s::vector
                limit %s
            """
            with psycopg.connect(postgres_url, row_factory=dict_row) as conn:
                rows = conn.execute(
                    query,
                    (vector_value, contractor_value, vector_value, capped_limit),
                ).fetchall()
            return [cast(JobMemoryRow, dict(row)) for row in rows if isinstance(row, dict)]
        except Exception as exc:
            LOGGER.warning("pgvector search failed; using local cosine fallback: %s", exc)

    ranked: list[JobMemoryRow] = []
    for row in list_job_memory(contractor_value):
        stored_embedding = _to_float_list(row.get("embedding"))
        ranked_row = dict(row)
        ranked_row["distance"] = _cosine_distance(normalized_embedding, stored_embedding)
        ranked.append(cast(JobMemoryRow, ranked_row))

    ranked.sort(key=lambda item: float(item.get("distance", 1.0)))
    return ranked[:capped_limit]


def get_contractor_profile(contractor_id: str) -> ContractorProfileRow | None:
    """Return a contractor profile row when present."""
    client = _get_client_or_none()
    contractor_value = contractor_id.strip()
    if client is None or not contractor_value:
        return None

    response = (
        client.table("contractor_profile")
        .select(
            "contractor_id,company_name,preferred_scope_language,pricing_signals,"
            "material_preferences,notes,updated_at,created_at"
        )
        .eq("contractor_id", contractor_value)
        .limit(1)
        .execute()
    )
    rows = _rows(response)
    if not rows:
        return None
    return cast(ContractorProfileRow, rows[0])


def upsert_contractor_profile(row: ContractorProfileRow) -> ContractorProfileRow | None:
    """Upsert a contractor profile row."""
    client = _get_client_or_none()
    if client is None:
        return None

    payload: ContractorProfileRow = {
        "contractor_id": str(row["contractor_id"]).strip(),
        "company_name": str(row.get("company_name", "")).strip(),
        "preferred_scope_language": list(row.get("preferred_scope_language") or []),
        "pricing_signals": dict(row.get("pricing_signals") or {}),
        "material_preferences": dict(row.get("material_preferences") or {}),
        "notes": str(row.get("notes", "")).strip(),
        "updated_at": _utcnow_iso(),
    }
    client.table("contractor_profile").upsert(payload, on_conflict="contractor_id").execute()
    return payload


__all__ = [
    "EstimatingMemoryRow",
    "ContractorProfileRow",
    "DraftQueueRow",
    "JobMemoryRow",
    "JobRow",
    "OpenItemRow",
    "PriceListRow",
    "UpdateLogRow",
    "find_job_by_address_or_customer",
    "get_best_estimating_memory",
    "get_contractor_profile",
    "get_price_list_map",
    "insert_job_memory",
    "insert_open_item",
    "insert_update_log",
    "list_draft_queue",
    "list_estimating_memory",
    "list_job_memory",
    "list_jobs",
    "list_open_items",
    "list_price_list",
    "list_update_logs",
    "search_job_memory_by_embedding",
    "update_open_item",
    "upsert_contractor_profile",
    "upsert_draft_queue",
    "upsert_estimating_memory",
    "upsert_job",
    "upsert_price_list_entries",
    "upsert_price_list_rows",
]
