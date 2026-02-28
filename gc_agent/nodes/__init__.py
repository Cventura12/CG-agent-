"""Lazy node exports for GC Agent graph execution."""

from __future__ import annotations

from importlib import import_module
from typing import Any

_NODE_MODULES = {
    "ingest": "gc_agent.nodes.ingest",
    "extract_job_scope": "gc_agent.nodes.extract_job_scope",
    "clarify_missing": "gc_agent.nodes.clarify_missing",
    "calculate_materials": "gc_agent.nodes.calculate_materials",
    "generate_quote": "gc_agent.nodes.generate_quote",
    "parse_update": "gc_agent.nodes.parse_update",
    "update_state": "gc_agent.nodes.update_state",
    "flag_risks": "gc_agent.nodes.flag_risks",
    "draft_actions": "gc_agent.nodes.draft_actions",
    "generate_briefing": "gc_agent.nodes.generate_briefing",
}

__all__ = list(_NODE_MODULES)


def __getattr__(name: str) -> Any:
    """Lazily import node callables on first access."""
    module_path = _NODE_MODULES.get(name)
    if module_path is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    module = import_module(module_path)
    value = getattr(module, name)
    globals()[name] = value
    return value
