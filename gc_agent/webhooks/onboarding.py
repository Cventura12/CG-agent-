"""Helpers for first-time WhatsApp onboarding responses."""

from __future__ import annotations

import os

_UNREGISTERED_MESSAGE_TEMPLATE = (
    "Hi! To use GC Agent, sign up at {web_app_url}. "
    "Once registered, send updates to this number anytime."
)


def _resolve_web_app_url(explicit_url: str | None = None) -> str:
    """Resolve signup URL from explicit input or runtime environment."""
    candidate = (
        explicit_url
        or os.getenv("WEB_APP_URL")
        or os.getenv("FRONTEND_URL")
        or ""
    ).strip()
    if not candidate:
        return "[web app URL]"
    return candidate


def build_unregistered_onboarding_message(web_app_url: str | None = None) -> str:
    """Build onboarding response for unregistered WhatsApp numbers."""
    resolved_url = _resolve_web_app_url(web_app_url)
    return _UNREGISTERED_MESSAGE_TEMPLATE.format(web_app_url=resolved_url)


__all__ = ["build_unregistered_onboarding_message"]
