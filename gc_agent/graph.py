"""LangGraph StateGraph definition for GC Agent."""

from __future__ import annotations

import asyncio
import inspect
import logging
from datetime import date
from typing import Any, Awaitable, Callable, Optional, cast

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

try:
    from langgraph.checkpoint.postgres import PostgresSaver
except Exception:  # pragma: no cover - dependency may be unavailable before install
    PostgresSaver = None  # type: ignore[assignment]

from gc_agent.state import AgentState

CompiledGraph = Any
NodeResult = dict[str, Any]
NodeCallable = Callable[[AgentState], Awaitable[NodeResult]]

LOGGER = logging.getLogger(__name__)
_GRAPH_SINGLETON: Optional[CompiledGraph] = None


def _state_snapshot(state: AgentState | dict[str, Any]) -> dict[str, Any]:
    """Return a full-state mapping for shell nodes that leave state unchanged."""
    if isinstance(state, AgentState):
        return state.model_dump()
    return dict(state)


def _shell_stub(name: str, *, human_review: bool = False) -> NodeCallable:
    """Create a v5 graph shell stub that prints its name and preserves state."""

    async def _stub(state: AgentState) -> NodeResult:
        print(f"v5 shell stub: {name}")
        if human_review:
            interrupt({"stage": "quote_review", "node": name})
        return _state_snapshot(state)

    return _stub


async def _phase1_extract_job_scope_node(state: AgentState) -> NodeResult:
    """Run the real Day 3 extract_job_scope node inside the v5 shell."""
    from gc_agent.nodes.extract_job_scope import extract_job_scope

    return await extract_job_scope(state)


async def _phase1_recall_context_node(state: AgentState) -> NodeResult:
    """Run the real Day 11 recall_context node inside the v5 shell."""
    from gc_agent.nodes.recall_context import recall_context

    return await recall_context(state)


async def _phase1_clarify_missing_node(state: AgentState) -> NodeResult:
    """Run the Day 4 clarify node and pause for human input before continuing."""
    from gc_agent.nodes.clarify_missing import clarify_missing

    result = await clarify_missing(state)
    questions = [
        question
        for question in result.get("clarification_questions", [])
        if isinstance(question, str) and question.strip()
    ]
    if not questions:
        return result

    resume_value = interrupt(
        {
            "stage": "clarification",
            "questions": questions,
        }
    )
    if isinstance(resume_value, str) and resume_value.strip():
        cleaned_input = state.cleaned_input.strip()
        clarification_append = f"CLARIFICATION RESPONSE:\n{resume_value.strip()}"
        result["cleaned_input"] = (
            f"{cleaned_input}\n\n{clarification_append}".strip()
            if cleaned_input
            else clarification_append
        )
        result["clarification_needed"] = False

    return result


async def _phase1_calculate_materials_node(state: AgentState) -> NodeResult:
    """Run the real Day 4 calculate_materials node inside the v5 shell."""
    from gc_agent.nodes.calculate_materials import calculate_materials

    return await calculate_materials(state)


async def _phase1_generate_quote_node(state: AgentState) -> NodeResult:
    """Run the real Day 5 quote node and pause for quote review."""
    from gc_agent.nodes.generate_quote import generate_quote

    result = await generate_quote(state)
    quote_draft = result.get("quote_draft")
    rendered_quote = result.get("rendered_quote")
    review_payload: dict[str, object] = {"stage": "quote_review"}
    if isinstance(quote_draft, dict):
        review_payload["quote_draft"] = quote_draft
    if isinstance(rendered_quote, str) and rendered_quote.strip():
        review_payload["rendered_quote"] = rendered_quote

    resume_value = interrupt(review_payload)
    if isinstance(resume_value, dict):
        approval_status = resume_value.get("approval_status")
        if isinstance(approval_status, str) and approval_status.strip():
            result["approval_status"] = approval_status.strip()

        final_quote = resume_value.get("final_quote_draft")
        if isinstance(final_quote, dict):
            result["final_quote_draft"] = final_quote
        elif isinstance(resume_value.get("quote_draft"), dict):
            result["final_quote_draft"] = cast(dict[str, object], resume_value["quote_draft"])

    if (
        result.get("approval_status") in {"approved", "edited"}
        and isinstance(quote_draft, dict)
        and "final_quote_draft" not in result
    ):
        result["final_quote_draft"] = quote_draft

    return result


async def _phase1_update_memory_node(state: AgentState) -> NodeResult:
    """Run the real Day 12 update_memory node inside the v5 shell."""
    from gc_agent.nodes.update_memory import update_memory

    return await update_memory(state)


