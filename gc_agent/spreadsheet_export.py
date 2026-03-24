"""Minimal XLSX export for GC Agent quote drafts."""

from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone
from typing import Any
from xml.sax.saxutils import escape


def build_quote_xlsx(
    quote_id: str,
    quote: dict[str, Any],
    *,
    approval_status: str = "",
    trace_id: str = "",
) -> bytes:
    """Render a quote draft into a clean XLSX workbook."""
    rows = _build_quote_rows(quote_id, quote, approval_status=approval_status, trace_id=trace_id)
    worksheet_xml = _build_worksheet_xml(rows)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml())
        archive.writestr("_rels/.rels", _root_relationships_xml())
        archive.writestr("xl/workbook.xml", _workbook_xml())
        archive.writestr("xl/_rels/workbook.xml.rels", _workbook_relationships_xml())
        archive.writestr("xl/worksheets/sheet1.xml", worksheet_xml)
    return buffer.getvalue()


def _build_quote_rows(
    quote_id: str,
    quote: dict[str, Any],
    *,
    approval_status: str,
    trace_id: str,
) -> list[list[Any]]:
    line_items = quote.get("line_items")
    rows: list[list[Any]] = [
        ["Arbor Quote Export", quote_id],
        ["Company", str(quote.get("company_name", "") or "").strip()],
        ["Customer", str(quote.get("customer_name", "") or "").strip()],
        ["Project Address", str(quote.get("project_address", "") or "").strip()],
        ["Approval Status", str(approval_status or "pending").strip()],
        ["Exported At", datetime.now(timezone.utc).isoformat()],
    ]
    if trace_id.strip():
        rows.append(["Trace ID", trace_id.strip()])
    rows.extend(
        [
            ["Scope of Work", str(quote.get("scope_of_work", "") or "").strip()],
            ["Total Price", _as_number(quote.get("total_price")) or 0],
            [],
            ["Line Items"],
            ["Description", "Quantity", "Unit", "Unit Cost", "Total"],
        ]
    )

    if isinstance(line_items, list) and line_items:
        for item in line_items:
            if not isinstance(item, dict):
                continue
            rows.append(
                [
                    str(item.get("item") or item.get("name") or "Line item").strip(),
                    _as_number(item.get("quantity")),
                    str(item.get("unit", "") or "").strip(),
                    _as_number(item.get("unit_cost")),
                    _as_number(item.get("total_cost")) or _line_total(item),
                ]
            )
    else:
        rows.append(["No structured line items available", "", "", "", ""])

    exclusions = quote.get("exclusions")
    if isinstance(exclusions, list) and exclusions:
        rows.extend([[], ["Exclusions"]])
        for entry in exclusions:
            text = str(entry or "").strip()
            if text:
                rows.append([text])

    return rows


def _line_total(item: dict[str, Any]) -> float:
    quantity = _as_number(item.get("quantity")) or 0.0
    unit_cost = _as_number(item.get("unit_cost")) or 0.0
    return round(quantity * unit_cost, 2)


def _as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    if isinstance(value, str) and value.strip():
        try:
            return round(float(value.strip().replace(",", "").replace("$", "")), 2)
        except ValueError:
            return None
    return None


def _build_worksheet_xml(rows: list[list[Any]]) -> str:
    row_nodes: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cell_nodes: list[str] = []
        for col_index, value in enumerate(row, start=1):
            if value is None or value == "":
                continue
            cell_ref = f"{_column_name(col_index)}{row_index}"
            numeric = _as_number(value)
            if numeric is not None and not isinstance(value, str):
                cell_nodes.append(f'<c r="{cell_ref}"><v>{numeric}</v></c>')
            else:
                text = escape(str(value))
                cell_nodes.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>'
                )
        row_nodes.append(f'<row r="{row_index}">{"".join(cell_nodes)}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        f"{''.join(row_nodes)}"
        "</sheetData>"
        "</worksheet>"
    )


def _column_name(index: int) -> str:
    value = index
    label = ""
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        label = chr(65 + remainder) + label
    return label


def _content_types_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )


def _root_relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def _workbook_relationships_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )


def _workbook_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        "<sheets>"
        '<sheet name="Quote" sheetId="1" r:id="rId1"/>'
        "</sheets>"
        "</workbook>"
    )


__all__ = ["build_quote_xlsx"]
