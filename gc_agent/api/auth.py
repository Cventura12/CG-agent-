"""Shared API-key auth for the public contractor API surface."""

from __future__ import annotations

import os
from typing import Any

from fastapi import Header, HTTPException, Request, status

DEFAULT_ESTIMATE_GC_ID = (
    os.getenv("GC_AGENT_DEFAULT_GC_ID", "").strip()
    or "00000000-0000-0000-0000-000000000001"
)


def _api_key_map() -> dict[str, str]:
    """Parse per-contractor API keys from environment."""
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


def authorize_contractor(contractor_id: str, api_key: str | None) -> None:
    """Validate one contractor-specific API key value."""
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


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> bool:
    """Resolve contractor_id from request shape and enforce the configured API key."""
    contractor_id = ""

    if request.method.upper() == "GET":
        contractor_id = str(request.query_params.get("contractor_id", "")).strip()
    else:
        try:
            payload: Any = await request.json()
        except Exception:
            payload = {}
        if isinstance(payload, dict):
            contractor_id = str(payload.get("contractor_id", "")).strip()
        if not contractor_id and request.url.path.endswith("/quote"):
            contractor_id = DEFAULT_ESTIMATE_GC_ID

    if not contractor_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="contractor_id is required",
        )

    authorize_contractor(contractor_id, x_api_key)
    return True


__all__ = ["DEFAULT_ESTIMATE_GC_ID", "authorize_contractor", "require_api_key"]
