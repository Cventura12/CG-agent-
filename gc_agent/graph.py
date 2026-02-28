"""LangGraph StateGraph definition for GC Agent."""

from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import date
from typing import Any, Awaitable, Callable, Optional, cast

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

try:
    from langgraph.checkpoint.postgres import PostgresSaver
except Exception:  # pragma: no cover - dependency may be unavailable before install
    PostgresSaver = None  # type: ignore[assignment]

from gc_agent.db import queries
from gc_agent.db.client import get_postgres_url
from gc_agent.nodes import (
    draft_actions,
    flag_risks,
    generate_briefing,
    ingest,
    parse_update,
    update_state,
)
from gc_agent.state import AgentState

CompiledGraph = Any
NodeResult = dict[str, Any]
NodeCallable = Callable[[AgentState], Awaitable[NodeResult]]

LOGGER = logging.getLogger(__name__)
_GRAPH_SINGLETON: Optional[CompiledGraph] = None


def route_by_mode(state: AgentState) -> str:
    """Return the execution route based on mode set by ingest."""
    mode: Optional[str]
    if isinstance(state, AgentState):
        mode = state.mode
    elif isinstance(state, dict):
        mode = cast(Optional[str], state.get("mode"))
    else:
        mode = None

    return "briefing" if mode == "briefing" else "update"


def _daily_thread_id(gc_id: str) -> str:
    """Build deterministic per-GC per-day thread ID for update sessions."""
    return f"{gc_id}-{date.today().isoformat()}"


def _with_debug_logging(name: str, node_fn: NodeCallable) -> NodeCallable:
    """Wrap a node to emit DEBUG logs each time it executes."""

    async def _wrapped(state: AgentState) -> NodeResult:
        LOGGER.debug("Node fired: %s", name)
        return await node_fn(state)

    return _wrapped


def _build_default_checkpointer() -> Any:
    """Build default checkpointer: PostgresSaver when configured, else MemorySaver."""
    postgres_url = get_postgres_url()

    if not postgres_url:
        LOGGER.info("Using MemorySaver checkpointer (SUPABASE_POSTGRES_URL not set)")
        return MemorySaver()

    if PostgresSaver is None:
        LOGGER.warning("Using MemorySaver checkpointer (PostgresSaver dependency unavailable)")
        return MemorySaver()

    try:
        postgres_saver = PostgresSaver.from_conn_string(postgres_url)
        setup_result = postgres_saver.setup()

        if inspect.isawaitable(setup_result):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                asyncio.run(cast(Awaitable[Any], setup_result))
            else:
                LOGGER.warning(
                    "PostgresSaver.setup() returned awaitable inside active loop; "
                    "falling back to MemorySaver"
                )
                return MemorySaver()

        LOGGER.info("Using PostgresSaver checkpointer")
        return postgres_saver
    except Exception:
        LOGGER.warning(
            "Failed to initialize PostgresSaver; falling back to MemorySaver",
            exc_info=True,
        )
        return MemorySaver()


def build_graph(checkpointer: Any = None) -> CompiledGraph:
    """Build and compile the GC Agent LangGraph with interrupt support."""
    workflow = StateGraph(AgentState)

    workflow.add_node("ingest", _with_debug_logging("ingest", ingest))
    workflow.add_node("parse_update", _with_debug_logging("parse_update", parse_update))
    workflow.add_node("update_state", _with_debug_logging("update_state", update_state))
    workflow.add_node("flag_risks", _with_debug_logging("flag_risks", flag_risks))
    workflow.add_node("draft_actions", _with_debug_logging("draft_actions", draft_actions))
    workflow.add_node(
        "generate_briefing",
        _with_debug_logging("generate_briefing", generate_briefing),
    )

    workflow.add_edge(START, "ingest")
    workflow.add_conditional_edges(
        "ingest",
        route_by_mode,
        {
            "update": "parse_update",
            "briefing": "generate_briefing",
        },
    )

    workflow.add_edge("parse_update", "update_state")
    workflow.add_edge("update_state", "flag_risks")
    workflow.add_edge("flag_risks", "draft_actions")
    workflow.add_edge("draft_actions", END)
    workflow.add_edge("generate_briefing", END)

    if checkpointer is not None:
        active_checkpointer = checkpointer
        LOGGER.info("Using provided checkpointer: %s", type(active_checkpointer).__name__)
    else:
        active_checkpointer = _build_default_checkpointer()

    return workflow.compile(
        checkpointer=active_checkpointer,
        interrupt_after=["draft_actions"],
    )


