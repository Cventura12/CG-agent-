"""Spreadsheet parsing and price-book import normalization."""

from __future__ import annotations

import csv
import io
import json
import posixpath
import zipfile
from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4
from xml.etree import ElementTree

from pydantic import BaseModel, Field

from gc_agent.db import queries
from gc_agent.spreadsheet_mapping import SUPPORTED_IMPORT_FIELDS, canonical_item_key, suggest_column_mapping

SUPPORTED_SPREADSHEET_EXTENSIONS = (".csv", ".xlsx")
SUPPORTED_SOURCE_TYPES = ("csv", "xlsx")
SPREADSHEET_MEDIA_TYPES = {
    "text/csv": "csv",
    "application/csv": "csv",
    "application/vnd.ms-excel": "csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
}

_OOXML_NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}


class SpreadsheetImportMapping(BaseModel):
    """User-confirmed mapping between workbook headers and normalized import fields."""

    item_name: str = ""
    category: str = ""
    unit: str = ""
    material_cost: str = ""
    labor_cost: str = ""
    markup_percent: str = ""
    default_price: str = ""
    notes: str = ""
    vendor: str = ""
    sku: str = ""


class NormalizedPriceBookRow(BaseModel):
    """Normalized price-book row ready for preview or commit."""

    row_number: int
    item_name: str = ""
    category: str = ""
    unit: str = ""
    material_cost: float | None = None
    labor_cost: float | None = None
    markup_percent: float | None = None
    default_price: float | None = None
    notes: str = ""
    vendor: str = ""
    sku: str = ""
    item_key: str = ""
    recognized_key: str = ""
    resolved_unit_cost: float | None = None
    status: Literal["ready", "skipped"] = "ready"
    reason: str = ""


class PricingImportPreviewRow(BaseModel):
    """One preview row with source values and normalized interpretation."""

    row_number: int
    raw: dict[str, str] = Field(default_factory=dict)
    normalized: NormalizedPriceBookRow


class PricingImportPreviewResult(BaseModel):
    """Workbook preview payload returned before committing a price-book import."""

    filename: str
    source_type: Literal["csv", "xlsx"]
    sheet_names: list[str]
    selected_sheet: str
    headers: list[str]
    suggested_mapping: SpreadsheetImportMapping
    preview_rows: list[PricingImportPreviewRow]
    total_rows: int


class PricingImportCommitResult(BaseModel):
    """Commit summary after writing normalized rows into pricing storage."""

    import_log_id: str
    trace_id: str
    filename: str
    source_type: Literal["csv", "xlsx"]
    sheet_name: str
    mapping: SpreadsheetImportMapping
    imported_count: int
    skipped_count: int
    error_count: int
    imported_rows: list[NormalizedPriceBookRow]
    skipped_rows: list[NormalizedPriceBookRow]


@dataclass(slots=True)
class _WorkbookSheet:
    name: str
    rows: list[list[str]]


@dataclass(slots=True)
class _WorkbookData:
    filename: str
    source_type: Literal["csv", "xlsx"]
    sheets: list[_WorkbookSheet]


def preview_pricing_import(
    *,
    filename: str,
    payload: bytes,
    sheet_name: str = "",
) -> PricingImportPreviewResult:
    """Parse a spreadsheet into a preview payload with suggested column mapping."""
    workbook = _parse_workbook(filename, payload)
    sheet = _select_sheet(workbook, sheet_name)
    headers, body_rows = _split_sheet_rows(sheet)
    mapping = SpreadsheetImportMapping.model_validate(suggest_column_mapping(headers))
    preview_rows = _preview_rows(headers, body_rows, mapping)
    return PricingImportPreviewResult(
        filename=workbook.filename,
        source_type=workbook.source_type,
        sheet_names=[entry.name for entry in workbook.sheets],
        selected_sheet=sheet.name,
        headers=headers,
        suggested_mapping=mapping,
        preview_rows=preview_rows,
        total_rows=len(body_rows),
    )


