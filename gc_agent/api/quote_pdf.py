"""PDF rendering helpers for quote review and send flows."""

from __future__ import annotations

from io import BytesIO
from typing import Any


def _line_item_total(item: dict[str, Any]) -> float:
    """Return the best available total for a quote line item."""
    total_cost = item.get("total_cost")
    if isinstance(total_cost, (int, float)):
        return float(total_cost)

    quantity = item.get("quantity")
    unit_cost = item.get("unit_cost")
    if isinstance(quantity, (int, float)) and isinstance(unit_cost, (int, float)):
        return float(quantity) * float(unit_cost)

    return 0.0


def _money(value: Any) -> str:
    """Format a value as whole-dollar USD text."""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        amount = 0.0
    return f"${amount:,.0f}"


def _normalize_line_items(line_items: Any) -> list[dict[str, str]]:
    """Normalize line items into string cells for the PDF table."""
    rows: list[dict[str, str]] = []
    if not isinstance(line_items, list):
        return rows

    for item in line_items:
        if not isinstance(item, dict):
            continue
        label = str(item.get("item") or item.get("name") or "Line item").strip()
        quantity = item.get("quantity")
        unit = str(item.get("unit") or "unit").strip()
        rows.append(
            {
                "item": label,
                "quantity": f"{quantity} {unit}".strip() if quantity not in (None, "") else unit,
                "total": _money(_line_item_total(item)),
            }
        )
    return rows


def render_quote_pdf(quote_id: str, quote_draft: dict[str, Any]) -> bytes:
    """Render a quote draft into a simple professional PDF."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.units import inch
        from reportlab.pdfbase.pdfmetrics import stringWidth
        from reportlab.platypus import Table, TableStyle
        from reportlab.pdfgen import canvas
    except ImportError as exc:  # pragma: no cover - dependency is optional until installed
        raise RuntimeError("reportlab is required for PDF rendering") from exc

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER

    orange = colors.HexColor("#C65A1E")
    ink = colors.HexColor("#182028")
    muted = colors.HexColor("#58606B")
    line = colors.HexColor("#D7DCE2")

    y = height - 0.65 * inch

    def draw_wrapped_text(
        text: str,
        x: float,
        y_cursor: float,
        *,
        font_name: str = "Helvetica",
        font_size: int = 10,
        color: Any = ink,
        leading: float = 14,
        max_width: float = 6.6 * inch,
    ) -> float:
        pdf.setFont(font_name, font_size)
        pdf.setFillColor(color)

        words = str(text or "").split()
        if not words:
            return y_cursor

        current = words[0]
        lines: list[str] = []
        for word in words[1:]:
            candidate = f"{current} {word}"
            if stringWidth(candidate, font_name, font_size) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)

        for line_text in lines:
            pdf.drawString(x, y_cursor, line_text)
            y_cursor -= leading
        return y_cursor

    def section_title(title: str, y_cursor: float) -> float:
        pdf.setFont("Helvetica-Bold", 10)
        pdf.setFillColor(orange)
        pdf.drawString(0.7 * inch, y_cursor, title.upper())
        return y_cursor - 0.18 * inch

    contractor_name = str(quote_draft.get("company_name") or "GC Agent Contractor").strip()
    customer_name = str(quote_draft.get("customer_name") or "Customer").strip()
    project_address = str(quote_draft.get("project_address") or "Project address pending").strip()
    scope = str(quote_draft.get("scope_of_work") or "").strip()
    exclusions = quote_draft.get("exclusions") if isinstance(quote_draft.get("exclusions"), list) else []
    terms = str(
        quote_draft.get("approval_notes") or "Field conditions and concealed damage are subject to final review."
    ).strip()
    line_items = _normalize_line_items(quote_draft.get("line_items"))

    pdf.setFillColor(orange)
    pdf.rect(0.55 * inch, y - 0.35 * inch, width - 1.1 * inch, 0.65 * inch, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(0.75 * inch, y - 0.02 * inch, contractor_name)
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(width - 0.75 * inch, y + 0.02 * inch, "PROFESSIONAL QUOTE")
    pdf.drawRightString(width - 0.75 * inch, y - 0.16 * inch, f"Quote ID: {quote_id}")
    y -= 0.9 * inch

    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(0.7 * inch, y, customer_name)
    pdf.setFont("Helvetica", 10)
    pdf.setFillColor(muted)
    pdf.drawString(0.7 * inch, y - 0.18 * inch, project_address)
    y -= 0.42 * inch

    pdf.setStrokeColor(line)
    pdf.line(0.7 * inch, y, width - 0.7 * inch, y)
    y -= 0.28 * inch

    y = section_title("Scope of Work", y)
    y = draw_wrapped_text(scope or "Scope of work pending.", 0.7 * inch, y, max_width=6.7 * inch)
    y -= 0.12 * inch

    y = section_title("Materials", y)
    if line_items:
        table = Table(
            [["Item", "Qty", "Total"]]
            + [[row["item"], row["quantity"], row["total"]] for row in line_items],
            colWidths=[3.9 * inch, 1.2 * inch, 1.2 * inch],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F4E9E2")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), ink),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, line),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FAFBFC")]),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        table_width, table_height = table.wrapOn(pdf, 0, 0)
        table.drawOn(pdf, 0.7 * inch, y - table_height)
        y -= table_height + 0.18 * inch
    else:
        y = draw_wrapped_text("Material detail pending.", 0.7 * inch, y)
        y -= 0.08 * inch

    y = section_title("Price Summary", y)
    pdf.setFillColor(colors.HexColor("#EEF8F0"))
    pdf.roundRect(0.7 * inch, y - 0.48 * inch, 2.6 * inch, 0.5 * inch, 8, fill=1, stroke=0)
    pdf.setFillColor(ink)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(0.88 * inch, y - 0.18 * inch, "Total Price")
    pdf.drawRightString(3.05 * inch, y - 0.18 * inch, _money(quote_draft.get("total_price")))
    y -= 0.72 * inch

    y = section_title("Terms", y)
    y = draw_wrapped_text(terms, 0.7 * inch, y)
    y -= 0.12 * inch

    y = section_title("Exclusions", y)
    if exclusions:
        for item in exclusions:
            bullet_text = f"- {str(item).strip()}"
            y = draw_wrapped_text(bullet_text, 0.85 * inch, y, max_width=6.5 * inch)
    else:
        y = draw_wrapped_text("- No additional exclusions listed.", 0.85 * inch, y, max_width=6.5 * inch)
    y -= 0.18 * inch

    if y < 1.5 * inch:
        pdf.showPage()
        y = height - 1.2 * inch

    y = section_title("Acceptance", y)
    pdf.setStrokeColor(line)
    pdf.line(0.7 * inch, y - 0.2 * inch, 3.8 * inch, y - 0.2 * inch)
    pdf.line(4.2 * inch, y - 0.2 * inch, width - 0.8 * inch, y - 0.2 * inch)
    pdf.setFont("Helvetica", 8)
    pdf.setFillColor(muted)
    pdf.drawString(0.7 * inch, y - 0.35 * inch, "Customer Signature")
    pdf.drawString(4.2 * inch, y - 0.35 * inch, "Date")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


__all__ = ["render_quote_pdf"]
