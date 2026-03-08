"""Pricing import endpoints for contractor spreadsheet workflows."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import JSONResponse

from gc_agent.auth import get_current_gc
from gc_agent.db import queries
from gc_agent.db.queries import DatabaseError
from gc_agent.spreadsheet_import import commit_pricing_import, parse_mapping_json, preview_pricing_import

router = APIRouter(tags=["pricing"])


def _success(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data, "error": None}


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"success": False, "data": None, "error": message})


async def _resolve_gc_id(current_gc: str) -> str:
    profile = await queries.get_gc_profile_by_clerk_user_id(current_gc)
    if profile is None:
        return ""
    return str(profile.get("id", "")).strip()


@router.post("/pricing/import/preview", response_model=None)
async def preview_price_book_import(
    file: UploadFile = File(...),
    sheet_name: str = Form(default=""),
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Parse and preview a contractor CSV/XLSX price book before import commit."""
    try:
        gc_id = await _resolve_gc_id(current_gc)
    except DatabaseError as exc:
        return _error(500, str(exc))
    if not gc_id:
        return _error(404, "GC profile not found")

    filename = str(file.filename or "").strip()
    if not filename:
        return _error(400, "A CSV or XLSX file is required")

    payload = await file.read()
    try:
        preview = preview_pricing_import(filename=filename, payload=payload, sheet_name=sheet_name)
    except ValueError as exc:
        return _error(400, str(exc))

    return _success(preview.model_dump(mode="json"))


@router.post("/pricing/import/commit", response_model=None)
async def commit_price_book_import(
    file: UploadFile = File(...),
    sheet_name: str = Form(default=""),
    mapping_json: str = Form(default=""),
    current_gc: str = Depends(get_current_gc),
) -> dict[str, Any] | JSONResponse:
    """Commit a contractor CSV/XLSX price book into normalized pricing storage."""
    try:
        gc_id = await _resolve_gc_id(current_gc)
    except DatabaseError as exc:
        return _error(500, str(exc))
    if not gc_id:
        return _error(404, "GC profile not found")

    filename = str(file.filename or "").strip()
    if not filename:
        return _error(400, "A CSV or XLSX file is required")

    payload = await file.read()
    try:
        mapping = parse_mapping_json(mapping_json) if mapping_json.strip() else {}
        result = await commit_pricing_import(
            gc_id=gc_id,
            filename=filename,
            payload=payload,
            mapping=mapping,
            sheet_name=sheet_name,
            trace_id=uuid4().hex,
        )
    except ValueError as exc:
        return _error(400, str(exc))
    except DatabaseError as exc:
        return _error(500, str(exc))

    return _success(result.model_dump(mode="json"))


__all__ = ["router", "preview_price_book_import", "commit_price_book_import"]
