"""Input normalization node for incoming GC updates."""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
from typing import Any, Optional

import httpx
from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState

load_dotenv()

LOGGER = logging.getLogger(__name__)
MODEL_NAME = "claude-sonnet-4-20250514"
THREAD_LINE_PATTERN = re.compile(r"^\[[^\]]+\]:\s+.+")
QUERY_PATTERNS = (
    re.compile(r"\bwhat'?s\s+open\s+on\b", re.IGNORECASE),
    re.compile(r"\bstatus\s+of\b", re.IGNORECASE),
    re.compile(r"\bwhat\s+is\s+the\s+status\s+of\b", re.IGNORECASE),
    re.compile(r"\bwhere\s+are\s+we\s+on\b", re.IGNORECASE),
)

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for estimate-mode normalization."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is required for ingest normalization")
        _ANTHROPIC_CLIENT = AsyncAnthropic(api_key=api_key)

    return _ANTHROPIC_CLIENT


def _extract_message_text(response: Any) -> str:
    """Flatten Anthropic content blocks into plain text."""
    parts: list[str] = []

    for block in getattr(response, "content", []) or []:
        text = getattr(block, "text", None)
        if isinstance(text, str) and text.strip():
            parts.append(text)

    result = "\n".join(parts).strip()
    if not result:
        raise ValueError("Claude returned empty ingest output")

    return result


