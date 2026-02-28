"""One-off script to onboard a GC account and seed jobs."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

from gc_agent.db import queries
from gc_agent.db.client import get_client
from gc_agent.state import Job

# Edit this list for each new GC if you do not pass --jobs-file.
# Each dict represents one job to seed during onboarding.
DEFAULT_BETA_JOBS: list[dict[str, Any]] = [
    {
        # Optional stable ID. If omitted, a deterministic ID is generated.
        "id": "beta-tenant-improvement-phase-1",
        # Human-readable project name shown in queue and job detail pages.
        "name": "Tenant Improvement - Phase 1",
        # Job category/type used in summaries.
        "type": "Commercial TI",
        # Full jobsite address.
        "address": "1201 Commerce St, Dallas, TX",
        # Contract value in whole USD (no commas).
        "contract_value": 1450000,
        # Contract structure.
        "contract_type": "Lump Sum",
        # Estimated completion in YYYY-MM-DD format.
        "est_completion": "2026-11-15",
        # Optional lifecycle state.
        "status": "active",
        # Optional internal notes visible in job detail.
        "notes": "Phase 1 interior framing and MEP rough-in.",
    },
    {
        "id": "beta-retail-shell-conversion",
        "name": "Retail Shell Conversion",
        "type": "Retail Buildout",
        "address": "8800 Preston Rd, Frisco, TX",
        "contract_value": 980000,
        "contract_type": "Cost Plus",
        "est_completion": "2026-09-30",
        "status": "active",
        "notes": "City inspection cadence every Friday.",
    },
    {
        "id": "beta-medical-office-renovation",
        "name": "Medical Office Renovation",
        "type": "Healthcare Renovation",
        "address": "300 W Arbrook Blvd, Arlington, TX",
        "contract_value": 2100000,
        "contract_type": "Lump Sum",
        "est_completion": "2027-01-20",
        "status": "active",
        "notes": "Long-lead HVAC package tracked in weekly updates.",
    },
    {
        "id": "beta-warehouse-fitout-north",
        "name": "Warehouse Fitout - North",
        "type": "Industrial Fit-Out",
        "address": "4550 Logistics Dr, Fort Worth, TX",
        "contract_value": 1725000,
        "contract_type": "T&M",
        "est_completion": "2026-12-10",
        "status": "active",
        "notes": "Electrical switchgear lead time is current critical path.",
    },
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Create/update a GC user and seed jobs. "
            "Runnable as: python -m gc_agent.db.onboard"
        )
    )
    parser.add_argument("gc_id", help="Internal GC UUID (gc_users.id).")
    parser.add_argument("--phone-number", required=True, help="GC WhatsApp phone number in E.164 format.")
    parser.add_argument("--name", required=True, help="GC display name.")
    parser.add_argument(
        "--jobs-file",
        help=(
            "Optional path to a JSON file containing a list of job dictionaries. "
            "If omitted, DEFAULT_BETA_JOBS in this script is used."
        ),
    )
    return parser.parse_args()


def _normalize_gc_uuid(gc_id: str) -> str:
    try:
        return str(UUID(gc_id))
    except ValueError as exc:
        raise ValueError(f"Invalid gc_id '{gc_id}': expected UUID") from exc


def _normalize_phone_number(phone_number: str) -> str:
    cleaned = phone_number.strip().replace(" ", "")
    if not cleaned:
        raise ValueError("phone_number is required")
    if not cleaned.startswith("+"):
        raise ValueError("phone_number must be E.164 format (example: +15551234567)")
    return cleaned


def _load_jobs(jobs_file: str | None) -> list[dict[str, Any]]:
    if not jobs_file:
        return DEFAULT_BETA_JOBS

    path = Path(jobs_file)
    raw_text = path.read_text(encoding="utf-8")
    payload = json.loads(raw_text)
    if not isinstance(payload, list):
        raise ValueError("jobs file must contain a JSON array of job objects")

    jobs: list[dict[str, Any]] = []
    for idx, entry in enumerate(payload):
        if not isinstance(entry, dict):
            raise ValueError(f"jobs[{idx}] must be an object")
        jobs.append(entry)
    return jobs


def _job_id_for_payload(gc_id: str, payload: dict[str, Any]) -> str:
    explicit_id = str(payload.get("id", "")).strip()
    if explicit_id:
        return explicit_id

    # Deterministic fallback ensures idempotent upserts across repeated runs.
    name = str(payload.get("name", "")).strip().lower()
    address = str(payload.get("address", "")).strip().lower()
    seed = f"{gc_id}:{name}:{address}"
    return f"job-{uuid5(NAMESPACE_URL, seed).hex[:16]}"


def _job_from_payload(gc_id: str, payload: dict[str, Any]) -> Job:
    name = str(payload.get("name", "")).strip()
    job_type = str(payload.get("type", "")).strip()
    address = str(payload.get("address", "")).strip()
    contract_type = str(payload.get("contract_type", "")).strip()
    est_completion = str(payload.get("est_completion", "")).strip()

    if not name:
        raise ValueError("job payload missing required field: name")
    if not job_type:
        raise ValueError(f"job '{name}' missing required field: type")
    if not address:
        raise ValueError(f"job '{name}' missing required field: address")
    if not contract_type:
        raise ValueError(f"job '{name}' missing required field: contract_type")
    if not est_completion:
        raise ValueError(f"job '{name}' missing required field: est_completion")

    try:
        contract_value = int(payload.get("contract_value"))
    except Exception as exc:
        raise ValueError(f"job '{name}' has invalid contract_value") from exc

    return Job.model_validate(
        {
            "id": _job_id_for_payload(gc_id, payload),
            "name": name,
            "type": job_type,
            "status": str(payload.get("status", "active")).strip() or "active",
            "address": address,
            "contract_value": contract_value,
            "contract_type": contract_type,
            "est_completion": est_completion,
            "notes": str(payload.get("notes", "")).strip(),
            "open_items": [],
        }
    )


async def _upsert_gc_user(gc_id: str, phone_number: str, name: str) -> None:
    client = get_client()

    def _query_by_id() -> list[dict[str, Any]]:
        response = (
            client.table("gc_users")
            .select("id,phone_number,name")
            .eq("id", gc_id)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows_by_id = await asyncio.to_thread(_query_by_id)
    if rows_by_id:
        def _update_existing() -> None:
            (
                client.table("gc_users")
                .update({"phone_number": phone_number, "name": name})
                .eq("id", gc_id)
                .execute()
            )

        await asyncio.to_thread(_update_existing)
        return

    def _query_by_phone() -> list[dict[str, Any]]:
        response = (
            client.table("gc_users")
            .select("id,phone_number,name")
            .eq("phone_number", phone_number)
            .limit(1)
            .execute()
        )
        return list(response.data or [])

    rows_by_phone = await asyncio.to_thread(_query_by_phone)
    if rows_by_phone:
        existing_id = str(rows_by_phone[0].get("id", "")).strip()
        if existing_id and existing_id != gc_id:
            raise RuntimeError(
                f"Phone number {phone_number} is already assigned to gc_id={existing_id}. "
                f"Refusing to overwrite with gc_id={gc_id}."
            )

    def _insert_new() -> None:
        (
            client.table("gc_users")
            .insert(
                {
                    "id": gc_id,
                    "phone_number": phone_number,
                    "name": name,
                }
            )
            .execute()
        )

    await asyncio.to_thread(_insert_new)


async def onboard_gc(gc_id: str, phone_number: str, name: str, jobs: list[dict]) -> None:
    """Create/update GC account and upsert all provided jobs."""
    normalized_gc_id = _normalize_gc_uuid(gc_id)
    normalized_phone = _normalize_phone_number(phone_number)
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("name is required")

    await _upsert_gc_user(normalized_gc_id, normalized_phone, normalized_name)

    seeded_count = 0
    for payload in jobs:
        job = _job_from_payload(normalized_gc_id, payload)
        await queries.upsert_job(job, normalized_gc_id)
        seeded_count += 1

    print(f"Onboarded {normalized_name} with {seeded_count} jobs")


async def _run_cli() -> int:
    args = _parse_args()
    jobs = _load_jobs(args.jobs_file)

    normalized_name = args.name.strip()
    confirmation = input(
        f"About to create {len(jobs)} jobs for {normalized_name}. Continue? [y/N] "
    ).strip().lower()
    if confirmation not in {"y", "yes"}:
        print("Aborted.")
        return 1

    await onboard_gc(
        gc_id=args.gc_id,
        phone_number=args.phone_number,
        name=normalized_name,
        jobs=jobs,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_run_cli()))
