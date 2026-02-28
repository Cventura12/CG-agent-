"""CLI entry points for local GC Agent loop testing."""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path
from typing import Sequence

from gc_agent.nodes.calculate_materials import calculate_materials
from gc_agent.nodes.clarify_missing import clarify_missing
from gc_agent.nodes.extract_job_scope import extract_job_scope
from gc_agent.nodes.generate_quote import generate_quote
from gc_agent.nodes.ingest import ingest
from gc_agent.state import AgentState
from gc_agent.tools.phase1_fixtures import build_phase1_memory_context


def _merge_state(state: AgentState, updates: dict[str, object]) -> AgentState:
    """Apply node updates to AgentState."""
    return state.model_copy(update=updates)


async def run_single_estimate(raw_input: str) -> AgentState:
    """Run the Day 5 Phase 1 estimating loop and return final state."""
    state = AgentState(
        raw_input=raw_input,
        mode="estimate",
        memory_context=build_phase1_memory_context(),
    )

    state = _merge_state(state, await ingest(state))
    state = _merge_state(state, await extract_job_scope(state))

    if state.clarification_needed:
        state = _merge_state(state, await clarify_missing(state))

    state = _merge_state(state, await calculate_materials(state))
    state = _merge_state(state, await generate_quote(state))
    return state


async def _run_single_command(raw_input: str) -> int:
    """Execute the single-input quote flow and print results."""
    state = await run_single_estimate(raw_input)

    if state.clarification_questions:
        print("Clarification Questions:")
        for question in state.clarification_questions:
            print(f"- {question}")
        print("")

    print(state.rendered_quote or "No quote was generated.")
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

    single_parser = subparsers.add_parser("single", help="Run the single-input quote loop")
    single_parser.add_argument("raw_input", help="Messy contractor input to normalize and quote")

    batch_parser = subparsers.add_parser("batch", help="Run the quote loop for every input in a file")
    batch_parser.add_argument("input_path", help="Path to the newline-delimited input file")
    batch_parser.add_argument("--output", required=True, help="Directory for saved batch outputs")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Parse CLI args and execute the selected command."""
    logging.disable(logging.CRITICAL)

    parser = _build_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.command == "single":
        return asyncio.run(_run_single_command(args.raw_input))
    if args.command == "batch":
        return asyncio.run(_run_batch_command(args.input_path, args.output))

    parser.error(f"Unsupported command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
