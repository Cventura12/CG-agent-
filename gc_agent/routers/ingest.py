"""Normalized ingress route for future voice-capable input surfaces."""

from __future__ import annotations

from importlib import import_module
from uuid import uuid4

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.input_surface import InboundInput, to_agent_state

router = APIRouter(tags=["ingest"])


def _success(data: dict[str, object]) -> dict[str, object]:
    """Return a standard success envelope for the ingress route."""
    return {
        "success": True,
        "data": data,
        "error": None,
    }


def _error(status_code: int, message: str) -> JSONResponse:
    """Return a standard error envelope."""
    return JSONResponse(
        status_code=status_code,
        content={
            "success": False,
            "data": None,
            "error": message,
        },
    )


async def _run_single_input(*args: object, **kwargs: object):
    """Lazily import the CLI runner so auth-only imports stay light."""
    cli_module = import_module("gc_agent.cli")
    return await cli_module.run_single_input(*args, **kwargs)


@router.post("/ingest", response_model=None)
async def ingest_input(
    payload: InboundInput,
    current_gc: str = Depends(get_current_gc),
) -> dict[str, object] | JSONResponse:
    """Normalize one inbound payload and dispatch to the existing runtime paths."""
    try:
        resolved_gc_id = payload.gc_id.strip() or (await queries.get_gc_by_clerk_user_id(current_gc) or "")
    except DatabaseError as exc:
        return _error(500, str(exc))

    if not resolved_gc_id:
        return _error(404, "GC profile not found")

    trace_id = payload.external_id.strip() or uuid4().hex
    normalized_state = to_agent_state(payload, trace_id=trace_id, gc_id=resolved_gc_id)

    if payload.intent == "update":
        graph_module = import_module("gc_agent.graph")
        state = await graph_module.run_update(
            raw_input=normalized_state.raw_input,
            gc_id=resolved_gc_id,
            from_number=normalized_state.from_number,
            input_type=normalized_state.input_type,
            trace_id=trace_id,
        )
        return _success(
            {
                "mode": "update",
                "trace_id": state.trace_id,
                "risk_flags": state.risk_flags,
                "draft_actions": [draft.model_dump(mode="json") for draft in state.drafts_created],
                "errors": state.errors,
            }
        )

    if payload.intent == "briefing":
        graph_module = import_module("gc_agent.graph")
        briefing = await graph_module.run_briefing(resolved_gc_id, trace_id=trace_id)
        return _success(
            {
                "mode": "briefing",
                "trace_id": trace_id,
                "briefing": briefing,
            }
        )

    state = await _run_single_input(
        normalized_state.raw_input,
        session_id=trace_id,
        gc_id=resolved_gc_id,
    )
    return _success(
        {
            "mode": state.mode or "estimate",
            "trace_id": state.trace_id,
            "active_job_id": state.active_job_id,
            "quote_draft": state.quote_draft,
            "rendered_quote": state.rendered_quote,
            "clarification_questions": state.clarification_questions,
            "risk_flags": state.risk_flags,
            "draft_actions": [draft.model_dump(mode="json") for draft in state.drafts_created],
            "errors": state.errors,
        }
    )


__all__ = ["router", "ingest_input"]
