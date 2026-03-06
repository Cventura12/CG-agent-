"""Thin LandingAI ADE wrapper for document-first ingest."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from gc_agent.tools.upload_storage import download_quote_source_file, is_storage_ref, parse_storage_ref

load_dotenv()

DEFAULT_ADE_MODEL = "dpt-2-latest"
DOCUMENT_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


@dataclass(frozen=True)
class ADEChunk:
    """Normalized ADE chunk content."""

    content: str


@dataclass(frozen=True)
class ADEParseResult:
    """Normalized ADE parse payload used by ingest."""

    markdown: str
    chunks: tuple[ADEChunk, ...]
    raw: Any

    @property
    def prompt_text(self) -> str:
        """Return the best ADE content for downstream prompts."""
        if self.markdown.strip():
            return self.markdown.strip()
        for chunk in self.chunks:
            if chunk.content.strip():
                return chunk.content.strip()
        return ""


def is_supported_document(value: str) -> bool:
    """Return True when the input points to a supported local or stored document/image."""
    candidate = value.strip()
    if is_storage_ref(candidate):
        try:
            _, object_path = parse_storage_ref(candidate)
        except ValueError:
            return False
        return Path(object_path).suffix.lower() in DOCUMENT_EXTENSIONS

    path = Path(candidate)
    return path.is_file() and path.suffix.lower() in DOCUMENT_EXTENSIONS


def _normalize_chunks(raw_chunks: Any) -> tuple[ADEChunk, ...]:
    """Normalize ADE chunk payloads into a simple tuple."""
    chunks: list[ADEChunk] = []
    for chunk in raw_chunks or []:
        content = str(getattr(chunk, "content", "") or "").strip()
        if content:
            chunks.append(ADEChunk(content=content))
    return tuple(chunks)


def _extract_markdown(result: Any) -> str:
    """Extract the best markdown content from an ADE result object."""
    markdown = str(getattr(result, "markdown", "") or "").strip()
    if markdown:
        return markdown

    chunks = _normalize_chunks(getattr(result, "chunks", None))
    for chunk in chunks:
        if chunk.content:
            return chunk.content
    return ""


def _parse_local_document(document_path: Path, model: str) -> ADEParseResult:
    """Parse a local PDF/image through LandingAI ADE and return normalized content."""
    if not document_path.is_file():
        raise FileNotFoundError(f"ADE document not found: {document_path}")
    if document_path.suffix.lower() not in DOCUMENT_EXTENSIONS:
        raise ValueError(f"Unsupported ADE document type: {document_path.suffix}")
    if not os.getenv("VISION_AGENT_API_KEY", "").strip():
        raise RuntimeError("VISION_AGENT_API_KEY is required for LandingAI ADE")

    try:
        from landingai_ade import LandingAIADE
    except Exception as exc:  # pragma: no cover - import depends on optional install
        raise RuntimeError("landingai-ade is not installed") from exc

    client = LandingAIADE()
    result = client.parse(document=document_path, model=model)
    chunks = _normalize_chunks(getattr(result, "chunks", None))
    markdown = _extract_markdown(result)
    if not markdown:
        raise ValueError("ADE returned no markdown or chunk content")

    return ADEParseResult(
        markdown=markdown,
        chunks=chunks,
        raw=result,
    )


def parse_document(document: str | Path, model: str = DEFAULT_ADE_MODEL) -> ADEParseResult:
    """Parse a PDF/image through LandingAI ADE and return normalized content."""
    if isinstance(document, Path):
        return _parse_local_document(document.expanduser(), model)

    candidate = str(document).strip()
    if is_storage_ref(candidate):
        _, object_path = parse_storage_ref(candidate)
        suffix = Path(object_path).suffix.lower()
        if suffix not in DOCUMENT_EXTENSIONS:
            raise ValueError(f"Unsupported ADE document type: {suffix}")
        payload = download_quote_source_file(candidate)
        temp_path = Path()
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                temp_file.write(payload)
                temp_path = Path(temp_file.name)
            return _parse_local_document(temp_path, model)
        finally:
            if temp_path and temp_path.exists():
                try:
                    temp_path.unlink()
                except OSError:
                    pass

    return _parse_local_document(Path(candidate).expanduser(), model)


__all__ = [
    "ADEChunk",
    "ADEParseResult",
    "DEFAULT_ADE_MODEL",
    "DOCUMENT_EXTENSIONS",
    "is_supported_document",
    "parse_document",
]
