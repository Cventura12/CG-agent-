"""Input normalization node for incoming GC updates."""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import re
from uuid import uuid4
from typing import Any, Optional

import httpx
from anthropic import AsyncAnthropic, RateLimitError
from dotenv import load_dotenv

from gc_agent import prompts
from gc_agent.state import AgentState
from gc_agent.telemetry import record_model_usage

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
ESTIMATE_INTENT_PATTERNS = (
    re.compile(r"\bquote\b", re.IGNORECASE),
    re.compile(r"\bestimate\b", re.IGNORECASE),
    re.compile(r"\bbid\b", re.IGNORECASE),
    re.compile(r"\bprice\s+(?:this|it|out)\b", re.IGNORECASE),
    re.compile(r"\bgive\s+me\s+(?:a|an)\s+(?:quote|estimate|number)\b", re.IGNORECASE),
)
MEASUREMENT_SIGNAL_PATTERNS = (
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:sq|squares?)\b", re.IGNORECASE),
    re.compile(r"\b\d{1,2}/12\b", re.IGNORECASE),
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:ft|feet|foot)\b", re.IGNORECASE),
    re.compile(r"\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\b", re.IGNORECASE),
)
ROOFING_CONTEXT_PATTERN = re.compile(
    r"\b(roof|roofing|ridge|eave|rake|valley|drip edge|flashing|shingle|shingles|"
    r"underlayment|bundle|tear-?off|replacement)\b",
    re.IGNORECASE,
)

_ANTHROPIC_CLIENT: Optional[AsyncAnthropic] = None


