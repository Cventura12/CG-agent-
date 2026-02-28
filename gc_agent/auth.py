"""Authentication helpers for Clerk JWT validation."""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

CLERK_JWKS_URL = "https://api.clerk.com/v1/jwks"


def _unauthorized(detail: str = "Invalid or missing authentication token") -> HTTPException:
    """Return a standardized 401 error used across auth validation failures."""
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _extract_bearer_token(authorization: str) -> str:
    """Extract and validate a Bearer token from Authorization header value."""
    value = authorization.strip()
    scheme, _, token = value.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    return token.strip()


async def _fetch_jwks(secret_key: str) -> list[dict[str, Any]]:
    """Fetch Clerk JWKS on every protected request (no caching)."""
    headers = {"Authorization": f"Bearer {secret_key}"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(CLERK_JWKS_URL, headers=headers)
        response.raise_for_status()
        payload = response.json()

    keys = payload.get("keys")
    if not isinstance(keys, list) or not keys:
        raise _unauthorized("Clerk JWKS response contained no keys")
    return [key for key in keys if isinstance(key, dict)]


def _select_jwk(keys: list[dict[str, Any]], kid: str) -> dict[str, Any]:
    """Select the correct JWK by key ID from Clerk key set."""
    for key in keys:
        if str(key.get("kid", "")).strip() == kid:
            return key
    raise _unauthorized("Unable to find matching Clerk JWK")


async def get_current_gc(authorization: str | None = Header(default=None)) -> str:
    """Validate Clerk JWT and return Clerk user ID as current GC identifier."""
    secret_key = os.getenv("CLERK_SECRET_KEY", "").strip()
    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="CLERK_SECRET_KEY is not configured",
        )
    if not authorization or not authorization.strip():
        raise _unauthorized()

    try:
        token = _extract_bearer_token(authorization)
        header = jwt.get_unverified_header(token)
        kid = str(header.get("kid", "")).strip()
        if not kid:
            raise _unauthorized("JWT header missing key id")

        keys = await _fetch_jwks(secret_key)
        signing_key = _select_jwk(keys, kid)

        claims = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_user_id = str(claims.get("sub", "")).strip()
        if not clerk_user_id:
            raise _unauthorized("JWT missing subject claim")

        return clerk_user_id
    except HTTPException:
        raise
    except (JWTError, ValueError):
        raise _unauthorized()
    except Exception as exc:
        raise _unauthorized(f"Token verification failed: {exc}")


__all__ = ["get_current_gc"]
