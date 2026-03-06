"""Durable storage helpers for quote source uploads."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv

from gc_agent.db.client import get_client

load_dotenv()

DEFAULT_UPLOAD_BUCKET = os.getenv("SUPABASE_UPLOAD_BUCKET", "").strip() or "quote-intake"
STORAGE_URI_PREFIX = "supabase://"
ALLOWED_UPLOAD_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
_BUCKET_READY: set[str] = set()


def is_storage_ref(value: str) -> bool:
    """Return True when the string points at a Supabase storage object."""
    return value.strip().lower().startswith(STORAGE_URI_PREFIX)


def parse_storage_ref(storage_ref: str) -> tuple[str, str]:
    """Split a storage URI into bucket and object path."""
    value = storage_ref.strip()
    if not is_storage_ref(value):
        raise ValueError(f"Unsupported storage ref: {storage_ref}")

    without_scheme = value[len(STORAGE_URI_PREFIX) :]
    bucket, separator, object_path = without_scheme.partition("/")
    if not separator or not bucket.strip() or not object_path.strip():
        raise ValueError(f"Malformed storage ref: {storage_ref}")
    return bucket.strip(), object_path.strip()


def build_storage_ref(bucket: str, object_path: str) -> str:
    """Build a normalized storage URI."""
    return f"{STORAGE_URI_PREFIX}{bucket.strip()}/{object_path.strip()}"


def is_allowed_upload(filename: str, content_type: str) -> bool:
    """Validate browser-uploaded quote source types."""
    normalized_type = content_type.strip().lower()
    expected_suffix = ALLOWED_UPLOAD_MIME_TYPES.get(normalized_type)
    if not expected_suffix:
        return False
    suffix = Path(filename or "").suffix.lower()
    return bool(suffix) and suffix in {expected_suffix, ".jpeg" if expected_suffix == ".jpg" else expected_suffix}


def _safe_filename(filename: str, fallback_extension: str) -> str:
    """Normalize uploaded filenames for stable object paths."""
    base_name = Path(filename or f"upload{fallback_extension}").name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(base_name).stem).strip("-.") or "upload"
    suffix = Path(base_name).suffix.lower() or fallback_extension
    return f"{stem}{suffix}"


def _ensure_bucket(bucket: str) -> None:
    """Create the storage bucket on first use when needed."""
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
                "allowed_mime_types": sorted(ALLOWED_UPLOAD_MIME_TYPES),
                "file_size_limit": 10485760,
            },
        )
    _BUCKET_READY.add(normalized_bucket)


def upload_quote_source_file(
    *,
    contractor_id: str,
    session_id: str,
    filename: str,
    content_type: str,
    payload: bytes,
) -> dict[str, Any]:
    """Store one uploaded quote source file in Supabase Storage."""
    normalized_type = content_type.strip().lower()
    expected_suffix = ALLOWED_UPLOAD_MIME_TYPES.get(normalized_type)
    if not expected_suffix:
        raise ValueError("Only PDF, JPG, and PNG uploads are supported")
    if not payload:
        raise ValueError("Uploaded file is empty")
    if not is_allowed_upload(filename, normalized_type):
        raise ValueError("Uploaded filename does not match the declared file type")

    bucket = DEFAULT_UPLOAD_BUCKET
    _ensure_bucket(bucket)

    safe_filename = _safe_filename(filename, expected_suffix)
    timestamp = datetime.now(timezone.utc).strftime("%Y/%m/%d")
    session_segment = session_id.strip() or uuid4().hex[:12]
    object_path = (
        f"quotes/{contractor_id.strip() or 'unknown-contractor'}/{timestamp}/"
        f"{session_segment}-{uuid4().hex[:8]}-{safe_filename}"
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


def download_quote_source_file(storage_ref: str) -> bytes:
    """Download one previously stored quote source file from Supabase Storage."""
    bucket, object_path = parse_storage_ref(storage_ref)
    client = get_client()
    return client.storage.from_(bucket).download(object_path)


__all__ = [
    "ALLOWED_UPLOAD_MIME_TYPES",
    "DEFAULT_UPLOAD_BUCKET",
    "build_storage_ref",
    "download_quote_source_file",
    "is_allowed_upload",
    "is_storage_ref",
    "parse_storage_ref",
    "upload_quote_source_file",
]