async def commit_pricing_import(
    *,
    gc_id: str,
    filename: str,
    payload: bytes,
    mapping: dict[str, Any] | SpreadsheetImportMapping,
    sheet_name: str = "",
    trace_id: str = "",
) -> PricingImportCommitResult:
    """Parse, normalize, and persist a contractor price book import."""
    workbook = _parse_workbook(filename, payload)
    sheet = _select_sheet(workbook, sheet_name)
    headers, body_rows = _split_sheet_rows(sheet)
    normalized_mapping = _coerce_mapping(headers, mapping)
    normalized_rows = _normalize_rows(headers, body_rows, normalized_mapping)
    imported_rows = [row for row in normalized_rows if row.status == "ready" and row.item_key]
    skipped_rows = [row for row in normalized_rows if row.status == "skipped"]

    effective_trace_id = trace_id.strip() or uuid4().hex
    persistence = await queries.write_pricing_import_log(
        gc_id=gc_id,
        filename=workbook.filename,
        sheet_name=sheet.name,
        source_type=workbook.source_type,
        mapping=normalized_mapping.model_dump(mode="json"),
        imported_rows=[row.model_dump(mode="json") for row in imported_rows],
        skipped_rows=[row.model_dump(mode="json") for row in skipped_rows],
        trace_id=effective_trace_id,
    )

    return PricingImportCommitResult(
        import_log_id=str(persistence.get("import_log_id", "")).strip(),
        trace_id=effective_trace_id,
        filename=workbook.filename,
        source_type=workbook.source_type,
        sheet_name=sheet.name,
        mapping=normalized_mapping,
        imported_count=int(persistence.get("imported_count", 0)),
        skipped_count=int(persistence.get("skipped_count", 0)),
        error_count=int(persistence.get("error_count", 0)),
        imported_rows=imported_rows[:20],
        skipped_rows=skipped_rows[:20],
    )


def parse_mapping_json(raw_value: str) -> SpreadsheetImportMapping:
    """Parse a JSON mapping payload into the normalized mapping model."""
    try:
        parsed = json.loads(raw_value)
    except json.JSONDecodeError as exc:
        raise ValueError("mapping_json must be valid JSON") from exc
    return SpreadsheetImportMapping.model_validate(parsed)


def _parse_workbook(filename: str, payload: bytes) -> _WorkbookData:
    source_type = _detect_source_type(filename)
    if source_type == "csv":
        rows = _parse_csv_rows(payload)
        return _WorkbookData(
            filename=str(filename or "price-book.csv").strip() or "price-book.csv",
            source_type="csv",
            sheets=[_WorkbookSheet(name="Sheet1", rows=rows)],
        )
    if source_type == "xlsx":
        return _parse_xlsx_workbook(filename, payload)
    raise ValueError("Only CSV and XLSX pricing sheets are supported")


def _detect_source_type(filename: str) -> Literal["csv", "xlsx"]:
    lower_name = str(filename or "").strip().lower()
    for extension in SUPPORTED_SPREADSHEET_EXTENSIONS:
        if lower_name.endswith(extension):
            return "xlsx" if extension == ".xlsx" else "csv"
    raise ValueError("Only CSV and XLSX pricing sheets are supported")


def _parse_csv_rows(payload: bytes) -> list[list[str]]:
    text = _decode_text(payload)
    reader = csv.reader(io.StringIO(text))
    return [_trim_row([str(value or "").strip() for value in row]) for row in reader if any(str(value or "").strip() for value in row)]


def _parse_xlsx_workbook(filename: str, payload: bytes) -> _WorkbookData:
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile as exc:
        raise ValueError("The uploaded XLSX file is not a valid workbook") from exc

    try:
        workbook_root = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    except KeyError as exc:
        raise ValueError("The uploaded XLSX file is missing workbook metadata") from exc

    shared_strings = _read_shared_strings(archive)
    relationships = _read_workbook_relationships(archive)
    sheets: list[_WorkbookSheet] = []

    for sheet_node in workbook_root.findall("main:sheets/main:sheet", _OOXML_NS):
        name = str(sheet_node.attrib.get("name", "")).strip() or f"Sheet{len(sheets) + 1}"
        rel_id = str(sheet_node.attrib.get(f"{{{_OOXML_NS['rel']}}}id", "")).strip()
        target = relationships.get(rel_id, "")
        if not target:
            continue
        worksheet_path = posixpath.normpath(posixpath.join("xl", target))
        try:
            worksheet_root = ElementTree.fromstring(archive.read(worksheet_path))
        except KeyError:
            continue
        rows = _read_worksheet_rows(worksheet_root, shared_strings)
        sheets.append(_WorkbookSheet(name=name, rows=rows))

    if not sheets:
        raise ValueError("The uploaded XLSX file does not contain any readable sheets")

    return _WorkbookData(
        filename=str(filename or "price-book.xlsx").strip() or "price-book.xlsx",
        source_type="xlsx",
        sheets=sheets,
    )


