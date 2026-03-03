"""Minimal production telemetry for GC Agent node execution."""

from __future__ import annotations

import hashlib
import logging
import time
from contextvars import ContextVar
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable
from uuid import uuid4

from gc_agent.state import AgentState

LOGGER = logging.getLogger(__name__)

NodeCallable = Callable[[AgentState], Awaitable[dict[str, Any]]]

_MODEL_USAGE: ContextVar[dict[str, Any] | None] = ContextVar("gc_agent_model_usage", default=None)
_TRACE_DISABLED = False


def _utcnow_iso() -> str:
    """Return timezone-aware UTC timestamp as an ISO string."""
    return datetime.now(timezone.utc).isoformat()


def prompt_hash(prompt_text: str) -> str | None:
    """Return a stable hash for a concrete prompt string."""
    if not isinstance(prompt_text, str) or not prompt_text.strip():
        return None
    return hashlib.sha256(prompt_text.encode("utf-8")).hexdigest()


def build_prompt_hash(prompt_text: str) -> str | None:
    """Backward-compatible alias for prompt_hash."""
    return prompt_hash(prompt_text)


def reset_model_usage() -> None:
    """Clear any previously captured usage for the current async context."""
    _MODEL_USAGE.set(None)


def record_model_usage(
    *,
    model_name: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    """Capture the latest model usage for the current async context."""
    _MODEL_USAGE.set(
        {
            "model_name": model_name.strip() if isinstance(model_name, str) else "",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }
    )


def consume_model_usage() -> dict[str, Any]:
    """Return and clear the latest captured model usage."""
    usage = _MODEL_USAGE.get() or {}
    _MODEL_USAGE.set(None)
    return dict(usage)


def _json_safe(value: Any, *, max_chars: int = 2000) -> Any:
    """Convert arbitrary values into compact JSON-safe payloads."""
    if hasattr(value, "model_dump"):
        return _json_safe(value.model_dump(mode="json"), max_chars=max_chars)

    if isinstance(value, dict):
        payload: dict[str, Any] = {}
        for key, item in value.items():
            payload[str(key)] = _json_safe(item, max_chars=max_chars)
        return payload

    if isinstance(value, (list, tuple)):
        return [_json_safe(item, max_chars=max_chars) for item in value]

    if isinstance(value, (str, int, float, bool)) or value is None:
        if isinstance(value, str) and len(value) > max_chars:
            return value[: max_chars - 3] + "..."
        return value

    text = str(value)
    if len(text) > max_chars:
        return text[: max_chars - 3] + "..."
    return text


def safe_preview(payload: Any) -> dict[str, Any]:
    """Return a bounded JSON-safe payload suitable for trace persistence."""
    normalized = _json_safe(payload)
    if isinstance(normalized, dict):
        redacted: dict[str, Any] = {}
        for key, value in normalized.items():
            lowered = key.lower()
            if any(token in lowered for token in ("token", "secret", "authorization", "password", "api_key")):
                redacted[key] = "[redacted]"
            else:
                redacted[key] = value
        return redacted
    return {"value": normalized}


def prompt_metadata_for_node(node_name: str, state: AgentState) -> tuple[str | None, str | None, str | None]:
    """Return prompt metadata for a node based on the current state."""
    from gc_agent import prompts

    prompt_name = None
    prompt_text = None

    if node_name == "ingest":
        if state.mode == "estimate":
            prompt_name = "ingest"
            prompt_text = prompts.INGEST_SYSTEM
    elif node_name == "parse_update":
        prompt_name = "parse_update"
        prompt_text = prompts.PARSE_UPDATE_SYSTEM.replace(
            "{jobs_context}",
            prompts.jobs_context_block(state.jobs),
        )
    elif node_name == "flag_risks":
        prompt_name = "flag_risks"
        prompt_text = prompts.FLAG_RISKS_SYSTEM
    elif node_name == "generate_briefing":
        prompt_name = "morning_briefing"
        prompt_text = prompts.MORNING_BRIEFING_SYSTEM
    elif node_name in prompts.PROMPTS:
        prompt_name = node_name
        prompt_text = prompts.PROMPTS[node_name]

    prompt_digest = prompt_hash(prompt_text or "")
    return prompt_name, prompt_text, prompt_digest


def write_agent_trace(
    *,
    trace_id: str,
    gc_id: str = "",
    job_id: str = "",
    thread_id: str = "",
    input_surface: str,
    flow: str = "",
    node_name: str,
    prompt_name: str | None = None,
    prompt_hash: str | None = None,
    model_name: str | None = None,
    input_preview: Any = None,
    output_preview: Any = None,
    status: str | None = None,
    error_text: str | None = None,
    latency_ms: int | None = None,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
) -> None:
    """Persist one telemetry row when the trace table is available."""
    global _TRACE_DISABLED

    if _TRACE_DISABLED:
        return
    if not trace_id.strip():
        return

    try:
        from gc_agent.db.client import get_client

        client = get_client()
    except Exception as exc:
        LOGGER.debug("agent_trace unavailable: %s", exc)
        return

    payload = {
        "id": str(uuid4()),
        "trace_id": trace_id.strip(),
        "gc_id": gc_id.strip() or None,
        "job_id": job_id.strip() or None,
        "thread_id": thread_id.strip() or None,
        "input_surface": input_surface.strip() or "unknown",
        "flow": flow.strip() or None,
        "node_name": node_name.strip(),
        "prompt_name": (prompt_name or "").strip() or None,
        "prompt_hash": (prompt_hash or "").strip() or None,
        "model_name": (model_name or "").strip() or None,
        "status": (status or "").strip() or None,
        "error_text": (error_text or "").strip() or None,
        "latency_ms": latency_ms,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_preview": safe_preview(input_preview),
        "output_preview": safe_preview(output_preview),
        "created_at": _utcnow_iso(),
    }

    try:
        client.table("agent_trace").insert(payload).execute()
    except Exception:
        _TRACE_DISABLED = True
        LOGGER.warning(
            "Disabling agent_trace writes after insert failure. "
            "Apply migration 008_trace_id_columns.sql to enable telemetry."
        )


def log_ingress_trace(
    state: AgentState,
    *,
    input_surface: str,
    payload: Any,
    node_name: str = "ingress",
) -> None:
    """Persist a trace row at ingress before business logic starts."""
    write_agent_trace(
        trace_id=state.trace_id,
        gc_id=state.gc_id,
        job_id=state.active_job_id,
        thread_id=state.thread_id,
        input_surface=input_surface,
        flow=(state.mode or "unknown"),
        node_name=node_name,
        status="ingress",
        input_preview=payload,
        output_preview={},
    )


def trace_node_execution(node_name: str, node_fn: NodeCallable) -> NodeCallable:
    """Wrap a node to emit persistent telemetry for success and failure."""

    async def _wrapped(state: AgentState) -> dict[str, Any]:
        start = time.perf_counter()
        reset_model_usage()
        prompt_name, _, prompt_hash = prompt_metadata_for_node(node_name, state)
        input_snapshot = {
            "state": state.model_dump(mode="json"),
        }

        try:
            result = await node_fn(state)
        except Exception as exc:
            latency_ms = int((time.perf_counter() - start) * 1000)
            usage = consume_model_usage()
            write_agent_trace(
                trace_id=state.trace_id,
                gc_id=state.gc_id,
                job_id=state.active_job_id,
                thread_id=state.thread_id,
                input_surface=state.input_type,
                flow=(state.mode or "unknown"),
                node_name=node_name,
                prompt_name=prompt_name,
                prompt_hash=prompt_hash,
                model_name=usage.get("model_name"),
                status="error",
                input_preview=input_snapshot,
                output_preview={"partial_state": state.model_dump(mode="json")},
                error_text=str(exc),
                latency_ms=latency_ms,
                input_tokens=usage.get("input_tokens"),
                output_tokens=usage.get("output_tokens"),
            )
            raise

        latency_ms = int((time.perf_counter() - start) * 1000)
        usage = consume_model_usage()
        write_agent_trace(
            trace_id=state.trace_id,
            gc_id=state.gc_id,
            job_id=str(result.get("active_job_id", state.active_job_id) or ""),
            thread_id=state.thread_id,
            input_surface=state.input_type,
            flow=(state.mode or "unknown"),
            node_name=node_name,
            prompt_name=prompt_name,
            prompt_hash=prompt_hash,
            model_name=usage.get("model_name"),
            status="ok",
            input_preview=input_snapshot,
            output_preview=result,
            latency_ms=latency_ms,
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens"),
        )
        return result

    return _wrapped


__all__ = [
    "build_prompt_hash",
    "consume_model_usage",
    "log_ingress_trace",
    "prompt_hash",
    "prompt_metadata_for_node",
    "record_model_usage",
    "reset_model_usage",
    "safe_preview",
    "trace_node_execution",
    "write_agent_trace",
]
