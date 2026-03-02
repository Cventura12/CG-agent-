"""CLI entry points for local GC Agent loop testing."""

from __future__ import annotations

import argparse
import asyncio
import inspect
import logging
import os
from pathlib import Path
from typing import Awaitable, Callable, Sequence

from gc_agent.graph import get_checkpoint_state, graph
from gc_agent.nodes.calculate_materials import calculate_materials
from gc_agent.nodes.clarify_missing import clarify_missing
from gc_agent.nodes.draft_actions import draft_actions
from gc_agent.nodes.extract_job_scope import extract_job_scope
from gc_agent.nodes.flag_risks import flag_risks
from gc_agent.nodes.followup_trigger import check_due_followups, followup_trigger
from gc_agent.nodes.generate_briefing import generate_briefing
from gc_agent.nodes.generate_quote import generate_quote
from gc_agent.nodes.ingest import ingest
from gc_agent.nodes.parse_update import parse_update
from gc_agent.nodes.recall_context import recall_context
from gc_agent.nodes.update_state import update_state
from gc_agent.nodes.update_memory import update_memory
from gc_agent.state import AgentState
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context

EstimateNode = Callable[[AgentState], Awaitable[dict[str, object]]]
DEFAULT_ESTIMATE_GC_ID = (
    os.getenv("GC_AGENT_DEFAULT_GC_ID", "").strip()
    or "00000000-0000-0000-0000-000000000001"
)


def _merge_state(state: AgentState, updates: dict[str, object]) -> AgentState:
    """Apply node updates to AgentState."""
    return state.model_copy(update=updates)


def _build_reviewed_quote(
    state: AgentState,
    edited_scope_of_work: str,
    edited_total_price: float | None,
) -> dict[str, object]:
    """Build the final approved/edited quote payload for memory updates."""
    final_quote = dict(state.final_quote_draft) or dict(state.quote_draft)
    if not final_quote:
        return {}

    if edited_scope_of_work.strip():
        final_quote["scope_of_work"] = edited_scope_of_work.strip()
    if edited_total_price is not None:
        final_quote["total_price"] = float(edited_total_price)
    return final_quote


def _session_config(session_id: str) -> dict[str, dict[str, str]]:
    """Build LangGraph config for a checkpoint session."""
    return {"configurable": {"thread_id": session_id}}


async def _checkpoint_state(state: AgentState, session_id: str, node_name: str) -> None:
    """Persist CLI state through the graph's configured checkpointer."""
    if not session_id.strip():
        return

    await graph.aupdate_state(
        _session_config(session_id),
        state.model_dump(mode="json"),
        as_node=node_name,
    )


async def _run_estimate_node(
    state: AgentState,
    node_name: str,
    node_fn: EstimateNode,
    session_id: str,
) -> AgentState:
    """Execute one estimate node and persist the merged state."""
    next_state = _merge_state(state, await node_fn(state))
    await _checkpoint_state(next_state, session_id, node_name)
    return next_state


def _bootstrap_estimate_state(
    raw_input: str,
    session_id: str,
    gc_id: str,
    checkpoint_state: AgentState | None,
) -> AgentState:
    """Create or enrich the estimate state used by the CLI."""
    if checkpoint_state is None:
        return AgentState(
            raw_input=raw_input,
            mode="estimate",
            memory_context=build_phase1_memory_context(),
            gc_id=gc_id,
            thread_id=session_id,
        )

    update_payload: dict[str, object] = {}
    if raw_input.strip() and not checkpoint_state.raw_input.strip():
        update_payload["raw_input"] = raw_input
    if gc_id and not checkpoint_state.gc_id.strip():
        update_payload["gc_id"] = gc_id
    if session_id and checkpoint_state.thread_id != session_id:
        update_payload["thread_id"] = session_id
    if not checkpoint_state.memory_context:
        update_payload["memory_context"] = build_phase1_memory_context()
    if checkpoint_state.mode != "estimate":
        update_payload["mode"] = "estimate"

    if not update_payload:
        return checkpoint_state
    return checkpoint_state.model_copy(update=update_payload)