def _read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        raw = archive.read("xl/sharedStrings.xml")
    except KeyError:
        return []

    root = ElementTree.fromstring(raw)
    values: list[str] = []
    for node in root.findall("main:si", _OOXML_NS):
        text = "".join(part.text or "" for part in node.findall(".//main:t", _OOXML_NS))
        values.append(text)
    return values


def _read_workbook_relationships(archive: zipfile.ZipFile) -> dict[str, str]:
    try:
        raw = archive.read("xl/_rels/workbook.xml.rels")
    except KeyError:
        return {}

    root = ElementTree.fromstring(raw)
    relationships: dict[str, str] = {}
    for node in root.findall("pkg:Relationship", _OOXML_NS):
        rel_id = str(node.attrib.get("Id", "")).strip()
        target = str(node.attrib.get("Target", "")).strip()
        if rel_id and target:
            relationships[rel_id] = target
    return relationships


def _read_worksheet_rows(root: ElementTree.Element, shared_strings: list[str]) -> list[list[str]]:
    rows: list[list[str]] = []
    for row_node in root.findall(".//main:sheetData/main:row", _OOXML_NS):
        values: list[str] = []
        for cell_node in row_node.findall("main:c", _OOXML_NS):
            ref = str(cell_node.attrib.get("r", "")).strip()
            column_index = _column_index_from_ref(ref)
            while len(values) <= column_index:
                values.append("")
            values[column_index] = _read_cell_value(cell_node, shared_strings)
        trimmed = _trim_row(values)
        if any(value.strip() for value in trimmed):
            rows.append(trimmed)
    return rows


def _read_cell_value(cell_node: ElementTree.Element, shared_strings: list[str]) -> str:
    cell_type = str(cell_node.attrib.get("t", "")).strip()
    if cell_type == "inlineStr":
        return "".join(part.text or "" for part in cell_node.findall(".//main:t", _OOXML_NS)).strip()

    value_node = cell_node.find("main:v", _OOXML_NS)
    raw_value = str(value_node.text or "").strip() if value_node is not None else ""
    if cell_type == "s":
        index = int(raw_value or 0)
        if 0 <= index < len(shared_strings):
            return shared_strings[index].strip()
        return ""
    if cell_type == "b":
        return "true" if raw_value == "1" else "false"
    return raw_value


def _column_index_from_ref(ref: str) -> int:
    letters = "".join(character for character in ref if character.isalpha()).upper()
    if not letters:
        return 0

    index = 0
    for character in letters:
        index = index * 26 + (ord(character) - 64)
    return max(index - 1, 0)


