"""Header mapping and row-key normalization for contractor spreadsheet imports."""

from __future__ import annotations

import re
from typing import Any

SUPPORTED_IMPORT_FIELDS = (
    "item_name",
    "category",
    "unit",
    "material_cost",
    "labor_cost",
    "markup_percent",
    "default_price",
    "notes",
    "vendor",
    "sku",
)

HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "item_name": (
        "item",
        "item name",
        "name",
        "description",
        "line item",
        "service",
        "task",
    ),
    "category": ("category", "type", "trade", "group", "bucket"),
    "unit": ("unit", "uom", "measure", "unit of measure"),
    "material_cost": ("material", "material cost", "mat cost", "material price", "mat price"),
    "labor_cost": ("labor", "labour", "labor cost", "labor price", "labor amount"),
    "markup_percent": ("markup", "markup %", "markup percent", "margin", "margin %"),
    "default_price": ("price", "default price", "sell price", "sale price", "total", "rate"),
    "notes": ("notes", "note", "remarks", "comments"),
    "vendor": ("vendor", "supplier", "source"),
    "sku": ("sku", "item code", "code", "part number", "part no", "part #"),
}

PRICE_SIGNAL_PATTERNS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "labor_rate_per_square",
        ("labor rate per square", "labor per square", "labor/square", "labor sq"),
    ),
    (
        "default_markup_pct",
        ("default markup", "markup percent", "markup %", "sell markup", "standard markup"),
    ),
    (
        "tear_off_per_square",
        ("tear off", "tear-off", "tearoff"),
    ),
    (
        "laminated_shingles_per_square",
        ("laminated shingle", "architectural shingle", "shingles per square"),
    ),
    (
        "synthetic_underlayment_per_square",
        ("synthetic underlayment", "underlayment per square", "underlayment"),
    ),
)


def normalize_header(value: Any) -> str:
    """Normalize a spreadsheet header for fuzzy alias matching."""
    text = " ".join(str(value or "").strip().lower().replace("_", " ").split())
    text = re.sub(r"[^a-z0-9% ]+", "", text)
    return text


def suggest_column_mapping(headers: list[str]) -> dict[str, str]:
    """Return a best-effort mapping from normalized import fields to source headers."""
    available = [str(header or "").strip() for header in headers if str(header or "").strip()]
    normalized = {header: normalize_header(header) for header in available}
    used_headers: set[str] = set()
    mapping: dict[str, str] = {}

    for field in SUPPORTED_IMPORT_FIELDS:
        aliases = HEADER_ALIASES.get(field, ())
        best_header = ""
        best_score = -1
        for header in available:
            if header in used_headers:
                continue
            normalized_header = normalized.get(header, "")
            score = _header_score(normalized_header, aliases)
            if score > best_score:
                best_header = header
                best_score = score
        if best_header and best_score > 0:
            mapping[field] = best_header
            used_headers.add(best_header)

    return mapping


def canonical_item_key(item_name: str, sku: str = "") -> tuple[str, str]:
    """Build the stored item_key and return any recognized onboarding pricing signal key."""
    item_text = str(item_name or "").strip()
    sku_text = str(sku or "").strip()
    recognized_key = infer_price_signal_key(item_text, sku_text)
    if recognized_key:
        return recognized_key, recognized_key

    base = sku_text or item_text
    slug = re.sub(r"[^a-z0-9]+", "_", base.strip().lower()).strip("_")
    return slug[:80], ""


def infer_price_signal_key(*values: str) -> str:
    """Infer a known onboarding pricing key from free-form spreadsheet text."""
    haystack = " ".join(normalize_header(value) for value in values if str(value or "").strip())
    if not haystack:
        return ""

    for key, phrases in PRICE_SIGNAL_PATTERNS:
        for phrase in phrases:
            if normalize_header(phrase) and normalize_header(phrase) in haystack:
                return key
    return ""


def _header_score(normalized_header: str, aliases: tuple[str, ...]) -> int:
    if not normalized_header:
        return 0

    best_score = 0
    for alias in aliases:
        normalized_alias = normalize_header(alias)
        if not normalized_alias:
            continue
        if normalized_header == normalized_alias:
            best_score = max(best_score, 100)
        elif normalized_header.startswith(normalized_alias):
            best_score = max(best_score, 75)
        elif normalized_alias in normalized_header:
            best_score = max(best_score, 60)
    return best_score


__all__ = [
    "SUPPORTED_IMPORT_FIELDS",
    "canonical_item_key",
    "infer_price_signal_key",
    "normalize_header",
    "suggest_column_mapping",
]
