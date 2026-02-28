"""GC Agent backend package."""

from __future__ import annotations


def get_graph():
    """Lazily import the graph to avoid heavy package side effects."""
    from gc_agent.graph import get_graph as _get_graph

    return _get_graph()


__all__ = ["get_graph"]
