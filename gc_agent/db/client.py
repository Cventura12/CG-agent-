"""Supabase client singleton configuration for Arbor Agent."""

from __future__ import annotations

import os
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_CLIENT: Optional[Client] = None


def get_client() -> Client:
    """Return a shared Supabase client initialized from environment variables."""
    global _CLIENT

    if _CLIENT is not None:
        return _CLIENT

    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )

    if not supabase_url or not supabase_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/ANON_KEY are required")

    _CLIENT = create_client(supabase_url, supabase_key)
    return _CLIENT


def get_postgres_url() -> str:
    """Return the Supabase PostgreSQL connection string from environment."""
    return os.getenv("SUPABASE_POSTGRES_URL", "").strip()


def get_supabase_client() -> Client:
    """Backward-compatible alias for callers that still use the old accessor."""
    return get_client()


__all__ = ["get_client", "get_postgres_url", "get_supabase_client"]