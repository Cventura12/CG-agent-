"""Export all jobs for a GC account into a JSON backup file."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

from gc_agent.db.client import get_client


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Dump all jobs for a gc_id to JSON. "
            "Runnable as: python -m gc_agent.db.export_jobs"
        )
    )
    parser.add_argument("gc_id", help="Internal GC UUID (gc_users.id).")
    parser.add_argument(
        "--output",
        help="Output JSON file path. Defaults to ./exports/jobs_<gc_id>.json",
    )
    return parser.parse_args()


def _normalize_gc_uuid(gc_id: str) -> str:
    try:
        return str(UUID(gc_id))
    except ValueError as exc:
        raise ValueError(f"Invalid gc_id '{gc_id}': expected UUID") from exc


async def _fetch_jobs(gc_id: str) -> list[dict[str, Any]]:
    client = get_client()

    def _query() -> list[dict[str, Any]]:
        response = (
            client.table("jobs")
            .select(
                "id,gc_id,name,type,status,address,contract_value,contract_type,"
                "est_completion,notes,last_updated,created_at,"
                "open_items(id,job_id,gc_id,type,description,owner,status,days_silent,due_date,created_at,resolved_at)"
            )
            .eq("gc_id", gc_id)
            .order("name")
            .execute()
        )
        return list(response.data or [])

    return await asyncio.to_thread(_query)


async def export_jobs(gc_id: str, output_path: Path) -> int:
    """Write all jobs for gc_id to output_path and return exported count."""
    normalized_gc_id = _normalize_gc_uuid(gc_id)
    rows = await _fetch_jobs(normalized_gc_id)

    payload = {
        "gc_id": normalized_gc_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "job_count": len(rows),
        "jobs": rows,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return len(rows)


async def _run_cli() -> int:
    args = _parse_args()
    normalized_gc_id = _normalize_gc_uuid(args.gc_id)
    output_path = Path(args.output) if args.output else Path("exports") / f"jobs_{normalized_gc_id}.json"

    exported_count = await export_jobs(normalized_gc_id, output_path)
    print(f"Exported {exported_count} jobs to {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run_cli()))