def _get_anthropic_client() -> AsyncAnthropic:
    """Return a shared AsyncAnthropic client for estimate-mode normalization."""
    global _ANTHROPIC_CLIENT

    if _ANTHROPIC_CLIENT is None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is required for ingest normalization")
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
            usage = getattr(response, "usage", None)
            record_model_usage(
                model_name=MODEL_NAME,
                input_tokens=getattr(usage, "input_tokens", None),
                output_tokens=getattr(usage, "output_tokens", None),
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


def _build_estimate_job_name(address: str, customer_name: str) -> str:
    """Build a stable placeholder job name for estimate-mode persistence."""
    if customer_name:
        return f"{customer_name} Roof Estimate"
    if address:
        return f"{address.split(',')[0].strip()} Roof Estimate"
    return "New Roof Estimate"


async def _sync_estimate_job_record(
    state: AgentState,
    cleaned_input: str,
    errors: list[str],
) -> dict[str, object]:
    """Attach or create a jobs-table record for estimate mode when available."""
    if state.active_job_id.strip() or not state.gc_id.strip():
        return {}

    try:
        from gc_agent.nodes.extract_job_scope import _extract_address, _extract_customer_name
        from gc_agent.tools import supabase
    except Exception as exc:
        errors.append(f"estimate job sync unavailable: {exc}")
        return {"errors": errors}

    address = _extract_address(cleaned_input)
    customer_name = _extract_customer_name(cleaned_input)

    try:
        existing = await asyncio.to_thread(
            supabase.find_job_by_address_or_customer,
            state.gc_id,
            address,
            customer_name,
        )
        if existing:
            return {"active_job_id": str(existing.get("id", "")).strip()}

        created = await asyncio.to_thread(
            supabase.upsert_job,
            {
                "id": f"estimate-{uuid4().hex[:12]}",
                "gc_id": state.gc_id,
                "name": _build_estimate_job_name(address, customer_name),
                "type": "roof estimate",
                "status": "active",
                "address": address,
                "contract_value": 0,
                "contract_type": "TBD",
                "est_completion": None,
                "notes": cleaned_input[:500],
            },
        )
    except Exception as exc:
        LOGGER.warning("estimate job sync failed: %s", exc)
        errors.append(f"estimate job sync failed: {exc}")
        return {"errors": errors}

    if not created:
        return {}
    return {"active_job_id": str(created.get("id", "")).strip()}


async def _run_estimate_ingest(state: AgentState) -> dict[str, object]:
    """Normalize estimating input into cleaned_input using the v5 ingest prompt."""
    errors = list(state.errors)
    source_text = await _build_estimate_source_text(state, errors)
    if not source_text:
        return {
            "mode": "estimate",
            "raw_input": state.raw_input.strip(),
            "cleaned_input": "",
            "thread_style": False,
            "active_job_id": state.active_job_id,
            "errors": errors,
        }

    if not (os.getenv("OPENAI_API_KEY", "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()):
        normalized = _normalize_cleaned_text(source_text, source_text)
        result: dict[str, object] = {
            "mode": "estimate",
            "raw_input": state.raw_input.strip(),
            "cleaned_input": normalized,
            "thread_style": False,
            "active_job_id": state.active_job_id,
            "errors": errors,
        }
        result.update(await _sync_estimate_job_record(state, normalized, errors))
        return result

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

    result = {
        "mode": "estimate",
        "raw_input": state.raw_input.strip(),
        "cleaned_input": normalized,
        "thread_style": False,
        "active_job_id": state.active_job_id,
        "errors": errors,
    }
    result.update(await _sync_estimate_job_record(state, normalized, errors))
    return result


async def _extract_ade_content(raw_input: str) -> str:
    """Run a local PDF/image file through ADE and return prompt-ready text."""
    from gc_agent.tools.ade import parse_document

    parsed = await asyncio.to_thread(parse_document, raw_input)
    prompt_text = parsed.prompt_text.strip()
    if not prompt_text:
        raise ValueError("ADE returned empty prompt text")
    return prompt_text


async def _build_estimate_source_text(state: AgentState, errors: list[str]) -> str:
    """Combine typed notes with uploaded quote source files into one ingest payload."""
    from gc_agent.tools.ade import is_supported_document

    parts: list[str] = []
    if state.raw_input.strip():
        parts.append(state.raw_input.strip())

    uploaded_files = state.uploaded_files if isinstance(state.uploaded_files, list) else []
    for item in uploaded_files:
        if not isinstance(item, dict):
            continue
        storage_ref = str(item.get("storage_ref", "")).strip()
        if not storage_ref:
            continue

        filename = str(item.get("filename", "")).strip() or "uploaded file"
        if not is_supported_document(storage_ref):
            parts.append(f"Uploaded file reference: {storage_ref}")
            continue

        try:
            ade_text = await _extract_ade_content(storage_ref)
        except Exception as exc:
            LOGGER.warning("Uploaded quote source parse failed for %s: %s", filename, exc)
            errors.append(f"uploaded file parse failed for {filename}: {exc}")
            parts.append(f"Uploaded file reference: {storage_ref}")
            continue

        parts.append(f"Uploaded file ({filename}):\n{ade_text}")

    return "\n\n".join(part.strip() for part in parts if str(part).strip())


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


def _looks_like_estimate_request(text: str) -> bool:
    """Return True when a free-form input should route to the v5 estimating path."""
    cleaned = " ".join(text.split())
    if not cleaned:
        return False

    if any(pattern.search(cleaned) for pattern in ESTIMATE_INTENT_PATTERNS):
        return True

    has_measurement_signal = any(pattern.search(cleaned) for pattern in MEASUREMENT_SIGNAL_PATTERNS)
    if has_measurement_signal and ROOFING_CONTEXT_PATTERN.search(cleaned):
        return True

    return False


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
    from gc_agent.tools.ade import is_supported_document

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

    if state.input_type != "voice" and is_supported_document(raw_input):
        try:
            raw_input = await _extract_ade_content(raw_input)
        except Exception as exc:
            LOGGER.exception("ADE document extraction failed for input=%s", raw_input)
            errors.append(f"ade extraction failed: {exc}")

    if state.mode == "estimate":
        estimate_state = state.model_copy(update={"raw_input": raw_input, "errors": errors})
        return await _run_estimate_ingest(estimate_state)

    if state.mode is None and _looks_like_estimate_request(raw_input):
        estimate_state = state.model_copy(
            update={
                "mode": "estimate",
                "raw_input": raw_input,
                "errors": errors,
            }
        )
        return await _run_estimate_ingest(estimate_state)

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
