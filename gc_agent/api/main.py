"""Day 16 starter FastAPI layer for quote and queue workflows."""

from __future__ import annotations

import os
from importlib import import_module
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from gc_agent.api.quote_pdf import render_quote_pdf
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.nodes.send_and_track import send_and_track
from gc_agent.nodes.update_memory import update_memory
from gc_agent.state import AgentState, Draft

DEFAULT_ESTIMATE_GC_ID = (
    os.getenv("GC_AGENT_DEFAULT_GC_ID", "").strip()
    or "00000000-0000-0000-0000-000000000001"
)
APP_VERSION = "0.1"
app = FastAPI(title="GC Agent API", version=APP_VERSION)
QUOTE_DOCUMENT_CACHE: dict[str, dict[str, Any]] = {}


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

    async def run_briefing(self, *args: Any, **kwargs: Any) -> Any:
        return await self._resolve().run_briefing(*args, **kwargs)


graph = _GraphProxy()


async def run_single_estimate(*args: Any, **kwargs: Any) -> Any:
    """Lazily import the estimate CLI runner only when the quote endpoint needs it."""
    cli_module = import_module("gc_agent.cli")
    return await cli_module.run_single_estimate(*args, **kwargs)


class QuoteRequest(BaseModel):
    """Request body for generating a quote from field notes or a transcript."""

    input: str = Field(min_length=1)
    contractor_id: str = Field(default=DEFAULT_ESTIMATE_GC_ID, min_length=1)
    session_id: str = ""


class ApproveDraftRequest(BaseModel):
    """Request body for approving a queued draft."""

    contractor_id: str = Field(min_length=1)


class UpdateRequest(BaseModel):
    """Request body for routing a job update into the v4 path."""

    input: str = Field(min_length=1)
    contractor_id: str = Field(min_length=1)


class EditDraftRequest(BaseModel):
    """Request body for editing a draft before approval."""

    contractor_id: str = Field(min_length=1)
    content: str = Field(min_length=1)


def _serialize_draft(draft: Draft) -> dict[str, Any]:
    """Serialize a Draft model into JSON-safe response data."""
    return draft.model_dump(mode="json")


def _serialize_job(job: Any) -> dict[str, Any]:
    """Serialize a Job model into JSON-safe response data."""
    if hasattr(job, "model_dump"):
        return job.model_dump(mode="json")
    return dict(job)


def _api_key_map() -> dict[str, str]:
    """Parse simple per-contractor API keys from environment."""
    mapping: dict[str, str] = {}

    raw = os.getenv("GC_AGENT_API_KEYS", "").strip()
    for pair in raw.split(","):
        contractor_id, separator, api_key = pair.strip().partition(":")
        if not separator:
            continue
        normalized_contractor = contractor_id.strip()
        normalized_key = api_key.strip()
        if normalized_contractor and normalized_key:
            mapping[normalized_contractor] = normalized_key

    fallback_key = os.getenv("GC_AGENT_API_KEY", "").strip()
    if fallback_key:
        mapping.setdefault(DEFAULT_ESTIMATE_GC_ID, fallback_key)

    return mapping


def _authorize(contractor_id: str, api_key: str | None) -> None:
    """Enforce the simple Day 17 API key header check."""
    normalized_contractor = contractor_id.strip()
    supplied_key = (api_key or "").strip()

    if not supplied_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header is required",
        )

    expected_key = _api_key_map().get(normalized_contractor)
    if not expected_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="contractor API key is not configured",
        )

    if supplied_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="invalid API key",
        )


@app.post("/quote")
async def create_quote(
    payload: QuoteRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Run the v5 estimating path and return the generated quote payload."""
    _authorize(payload.contractor_id, x_api_key)

    try:
        state = await run_single_estimate(
            payload.input,
            session_id=payload.session_id,
            gc_id=payload.contractor_id,
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

    quote_id = payload.session_id.strip() or str(uuid4())
    QUOTE_DOCUMENT_CACHE[quote_id] = {
        "contractor_id": payload.contractor_id,
        "quote_draft": dict(state.quote_draft),
        "rendered_quote": state.rendered_quote,
        "active_job_id": state.active_job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "quote_id": quote_id,
        "quote_draft": state.quote_draft,
        "rendered_quote": state.rendered_quote,
        "active_job_id": state.active_job_id,
        "errors": state.errors,
    }


@app.get("/quote/{quote_id}/pdf")
async def get_quote_pdf(
    quote_id: str,
    contractor_id: str = Query(..., min_length=1),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> Response:
    """Render and return a stored quote draft as a PDF document."""
    _authorize(contractor_id, x_api_key)

    record = QUOTE_DOCUMENT_CACHE.get(quote_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="quote_id not found")

    if str(record.get("contractor_id", "")).strip() != contractor_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="quote does not belong to contractor")

    try:
        pdf_bytes = render_quote_pdf(quote_id, dict(record.get("quote_draft") or {}))
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
        },
    )


@app.get("/queue")
async def get_queue(
    contractor_id: str = Query(..., min_length=1),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Return queued or pending drafts for the given contractor."""
    _authorize(contractor_id, x_api_key)

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


@app.post("/queue/{draft_id}/approve")
async def approve_queue_item(
    draft_id: str,
    payload: ApproveDraftRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Approve one draft, then hand it to the send-and-track placeholder."""
    _authorize(payload.contractor_id, x_api_key)

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
    return {
        "draft": _serialize_draft(updated),
        "send_result": send_result,
    }


@app.post("/update")
async def post_update(
    payload: UpdateRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Run the v4 job-update path and return created draft actions."""
    _authorize(payload.contractor_id, x_api_key)

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
        "draft_actions": [_serialize_draft(draft) for draft in state.drafts_created],
        "risk_flags": state.risk_flags,
        "errors": state.errors,
    }


@app.get("/briefing")
async def get_briefing(
    contractor_id: str = Query(..., min_length=1),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Generate and return the latest morning briefing for a contractor."""
    _authorize(contractor_id, x_api_key)

    try:
        briefing = await graph.run_briefing(contractor_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"briefing generation failed: {exc}",
        ) from exc

    return {"briefing": briefing}


@app.get("/jobs")
async def get_jobs(
    contractor_id: str = Query(..., min_length=1),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Return active jobs for a contractor."""
    _authorize(contractor_id, x_api_key)

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


@app.post("/queue/{draft_id}/edit")
async def edit_queue_item(
    draft_id: str,
    payload: EditDraftRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Save edited content and keep the draft queued for final approval."""
    _authorize(payload.contractor_id, x_api_key)

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

    return {"draft": _serialize_draft(updated)}


@app.post("/queue/{draft_id}/discard")
async def discard_queue_item(
    draft_id: str,
    payload: ApproveDraftRequest,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> dict[str, Any]:
    """Discard a draft and trigger the discard no-op memory hook."""
    _authorize(payload.contractor_id, x_api_key)

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
        "draft": _serialize_draft(updated),
        "memory_result": memory_result,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    """Return lightweight service health for the starter API."""
    return {"status": "ok", "version": APP_VERSION}


__all__ = [
    "app",
    "create_quote",
    "get_quote_pdf",
    "get_queue",
    "approve_queue_item",
    "post_update",
    "get_briefing",
    "get_jobs",
    "edit_queue_item",
    "discard_queue_item",
    "QUOTE_DOCUMENT_CACHE",
]