def get_graph() -> CompiledGraph:
    """Return a lazily-created module-level compiled graph singleton."""
    global _GRAPH_SINGLETON

    if _GRAPH_SINGLETON is None:
        _GRAPH_SINGLETON = build_graph()

    return _GRAPH_SINGLETON


async def _resolve_jobs(gc_id: str) -> list[Any]:
    """Load active jobs, supporting sync or async DB query implementations."""
    result = queries.get_active_jobs(gc_id)
    if inspect.isawaitable(result):
        return cast(list[Any], await cast(Awaitable[Any], result))
    return cast(list[Any], result)


def _state_from_graph_result(result: Any, base_state: AgentState) -> AgentState:
    """Normalize graph output into AgentState, preserving captured errors."""
    if isinstance(result, AgentState):
        return result

    if isinstance(result, dict):
        merged = base_state.model_dump()
        merged.update(result)
        try:
            return AgentState.model_validate(merged)
        except Exception as exc:  # pragma: no cover - defensive fallback
            LOGGER.exception("Unable to validate graph result into AgentState")
            base_state.errors.append(f"state validation failed: {exc}")
            return base_state

    base_state.errors.append(f"unexpected graph result type: {type(result)!r}")
    return base_state


async def run_update(
    raw_input: str,
    gc_id: str,
    from_number: str,
    input_type: str = "whatsapp",
) -> AgentState:
    """Run the update path for a new inbound message and return final state."""
    thread_id = _daily_thread_id(gc_id)
    initial_state = AgentState(
        input_type=cast(Any, input_type),
        raw_input=raw_input,
        from_number=from_number,
        mode="update",
        gc_id=gc_id,
        jobs=[],
        thread_id=thread_id,
    )

    try:
        initial_state.jobs = await _resolve_jobs(gc_id)
        config = {"configurable": {"thread_id": thread_id}}
        result = await get_graph().ainvoke(initial_state, config=config)
        return _state_from_graph_result(result, initial_state)
    except Exception as exc:
        LOGGER.exception("run_update failed for gc_id=%s", gc_id)
        initial_state.errors.append(str(exc))
        return initial_state


async def run_briefing(gc_id: str) -> str:
    """Run briefing mode for a GC and return the generated briefing text."""
    thread_id = f"{gc_id}-briefing-{date.today().isoformat()}"
    initial_state = AgentState(
        input_type="cron",
        raw_input="",
        from_number="",
        mode="briefing",
        gc_id=gc_id,
        jobs=[],
        thread_id=thread_id,
    )

    try:
        initial_state.jobs = await _resolve_jobs(gc_id)
        config = {"configurable": {"thread_id": thread_id}}
        result = await get_graph().ainvoke(initial_state, config=config)
        final_state = _state_from_graph_result(result, initial_state)
        return final_state.briefing_output
    except Exception as exc:
        LOGGER.exception("run_briefing failed for gc_id=%s", gc_id)
        initial_state.errors.append(str(exc))
        return initial_state.briefing_output


async def get_thread_state(gc_id: str) -> Optional[AgentState]:
    """Return today's checkpointed AgentState for a GC, if available."""
    thread_id = _daily_thread_id(gc_id)
    config = {"configurable": {"thread_id": thread_id}}
    graph_instance = get_graph()

    try:
        if hasattr(graph_instance, "aget_state"):
            snapshot = await graph_instance.aget_state(config=config)
        else:
            snapshot = graph_instance.get_state(config=config)
    except Exception:
        LOGGER.exception("Failed to read checkpoint state for thread_id=%s", thread_id)
        return None

    if snapshot is None:
        return None

    values = getattr(snapshot, "values", None)
    if not values:
        return None

    if isinstance(values, AgentState):
        return values

    if isinstance(values, dict):
        merged = {"thread_id": thread_id}
        merged.update(values)
        try:
            return AgentState.model_validate(merged)
        except Exception:
            LOGGER.exception("Failed to validate checkpoint values for thread_id=%s", thread_id)
            return None

    LOGGER.debug("Unsupported checkpoint value type for thread_id=%s: %r", thread_id, type(values))
    return None


__all__ = [
    "CompiledGraph",
    "route_by_mode",
    "build_graph",
    "get_graph",
    "run_update",
    "run_briefing",
    "get_thread_state",
]