async def _phase1_followup_trigger_node(state: AgentState) -> NodeResult:
    """Run the real Day 13 followup_trigger node inside the v5 shell."""
    from gc_agent.nodes.followup_trigger import followup_trigger

    return await followup_trigger(state)


def route_after_extract_job_scope(state: AgentState) -> str:
    """Route to clarification only when the shell state requests it."""
    if isinstance(state, AgentState):
        needs_clarification = state.clarification_needed
    elif isinstance(state, dict):
        needs_clarification = bool(state.get("clarification_needed"))
    else:
        needs_clarification = False

    return "clarify_missing" if needs_clarification else "calculate_materials"


def route_by_mode(state: AgentState) -> str:
    """Return the execution route based on mode set by ingest."""
    mode: Optional[str]
    if isinstance(state, AgentState):
        mode = state.mode
    elif isinstance(state, dict):
        mode = cast(Optional[str], state.get("mode"))
    else:
        mode = None

    if mode == "briefing":
        return "briefing"
    if mode == "estimate":
        return "estimate"
    return "update"


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
    from gc_agent.db.client import get_postgres_url

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
    """Build and compile the unified GC Agent LangGraph with interrupt support."""
    from gc_agent.nodes import (
        draft_actions,
        flag_risks,
        generate_briefing,
        ingest,
        parse_update,
        update_state,
    )

    workflow = StateGraph(AgentState)

    workflow.add_node("ingest", _with_debug_logging("ingest", ingest))
    workflow.add_node("recall_context", _with_debug_logging("recall_context", _phase1_recall_context_node))
    workflow.add_node(
        "extract_job_scope",
        _with_debug_logging("extract_job_scope", _phase1_extract_job_scope_node),
    )
    workflow.add_node(
        "clarify_missing",
        _with_debug_logging("clarify_missing", _phase1_clarify_missing_node),
    )
    workflow.add_node(
        "calculate_materials",
        _with_debug_logging("calculate_materials", _phase1_calculate_materials_node),
    )
    workflow.add_node(
        "generate_quote",
        _with_debug_logging("generate_quote", _phase1_generate_quote_node),
    )
    workflow.add_node(
        "update_memory",
        _with_debug_logging("update_memory", _phase1_update_memory_node),
    )
    workflow.add_node(
        "followup_trigger",
        _with_debug_logging("followup_trigger", _phase1_followup_trigger_node),
    )
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
            "estimate": "recall_context",
            "update": "parse_update",
            "briefing": "generate_briefing",
        },
    )

    workflow.add_edge("recall_context", "extract_job_scope")
    workflow.add_conditional_edges(
        "extract_job_scope",
        route_after_extract_job_scope,
        {
            "clarify_missing": "clarify_missing",
            "calculate_materials": "calculate_materials",
        },
    )
    workflow.add_edge("clarify_missing", "calculate_materials")
    workflow.add_edge("calculate_materials", "generate_quote")
    workflow.add_edge("generate_quote", "update_memory")
    workflow.add_edge("update_memory", "followup_trigger")
    workflow.add_edge("followup_trigger", END)

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


def build_phase1_graph_shell() -> CompiledGraph:
    """Backward-compatible alias for the unified graph builder."""
    return build_graph()


def get_graph() -> CompiledGraph:
    """Return a lazily-created module-level compiled graph singleton."""
    global _GRAPH_SINGLETON

    if _GRAPH_SINGLETON is None:
        _GRAPH_SINGLETON = build_graph()

    return _GRAPH_SINGLETON


graph = get_graph()


async def _resolve_jobs(gc_id: str) -> list[Any]:
    """Load active jobs, supporting sync or async DB query implementations."""
    from gc_agent.db import queries

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
    return await get_checkpoint_state(_daily_thread_id(gc_id))


async def get_checkpoint_state(
    thread_id: str,
    graph_instance: CompiledGraph | None = None,
) -> Optional[AgentState]:
    """Return checkpointed AgentState for an explicit thread/session ID."""
    thread_id = thread_id.strip()
    if not thread_id:
        return None

    config = {"configurable": {"thread_id": thread_id}}
    active_graph = graph_instance or get_graph()

    try:
        if hasattr(active_graph, "aget_state"):
            snapshot = await active_graph.aget_state(config=config)
        else:
            snapshot = active_graph.get_state(config=config)
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
    "build_phase1_graph_shell",
    "graph",
    "route_after_extract_job_scope",
    "route_by_mode",
    "build_graph",
    "get_graph",
    "get_checkpoint_state",
    "run_update",
    "run_briefing",
    "get_thread_state",
]