def _bootstrap_single_state(
    raw_input: str,
    session_id: str,
    gc_id: str,
    checkpoint_state: AgentState | None,
) -> AgentState:
    """Create or enrich generic CLI state without forcing a path up front."""
    if checkpoint_state is None:
        return AgentState(
            raw_input=raw_input,
            memory_context=build_phase1_memory_context(),
            gc_id=gc_id,
            thread_id=session_id,
        )

    update_payload: dict[str, object] = {}
    if raw_input.strip() and not checkpoint_state.raw_input.strip():
        update_payload["raw_input"] = raw_input
    if gc_id and not checkpoint_state.gc_id.strip():
        update_payload["gc_id"] = gc_id
    if session_id and checkpoint_state.thread_id != session_id:
        update_payload["thread_id"] = session_id
    if not checkpoint_state.memory_context:
        update_payload["memory_context"] = build_phase1_memory_context()

    if not update_payload:
        return checkpoint_state
    return checkpoint_state.model_copy(update=update_payload)


async def _resolve_active_jobs(gc_id: str) -> list[object]:
    """Load active jobs for update-mode CLI runs."""
    from gc_agent.db import queries

    result = queries.get_active_jobs(gc_id)
    if inspect.isawaitable(result):
        return list(await result)
    return list(result)


async def _run_estimate_path(
    state: AgentState,
    session_id: str,
    requested_status: str,
    edited_scope_of_work: str,
    edited_total_price: float | None,
) -> AgentState:
    """Run the estimate nodes starting from a prepared estimate state."""
    if not state.cleaned_input.strip():
        state = await _run_estimate_node(state, "ingest", ingest, session_id)

    if not bool(state.memory_context.get("recall_context_ready")):
        state = await _run_estimate_node(state, "recall_context", recall_context, session_id)

    if not state.job_scope:
        state = await _run_estimate_node(state, "extract_job_scope", extract_job_scope, session_id)

    if state.clarification_needed and not state.clarification_questions:
        state = await _run_estimate_node(state, "clarify_missing", clarify_missing, session_id)

    if not state.materials:
        state = await _run_estimate_node(state, "calculate_materials", calculate_materials, session_id)

    if not state.quote_draft or not state.rendered_quote.strip():
        state = await _run_estimate_node(state, "generate_quote", generate_quote, session_id)

    if requested_status and requested_status != state.approval_status:
        review_payload: dict[str, object] = {"approval_status": requested_status}
        if requested_status in {"approved", "edited"}:
            review_payload["final_quote_draft"] = _build_reviewed_quote(
                state,
                edited_scope_of_work,
                edited_total_price,
            )
        state = state.model_copy(update=review_payload)
        await _checkpoint_state(state, session_id, "quote_review")

    if (
        requested_status in {"approved", "edited"}
        and not bool(state.memory_context.get("memory_updated"))
    ):
        state = await _run_estimate_node(state, "update_memory", update_memory, session_id)

    if (
        requested_status in {"approved", "edited"}
        and not bool(state.memory_context.get("followup_open_item_created"))
    ):
        state = await _run_estimate_node(state, "followup_trigger", followup_trigger, session_id)

    return state


async def _run_update_path(state: AgentState, session_id: str) -> AgentState:
    """Run the v4 job-update path from a prepared update state."""
    if not state.jobs and state.gc_id.strip():
        state = state.model_copy(update={"jobs": await _resolve_active_jobs(state.gc_id)})

    if state.parsed_intent is None:
        state = await _run_estimate_node(state, "parse_update", parse_update, session_id)

    if not state.risk_flags:
        state = await _run_estimate_node(state, "update_state", update_state, session_id)
        state = await _run_estimate_node(state, "flag_risks", flag_risks, session_id)

    if not state.drafts_created:
        state = await _run_estimate_node(state, "draft_actions", draft_actions, session_id)

    return state