def _decode_text(payload: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return payload.decode(encoding)
        except UnicodeDecodeError:
            continue
    return payload.decode("utf-8", errors="ignore")


def _select_sheet(workbook: _WorkbookData, requested_sheet: str) -> _WorkbookSheet:
    requested = str(requested_sheet or "").strip()
    if not requested:
        return workbook.sheets[0]

    for sheet in workbook.sheets:
        if sheet.name == requested:
            return sheet
    raise ValueError(f"Sheet '{requested}' was not found in the uploaded workbook")


def _split_sheet_rows(sheet: _WorkbookSheet) -> tuple[list[str], list[list[str]]]:
    if not sheet.rows:
        raise ValueError("The uploaded worksheet is empty")

    headers = [str(value or "").strip() for value in sheet.rows[0]]
    if not any(headers):
        raise ValueError("The uploaded worksheet is missing a header row")

    deduped_headers: list[str] = []
    seen: dict[str, int] = {}
    for index, header in enumerate(headers):
        base = header or f"Column {index + 1}"
        seen[base] = seen.get(base, 0) + 1
        deduped_headers.append(base if seen[base] == 1 else f"{base} ({seen[base]})")

    return deduped_headers, sheet.rows[1:]


def _trim_row(values: list[str]) -> list[str]:
    trimmed = list(values)
    while trimmed and not str(trimmed[-1] or "").strip():
        trimmed.pop()
    return trimmed


def _coerce_mapping(
    headers: list[str],
    mapping: dict[str, Any] | SpreadsheetImportMapping,
) -> SpreadsheetImportMapping:
    candidate = (
        mapping if isinstance(mapping, SpreadsheetImportMapping) else SpreadsheetImportMapping.model_validate(mapping)
    )
    allowed_headers = {str(header).strip() for header in headers}
    sanitized: dict[str, str] = {}
    for field in SUPPORTED_IMPORT_FIELDS:
        selected = str(getattr(candidate, field, "") or "").strip()
        if selected and selected in allowed_headers:
            sanitized[field] = selected
    if not sanitized:
        sanitized = suggest_column_mapping(headers)
    return SpreadsheetImportMapping.model_validate(sanitized)


def _preview_rows(
    headers: list[str],
    body_rows: list[list[str]],
    mapping: SpreadsheetImportMapping,
    *,
    limit: int = 20,
) -> list[PricingImportPreviewRow]:
    return [
        PricingImportPreviewRow(
            row_number=row_number,
            raw=raw,
            normalized=normalized,
        )
        for row_number, raw, normalized in _iterate_normalized_rows(headers, body_rows, mapping, limit=limit)
    ]


def _normalize_rows(
    headers: list[str],
    body_rows: list[list[str]],
    mapping: SpreadsheetImportMapping,
) -> list[NormalizedPriceBookRow]:
    return [normalized for _, _, normalized in _iterate_normalized_rows(headers, body_rows, mapping)]


def _iterate_normalized_rows(
    headers: list[str],
    body_rows: list[list[str]],
    mapping: SpreadsheetImportMapping,
    *,
    limit: int | None = None,
) -> list[tuple[int, dict[str, str], NormalizedPriceBookRow]]:
    results: list[tuple[int, dict[str, str], NormalizedPriceBookRow]] = []
    index_map = {header: idx for idx, header in enumerate(headers)}

    for offset, row in enumerate(body_rows, start=2):
        raw = {
            header: str(row[index_map[header]] or "").strip()
            if index_map[header] < len(row)
            else ""
            for header in headers
        }
        normalized = _normalize_row(raw, mapping, row_number=offset)
        results.append((offset, raw, normalized))
        if limit is not None and len(results) >= limit:
            break
    return results


def _normalize_row(
    raw: dict[str, str],
    mapping: SpreadsheetImportMapping,
    *,
    row_number: int,
) -> NormalizedPriceBookRow:
    resolved = {
        field: str(raw.get(getattr(mapping, field), "") or "").strip()
        for field in SUPPORTED_IMPORT_FIELDS
    }

    item_name = resolved["item_name"] or resolved["sku"]
    item_key, recognized_key = canonical_item_key(item_name, resolved["sku"])

    material_cost = _optional_float(resolved["material_cost"])
    labor_cost = _optional_float(resolved["labor_cost"])
    markup_percent = _optional_float(resolved["markup_percent"])
    default_price = _optional_float(resolved["default_price"])
    resolved_unit_cost = _resolved_unit_cost(
        material_cost=material_cost,
        labor_cost=labor_cost,
        markup_percent=markup_percent,
        default_price=default_price,
    )

    status: Literal["ready", "skipped"] = "ready"
    reason = ""
    if not item_name:
        status = "skipped"
        reason = "Missing item name or SKU"
    elif resolved_unit_cost is None or resolved_unit_cost <= 0:
        status = "skipped"
        reason = "No usable price columns were found"
    elif not item_key:
        status = "skipped"
        reason = "Could not generate an item key"

    return NormalizedPriceBookRow(
        row_number=row_number,
        item_name=item_name,
        category=resolved["category"],
        unit=resolved["unit"] or "unit",
        material_cost=material_cost,
        labor_cost=labor_cost,
        markup_percent=markup_percent,
        default_price=default_price,
        notes=resolved["notes"],
        vendor=resolved["vendor"],
        sku=resolved["sku"],
        item_key=item_key,
        recognized_key=recognized_key,
        resolved_unit_cost=resolved_unit_cost,
        status=status,
        reason=reason,
    )


def _resolved_unit_cost(
    *,
    material_cost: float | None,
    labor_cost: float | None,
    markup_percent: float | None,
    default_price: float | None,
) -> float | None:
    if default_price is not None and default_price > 0:
        return round(default_price, 2)

    base_cost = (material_cost or 0.0) + (labor_cost or 0.0)
    if base_cost <= 0:
        return None

    multiplier = 1.0 + max(markup_percent or 0.0, 0.0) / 100.0
    return round(base_cost * multiplier, 2)


def _optional_float(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = text.replace(",", "").replace("$", "").replace("%", "")
    try:
        return round(float(normalized), 2)
    except ValueError:
        return None


__all__ = [
    "NormalizedPriceBookRow",
    "PricingImportCommitResult",
    "PricingImportPreviewResult",
    "SpreadsheetImportMapping",
    "commit_pricing_import",
    "parse_mapping_json",
    "preview_pricing_import",
]
