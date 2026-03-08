from __future__ import annotations

import io
import zipfile
from importlib import import_module
from xml.sax.saxutils import escape

import httpx
import pytest
from fastapi import FastAPI

from gc_agent.auth import get_current_gc

pricing_module = import_module("gc_agent.routers.pricing")


def _build_test_app() -> FastAPI:
    app = FastAPI()
    app.include_router(pricing_module.router, prefix="/api/v1")
    return app


def _column_name(index: int) -> str:
    value = index
    label = ""
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        label = chr(65 + remainder) + label
    return label


def _inline_sheet_xml(rows: list[list[object]]) -> str:
    row_nodes: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cell_nodes: list[str] = []
        for col_index, value in enumerate(row, start=1):
            if value is None or value == "":
                continue
            cell_ref = f"{_column_name(col_index)}{row_index}"
            if isinstance(value, (int, float)):
                cell_nodes.append(f'<c r="{cell_ref}"><v>{value}</v></c>')
            else:
                cell_nodes.append(
                    f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>'
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


def _build_xlsx_workbook(sheet_name: str, rows: list[list[object]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            f'<sheet name="{escape(sheet_name)}" sheetId="1" r:id="rId1"/>'
            "</sheets>"
            "</workbook>",
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            'Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", _inline_sheet_xml(rows))
    return buffer.getvalue()


def _multipart_file(name: str, payload: bytes, content_type: str) -> dict[str, tuple[str, bytes, str]]:
    return {"file": (name, payload, content_type)}


@pytest.mark.asyncio
async def test_pricing_import_preview_csv_suggests_messy_header_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_profile_by_clerk_user_id(clerk_user_id: str) -> dict[str, str]:
        assert clerk_user_id == "clerk-user-123"
        return {"id": "gc-demo"}

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(
        pricing_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )

    csv_bytes = (
        "Line Item,UOM,Mat Cost,Labor Cost,Markup %,Sell Price,Vendor\n"
        "Architectural shingles,bundle,32,12,25,55,ABC Supply\n"
        "Synthetic underlayment,roll,84,0,18,99,ABC Supply\n"
    ).encode("utf-8")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/pricing/import/preview",
            files=_multipart_file("price-book.csv", csv_bytes, "text/csv"),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    data = payload["data"]
    assert data["source_type"] == "csv"
    assert data["suggested_mapping"]["item_name"] == "Line Item"
    assert data["suggested_mapping"]["unit"] == "UOM"
    assert data["suggested_mapping"]["material_cost"] == "Mat Cost"
    assert data["suggested_mapping"]["labor_cost"] == "Labor Cost"
    assert data["suggested_mapping"]["markup_percent"] == "Markup %"
    assert data["suggested_mapping"]["default_price"] == "Sell Price"
    assert data["preview_rows"][0]["normalized"]["status"] == "ready"
    assert data["preview_rows"][0]["normalized"]["resolved_unit_cost"] == 55.0


@pytest.mark.asyncio
async def test_pricing_import_preview_xlsx_reads_sheet_and_headers(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_profile_by_clerk_user_id(_: str) -> dict[str, str]:
        return {"id": "gc-demo"}

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(
        pricing_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )

    workbook = _build_xlsx_workbook(
        "Roofing Sheet",
        [
            ["Item", "Unit", "Price", "Vendor"],
            ["Drip edge", "piece", 7.5, "ABC Supply"],
            ["Ice shield", "roll", 110, "ABC Supply"],
        ],
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/pricing/import/preview",
            files=_multipart_file(
                "roofing-price-book.xlsx",
                workbook,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["source_type"] == "xlsx"
    assert data["sheet_names"] == ["Roofing Sheet"]
    assert data["selected_sheet"] == "Roofing Sheet"
    assert data["headers"] == ["Item", "Unit", "Price", "Vendor"]
    assert data["suggested_mapping"]["default_price"] == "Price"
    assert data["preview_rows"][1]["normalized"]["item_name"] == "Ice shield"


@pytest.mark.asyncio
async def test_pricing_import_commit_writes_imported_and_skipped_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app = _build_test_app()
    captured: dict[str, object] = {}

    async def _fake_current_gc() -> str:
        return "clerk-user-123"

    async def _fake_get_gc_profile_by_clerk_user_id(_: str) -> dict[str, str]:
        return {"id": "gc-demo"}

    async def _fake_write_pricing_import_log(**kwargs):
        captured.update(kwargs)
        return {
            "import_log_id": "pricing-import-1",
            "imported_count": 1,
            "skipped_count": 1,
            "error_count": 0,
        }

    app.dependency_overrides[get_current_gc] = _fake_current_gc
    monkeypatch.setattr(
        pricing_module.queries,
        "get_gc_profile_by_clerk_user_id",
        _fake_get_gc_profile_by_clerk_user_id,
    )
    monkeypatch.setattr(pricing_module.queries, "write_pricing_import_log", _fake_write_pricing_import_log)

    csv_bytes = (
        "Description,UOM,Sell Price,Vendor\n"
        "Ridge vent,ft,12,ABC Supply\n"
        ",roll,0,Unknown\n"
    ).encode("utf-8")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/v1/pricing/import/commit",
            files=_multipart_file("roofing-price-book.csv", csv_bytes, "text/csv"),
        )

    app.dependency_overrides.clear()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["import_log_id"] == "pricing-import-1"
    assert data["imported_count"] == 1
    assert data["skipped_count"] == 1
    assert data["imported_rows"][0]["item_name"] == "Ridge vent"
    assert data["skipped_rows"][0]["reason"] == "Missing item name or SKU"
    assert captured["gc_id"] == "gc-demo"
    imported_rows = captured["imported_rows"]
    skipped_rows = captured["skipped_rows"]
    assert isinstance(imported_rows, list) and imported_rows[0]["item_key"] == "ridge_vent"
    assert isinstance(skipped_rows, list) and skipped_rows[0]["reason"] == "Missing item name or SKU"