async def run_single_input(
    raw_input: str,
    *,
    session_id: str = "",
    gc_id: str = DEFAULT_ESTIMATE_GC_ID,
    approval_status: str = "pending",
    edited_scope_of_work: str = "",
    edited_total_price: float | None = None,
) -> AgentState:
    """Run a single input through the correct path based on the shared ingress routing."""
    checkpoint_state = (
        await get_checkpoint_state(session_id, graph_instance=graph)
        if session_id
        else None
    )
    state = _bootstrap_single_state(raw_input, session_id, gc_id, checkpoint_state)

    if not state.mode:
        state = await _run_estimate_node(state, "ingest", ingest, session_id)

    requested_status = approval_status.strip().lower()

    if state.mode == "estimate":
        estimate_state = _bootstrap_estimate_state(raw_input, session_id, gc_id, state)
        return await _run_estimate_path(
            estimate_state,
            session_id,
            requested_status,
            edited_scope_of_work,
            edited_total_price,
        )

    if state.mode == "briefing":
        if not state.briefing_output.strip():
            state = await _run_estimate_node(state, "generate_briefing", generate_briefing, session_id)
        return state

    return await _run_update_path(state, session_id)


async def run_single_estimate(
    raw_input: str,
    *,
    session_id: str = "",
    gc_id: str = DEFAULT_ESTIMATE_GC_ID,
    approval_status: str = "pending",
    edited_scope_of_work: str = "",
    edited_total_price: float | None = None,
) -> AgentState:
    """Run the Day 9 estimating loop and return final state."""
    checkpoint_state = (
        await get_checkpoint_state(session_id, graph_instance=graph)
        if session_id
        else None
    )
    state = _bootstrap_estimate_state(raw_input, session_id, gc_id, checkpoint_state)

    return await _run_estimate_path(
        state,
        session_id,
        approval_status.strip().lower(),
        edited_scope_of_work,
        edited_total_price,
    )


async def _run_single_command(
    raw_input: str,
    session_id: str,
    approval_status: str,
    edited_scope_of_work: str,
    edited_total_price: float | None,
) -> int:
    """Execute the single-input flow and print results for the routed path."""
    state = await run_single_input(
        raw_input,
        session_id=session_id,
        approval_status=approval_status,
        edited_scope_of_work=edited_scope_of_work,
        edited_total_price=edited_total_price,
    )

    if state.mode == "update":
        if not state.drafts_created:
            print("No draft actions were generated.")
            return 0

        print("Draft Actions:")
        for draft in state.drafts_created:
            print(f"- {draft.title} [{draft.type}]")
            print(f"  {draft.content}")
        return 0

    if state.mode == "briefing":
        print(state.briefing_output or "No briefing was generated.")
        return 0

    if state.clarification_questions:
        print("Clarification Questions:")
        for question in state.clarification_questions:
            print(f"- {question}")
        print("")

    print(state.rendered_quote or "No quote was generated.")
    return 0


async def _run_check_followups_command(contractor_id: str) -> int:
    """Process due follow-up reminders for one contractor."""
    result = await check_due_followups(contractor_id)
    print(
        "Processed {processed_items} item(s); created {created_drafts} draft(s); "
        "followup_count={followup_count}; stop_following_up={stop_following_up}".format(**result)
    )
    return 0


async def _run_review_edits_command(contractor_id: str, limit: int) -> int:
    """Print approved-with-edit drafts and prompt-tuning signals for manual review."""
    from gc_agent.db import queries
    from gc_agent.nodes.update_memory import build_prompt_tuning_signals

    drafts = await queries.get_approved_with_edit_drafts(contractor_id, limit=limit)
    if not drafts:
        print("No approved-with-edit drafts found.")
        return 0

    print(f"Approved-with-edit drafts: {len(drafts)}")
    for draft in drafts:
        original_content = draft.original_content or ""
        final_content = draft.content
        signals = build_prompt_tuning_signals(
            {"scope_of_work": original_content},
            {"scope_of_work": final_content},
        )

        print("")
        print(f"- {draft.title} [{draft.type}]")
        print(f"  job: {draft.job_name}")
        print(f"  approval_status: {draft.approval_status or 'n/a'}")
        print(f"  targets: {', '.join(signals.get('likely_prompt_targets', [])) or 'none'}")
        print(f"  patterns: {', '.join(signals.get('change_patterns', []))}")
        print("  original:")
        print(f"    {original_content or '(missing original content)'}")
        print("  final:")
        print(f"    {final_content}")

    return 0


