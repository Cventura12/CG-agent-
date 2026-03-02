"""Compatibility shim that routes Anthropic-style calls to OpenAI.

This keeps the existing node call sites stable while swapping the provider
from Anthropic to OpenAI.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx


def _bootstrap_env_aliases() -> None:
    """Mirror the new OpenAI env names into legacy Anthropic names when needed."""
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()
    if openai_key and not os.getenv("ANTHROPIC_API_KEY", "").strip():
        os.environ["ANTHROPIC_API_KEY"] = openai_key

    embedding_model = os.getenv("OPENAI_EMBEDDING_MODEL", "").strip()
    if embedding_model and not os.getenv("ANTHROPIC_EMBEDDING_MODEL", "").strip():
        os.environ["ANTHROPIC_EMBEDDING_MODEL"] = embedding_model


_bootstrap_env_aliases()


class RateLimitError(RuntimeError):
    """Provider-agnostic rate limit error used by the existing retry logic."""


@dataclass
class _TextBlock:
    text: str


@dataclass
class _Usage:
    input_tokens: int | None
    output_tokens: int | None


class _Response:
    """Minimal Anthropic-like response surface for existing node helpers."""

    def __init__(self, text: str, usage: dict[str, Any] | None = None) -> None:
        cleaned = text.strip()
        self.content = [_TextBlock(cleaned)] if cleaned else []
        self.usage = _Usage(
            input_tokens=_safe_int((usage or {}).get("prompt_tokens")),
            output_tokens=_safe_int((usage or {}).get("completion_tokens")),
        )


def _safe_int(value: Any) -> int | None:
    try:
        return int(value)
    except Exception:
        return None


def _resolve_model(requested_model: str) -> str:
    """Map legacy Claude defaults to an OpenAI chat model."""
    configured = os.getenv("OPENAI_MODEL", "").strip()
    if configured:
        return configured

    requested = (requested_model or "").strip().lower()
    if requested.startswith("claude"):
        return "gpt-4.1-mini"
    return requested_model or "gpt-4.1-mini"


def _flatten_user_content(messages: list[dict[str, Any]] | None) -> str:
    parts: list[str] = []
    for message in messages or []:
        content = message.get("content", "")
        if isinstance(content, str):
            parts.append(content)
            continue
        if isinstance(content, list):
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text)
    return "\n\n".join(part for part in parts if part.strip()).strip()


class _MessagesAPI:
    """Anthropic-like messages namespace backed by OpenAI chat completions."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def create(
        self,
        *,
        model: str,
        max_tokens: int,
        temperature: float = 0,
        system: str | None = None,
        messages: list[dict[str, Any]] | None = None,
        **_: Any,
    ) -> _Response:
        payload_messages: list[dict[str, Any]] = []
        if system:
            payload_messages.append({"role": "system", "content": system})

        user_text = _flatten_user_content(messages)
        if user_text:
            payload_messages.append({"role": "user", "content": user_text})

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": _resolve_model(model),
            "messages": payload_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            if response.status_code == 429:
                raise RateLimitError("OpenAI rate limit exceeded")
            response.raise_for_status()
            body = response.json()

        choice = ((body.get("choices") or [{}])[0] if isinstance(body, dict) else {})
        message = choice.get("message") if isinstance(choice, dict) else {}
        content = ""
        if isinstance(message, dict):
            raw_content = message.get("content", "")
            if isinstance(raw_content, str):
                content = raw_content
            elif isinstance(raw_content, list):
                text_parts: list[str] = []
                for item in raw_content:
                    if not isinstance(item, dict):
                        continue
                    if item.get("type") == "text" and isinstance(item.get("text"), str):
                        text_parts.append(item["text"])
                content = "\n".join(text_parts).strip()

        return _Response(content, usage=body.get("usage") if isinstance(body, dict) else None)


class AsyncAnthropic:
    """Drop-in replacement for the subset of AsyncAnthropic this repo uses."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self.messages = _MessagesAPI(api_key=api_key)

