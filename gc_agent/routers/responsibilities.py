"""GC responsibility definitions for Arbor Agent."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from gc_agent.responsibilities import responsibilities_catalog

router = APIRouter(tags=["responsibilities"])


def _success(data: Any) -> dict[str, Any]:
    """Return a standard success envelope for responsibility endpoints."""
    return {
        "success": True,
        "data": data,
        "error": None,
    }


@router.get("/responsibilities", response_model=None)
async def list_responsibilities() -> dict[str, Any]:
    """Return canonical GC responsibility definitions."""
    return _success(
        {
            "items": [item.model_dump(mode="json") for item in responsibilities_catalog()],
        }
    )


__all__ = ["router", "list_responsibilities"]