async def _call_claude(system: str, user: str, max_tokens: int = 600) -> str:
    """Call Claude with retry support and return normalized text."""
    client = _get_anthropic_client()

    for attempt in range(1, 4):
        try:
            response = await client.messages.create(
                model=MODEL_NAME,
                max_tokens=max_tokens,
                temperature=0,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            return _extract_message_text(response)
        except RateLimitError:
            LOGGER.warning("ingest rate limited on attempt %s/3", attempt)
            if attempt >= 3:
                raise
            await asyncio.sleep(2)


def _normalize_cleaned_text(raw: str, fallback: str) -> str:
    """Collapse excess whitespace and prefer a non-empty cleaned result."""
    candidate = " ".join(raw.split())
    if candidate:
        return candidate
    return " ".join(fallback.split())


async def _run_estimate_ingest(raw_input: str, errors: list[str]) -> dict[str, object]:
    """Normalize estimating input into cleaned_input using the v5 ingest prompt."""
    source_text = raw_input.strip()
    if not source_text:
        return {
            "mode": "estimate",
            "raw_input": "",
            "cleaned_input": "",
            "thread_style": False,
            "errors": errors,
        }

    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        normalized = _normalize_cleaned_text(source_text, source_text)
        return {
            "mode": "estimate",
            "raw_input": source_text,
            "cleaned_input": normalized,
            "thread_style": False,
            "errors": errors,
        }

    try:
        cleaned = await _call_claude(
            system=prompts.INGEST_SYSTEM,
            user=source_text,
            max_tokens=600,
        )
        normalized = _normalize_cleaned_text(cleaned, source_text)
    except Exception as exc:
        LOGGER.exception("Estimate ingest normalization failed")
        errors.append(f"estimate ingest failed: {exc}")
        normalized = _normalize_cleaned_text(source_text, source_text)

    return {
        "mode": "estimate",
        "raw_input": source_text,
        "cleaned_input": normalized,
        "thread_style": False,
        "errors": errors,
    }


def _looks_like_thread_style(text: str) -> bool:
    """Detect forwarded thread style content based on leading line patterns."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) < 2:
        return False

    consecutive_matches = 0
    for line in lines:
        if THREAD_LINE_PATTERN.match(line):
            consecutive_matches += 1
            continue
        break

    return consecutive_matches >= 2


def _is_query_message(text: str) -> bool:
    """Return True when message is a pure status question rather than an update."""
    cleaned = text.strip()
    if not cleaned:
        return False

    if any(pattern.search(cleaned) for pattern in QUERY_PATTERNS):
        return True

    single_line_question = "\n" not in cleaned and cleaned.endswith("?")
    short_question = len(cleaned.split()) <= 18
    return single_line_question and short_question


def _nested_get(value: Any, key: str) -> Any:
    """Read a field from dict-like or attribute-based objects."""
    if isinstance(value, dict):
        return value.get(key)
    return getattr(value, key, None)


async def _download_audio(audio_url: str) -> bytes:
    """Download Twilio-hosted voice-note bytes with basic auth."""
    account_sid = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    if not account_sid or not auth_token:
        raise RuntimeError("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required for voice download")

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(audio_url, auth=(account_sid, auth_token))
        response.raise_for_status()
        return response.content


def _extract_transcript(response: Any) -> str:
    """Extract transcript from Deepgram response payload."""
    results = _nested_get(response, "results")
    channels = _nested_get(results, "channels") or []
    if not channels:
        raise ValueError("Deepgram response missing results.channels")

    alternatives = _nested_get(channels[0], "alternatives") or []
    if not alternatives:
        raise ValueError("Deepgram response missing alternatives")

    transcript = str(_nested_get(alternatives[0], "transcript") or "").strip()
    if not transcript:
        raise ValueError("Deepgram returned empty transcript")

    return transcript


async def _call_deepgram_transcribe(
    deepgram: Any,
    audio_bytes: bytes,
) -> Any:
    """Invoke Deepgram transcription and support sync/async SDK variants."""
    transcribe_fn = deepgram.listen.v1.media.transcribe_file
    if inspect.iscoroutinefunction(transcribe_fn):
        return await transcribe_fn(
            request=audio_bytes,
            model="nova-2",
            language="en-US",
            smart_format=True,
            punctuate=True,
            utterances=False,
        )
    return await asyncio.to_thread(
        transcribe_fn,
        request=audio_bytes,
        model="nova-2",
        language="en-US",
        smart_format=True,
        punctuate=True,
        utterances=False,
    )


async def _transcribe_audio(audio_url: str) -> str:
    """Transcribe Twilio audio URL with Deepgram Nova-2."""
    normalized_url = audio_url.strip()
    if not normalized_url:
        raise ValueError("Audio URL is required for voice transcription")

    deepgram_api_key = os.getenv("DEEPGRAM_API_KEY", "").strip()
    if not deepgram_api_key:
        raise RuntimeError("DEEPGRAM_API_KEY is required for voice transcription")

    from deepgram import DeepgramClient

    audio_bytes = await _download_audio(normalized_url)
    deepgram = DeepgramClient(api_key=deepgram_api_key)
    response = await _call_deepgram_transcribe(deepgram, audio_bytes)
    transcript = _extract_transcript(response)

    LOGGER.debug(
        "Voice transcript length=%s preview=%s",
        len(transcript),
        transcript[:100],
    )
    return transcript


async def ingest(state: AgentState) -> dict[str, object]:
    """Normalize raw input and detect routing mode for downstream graph nodes."""
    if state.input_type == "cron":
        LOGGER.debug("ingest input_type=%s detected_mode=briefing", state.input_type)
        return {"mode": "briefing", "thread_style": False}

    raw_input = state.raw_input
    errors = list(state.errors)

    if state.input_type == "voice":
        audio_url = state.raw_input.strip()
        try:
            raw_input = await _transcribe_audio(audio_url)
        except Exception as exc:
            LOGGER.exception("Voice transcription failed for url=%s", audio_url)
            raw_input = f"Voice note could not be transcribed\n{audio_url}"
            errors.append(f"voice transcription failed: {exc}")

    if state.mode in {None, "estimate"}:
        return await _run_estimate_ingest(raw_input, errors)

    cleaned_input = raw_input.strip()
    thread_style = _looks_like_thread_style(cleaned_input)
    detected_mode = "query" if _is_query_message(cleaned_input) else "update"

    if detected_mode == "query":
        errors.append("query mode not yet implemented")

    LOGGER.debug(
        "ingest input_type=%s detected_mode=%s thread_style=%s",
        state.input_type,
        detected_mode,
        thread_style,
    )

    return {
        "mode": detected_mode,
        "raw_input": cleaned_input,
        "thread_style": thread_style,
        "errors": errors,
    }


__all__ = ["ingest", "_call_claude", "_transcribe_audio"]
