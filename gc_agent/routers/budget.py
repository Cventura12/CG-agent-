from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import supabase
from dependencies import get_current_contractor


router = APIRouter(prefix="/budget", tags=["budget"])


class ContractValueUpdate(BaseModel):
    contract_value: float = Field(ge=0)


def _calc_overage_percent(revised_total: Any, original_contract: Any) -> float | None:
    try:
        original = float(original_contract or 0)
        revised = float(revised_total or 0)
    except (TypeError, ValueError):
        return None

    if original <= 0:
        return None
    return round(((revised - original) / original) * 100, 1)


def _status_color(row: dict[str, Any]) -> str:
    if row.get("over_budget") or row.get("has_stale_pending"):
        return "red"
    pending_changes = row.get("pending_changes") or 0
    try:
        if float(pending_changes) > 0:
            return "yellow"
    except (TypeError, ValueError):
        pass
    return "green"


def _enrich_row(row: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(row)
    enriched["overage_percent"] = _calc_overage_percent(
        row.get("revised_total"), row.get("original_contract")
    )
    enriched["status_color"] = _status_color(row)
    return enriched


@router.get("/overview")
async def budget_overview(contractor_id: str = Depends(get_current_contractor)) -> dict[str, Any]:
    """Return budget overview for active jobs, including roll-up flags and totals."""
    try:
        response = (
            supabase.table("job_budget_summary")
            .select("*")
            .eq("contractor_id", contractor_id)
            .neq("job_status", "closed")
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load budget overview") from exc

    rows = response.data or []
    jobs = [_enrich_row(row) for row in rows]

    flagged_jobs = sum(1 for row in jobs if row.get("status_color") == "red")
    stale_pending_jobs = sum(1 for row in jobs if row.get("has_stale_pending"))

    total_pending_value = 0.0
    for row in jobs:
        try:
            total_pending_value += float(row.get("pending_changes") or 0)
        except (TypeError, ValueError):
            continue

    summary = {
        "total_jobs": len(jobs),
        "flagged_jobs": flagged_jobs,
        "stale_pending_jobs": stale_pending_jobs,
        "total_pending_value": round(total_pending_value, 2),
    }

    return {"jobs": jobs, "summary": summary}


@router.get("/jobs/{job_id}")
async def budget_job_detail(
    job_id: str, contractor_id: str = Depends(get_current_contractor)
) -> dict[str, Any]:
    """Return budget summary for a single job owned by the contractor."""
    try:
        response = (
            supabase.table("job_budget_summary")
            .select("*")
            .eq("job_id", job_id)
            .eq("contractor_id", contractor_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load job budget") from exc

    row = response.data[0] if response.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    return _enrich_row(row)


@router.patch("/jobs/{job_id}/contract-value")
async def update_contract_value(
    job_id: str,
    payload: ContractValueUpdate,
    contractor_id: str = Depends(get_current_contractor),
) -> dict[str, Any]:
    """Update a job contract value and return the refreshed budget summary row."""
    try:
        update_response = (
            supabase.table("jobs")
            .update({"contract_value": payload.contract_value})
            .eq("id", job_id)
            .eq("contractor_id", contractor_id)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to update contract value") from exc

    if not update_response.data:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        summary_response = (
            supabase.table("job_budget_summary")
            .select("*")
            .eq("job_id", job_id)
            .eq("contractor_id", contractor_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to load job budget") from exc

    row = summary_response.data[0] if summary_response.data else None
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")

    return _enrich_row(row)


# Register this router in main.py with: app.include_router(budget_router)
