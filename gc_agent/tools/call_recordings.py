"""Durable storage helpers for live voice-call recordings."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv

from gc_agent.db.client import get_client
from gc_agent.tools.upload_storage import build_storage_ref, parse_storage_ref

load_dotenv()

DEFAULT_RECORDING_BUCKET = os.getenv("SUPABASE_CALL_RECORDING_BUCKET", "").strip() or "call-recordings"
ALLOWED_RECORDING_MIME_TYPES = {
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
}
_BUCKET_READY: set[str] = set()


def _safe_filename(filename: str, fallback_extension: str) -> str:
    base_name = Path(filename or f"recording{fallback_extension}").name
    stem = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "-" for ch in Path(base_name).stem).strip("-.") or "recording"
    suffix = Path(base_name).suffix.lower() or fallback_extension
    return f"{stem}{suffix}"


def _ensure_bucket(bucket: str) -> None:
    normalized_bucket = bucket.strip()
    if not normalized_bucket or normalized_bucket in _BUCKET_READY:
        return

    client = get_client()
    try:
        client.storage.get_bucket(normalized_bucket)
    except Exception:
        client.storage.create_bucket(
            normalized_bucket,
            options={
                "public": False,
                "allowed_mime_types": sorted(ALLOWED_RECORDING_MIME_TYPES),
                "file_size_limit": 25 * 1024 * 1024,
            },
        )
    _BUCKET_READY.add(normalized_bucket)


def upload_call_recording_file(
    *,
    contractor_id: str,
    session_id: str,
    filename: str,
    content_type: str,
    payload: bytes,
) -> dict[str, Any]:
    """Persist one generated call recording into Supabase Storage."""
    normalized_type = content_type.strip().lower()
    expected_suffix = ALLOWED_RECORDING_MIME_TYPES.get(normalized_type)
    if not expected_suffix:
        raise ValueError("Only WAV or MP3 call recordings are supported")
    if not payload:
        raise ValueError("Call recording payload is empty")

    bucket = DEFAULT_RECORDING_BUCKET
    _ensure_bucket(bucket)

    timestamp = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    safe_filename = _safe_filename(filename, expected_suffix)
    object_path = (
        f"voice/{contractor_id.strip() or 'unknown-contractor'}/{timestamp}/"
        f"{session_id.strip() or uuid4().hex[:12]}-{uuid4().hex[:8]}-{safe_filename}"
    )

    client = get_client()
    client.storage.from_(bucket).upload(
        object_path,
        payload,
        {
            "content-type": normalized_type,
            "upsert": "false",
        },
    )

    return {
        "storage_ref": build_storage_ref(bucket, object_path),
        "bucket": bucket,
        "path": object_path,
        "filename": safe_filename,
        "content_type": normalized_type,
        "size_bytes": len(payload),
    }


def download_call_recording_file(storage_ref: str) -> tuple[bytes, str]:
    """Download one previously stored call recording and return bytes + content type."""
    bucket, object_path = parse_storage_ref(storage_ref)
    client = get_client()
    payload = client.storage.from_(bucket).download(object_path)
    suffix = Path(object_path).suffix.lower()
    content_type = "audio/mpeg" if suffix == ".mp3" else "audio/wav"
    return payload, content_type


__all__ = [
    "ALLOWED_RECORDING_MIME_TYPES",
    "DEFAULT_RECORDING_BUCKET",
    "download_call_recording_file",
    "upload_call_recording_file",
]