def _sanitize_output_name(index: int, raw_input: str) -> str:
    """Build a stable batch output filename."""
    candidate = "".join(
        char.lower() if char.isalnum() else "-"
        for char in raw_input[:40]
    )
    while "--" in candidate:
        candidate = candidate.replace("--", "-")
    candidate = candidate.strip("-") or f"input-{index:02d}"
    return f"{index:02d}-{candidate}.txt"


def _render_batch_output(state: AgentState, raw_input: str) -> str:
    """Render a saved batch output file."""
    lines = [
        f"RAW INPUT: {raw_input.strip()}",
        "",
    ]

    if state.clarification_questions:
        lines.append("CLARIFICATION QUESTIONS:")
        for question in state.clarification_questions:
            lines.append(f"- {question}")
        lines.append("")

    lines.append(state.rendered_quote or "No quote was generated.")

    return "\n".join(lines).strip() + "\n"


async def _run_batch_command(input_path: str, output_dir: str) -> int:
    """Run the single-input quote loop over every non-empty line in a file."""
    source_path = Path(input_path)
    destination_dir = Path(output_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)

    raw_lines = source_path.read_text(encoding="utf-8").splitlines()
    inputs = [line.strip() for line in raw_lines if line.strip()]

    if not inputs:
        print("No inputs found.")
        return 1

    for index, raw_input in enumerate(inputs, start=1):
        state = await run_single_estimate(raw_input)
        output_path = destination_dir / _sanitize_output_name(index, raw_input)
        output_path.write_text(
            _render_batch_output(state, raw_input),
            encoding="utf-8",
        )

    print(f"Processed {len(inputs)} input(s) into {destination_dir}")
    return 0


def _build_parser() -> argparse.ArgumentParser:
    """Build the CLI argument parser."""
    parser = argparse.ArgumentParser(prog="python -m gc_agent.cli")
    subparsers = parser.add_subparsers(dest="command", required=True)

    single_parser = subparsers.add_parser("single", help="Run one input through the routed agent flow")
    single_parser.add_argument("raw_input", help="Messy contractor input to route and process")
    single_parser.add_argument(
        "--session-id",
        default="",
        help="Optional checkpoint session ID for resume support",
    )
    single_parser.add_argument(
        "--approval-status",
        choices=["pending", "approved", "edited", "rejected"],
        default="pending",
        help="Optional review result to apply after quote generation",
    )
    single_parser.add_argument(
        "--edited-scope-of-work",
        default="",
        help="Optional final scope text used when approval status is edited",
    )
    single_parser.add_argument(
        "--edited-total-price",
        type=float,
        default=None,
        help="Optional final total price used when approval status is edited",
    )

    batch_parser = subparsers.add_parser("batch", help="Run the quote loop for every input in a file")
    batch_parser.add_argument("input_path", help="Path to the newline-delimited input file")
    batch_parser.add_argument("--output", required=True, help="Directory for saved batch outputs")

    followup_parser = subparsers.add_parser(
        "check-followups",
        help="Process due follow-up reminders for a contractor",
    )
    followup_parser.add_argument(
        "--contractor-id",
        required=True,
        help="Contractor / GC account ID to process",
    )

    review_parser = subparsers.add_parser(
        "review-edits",
        help="Review approved-with-edit drafts and prompt-tuning signals",
    )
    review_parser.add_argument(
        "--contractor-id",
        required=True,
        help="Contractor / GC account ID to review",
    )
    review_parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Maximum number of approved-with-edit drafts to print",
    )

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Parse CLI args and execute the selected command."""
    logging.disable(logging.CRITICAL)

    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.command == "single":
        return asyncio.run(
            _run_single_command(
                args.raw_input,
                args.session_id,
                args.approval_status,
                args.edited_scope_of_work,
                args.edited_total_price,
            )
        )
    if args.command == "batch":
        return asyncio.run(_run_batch_command(args.input_path, args.output))
    if args.command == "check-followups":
        return asyncio.run(_run_check_followups_command(args.contractor_id))
    if args.command == "review-edits":
        return asyncio.run(_run_review_edits_command(args.contractor_id, args.limit))

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
