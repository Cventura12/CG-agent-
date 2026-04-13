"""Google Calendar sync: create and update calendar events for Arbor Agent jobs."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

LOGGER = logging.getLogger(__name__)

_CALENDAR_ID = "primary"


async def _get_calendar_service(gc_id: str) -> Optional[Any]:
    """Build an authenticated Google Calendar API service for gc_id."""
    try:
        from googleapiclient.discovery import build
    except ImportError:
        LOGGER.error("google-api-python-client is not installed")
        return None

    from gc_agent.integrations.google_auth import get_valid_credentials

    creds = await get_valid_credentials(gc_id)
    if creds is None:
        return None

    def _build() -> Any:
        return build("calendar", "v3", credentials=creds, cache_discovery=False)

    try:
        return await asyncio.to_thread(_build)
    except Exception:
        LOGGER.exception("Failed to build Calendar service for gc_id=%s", gc_id)
        return None


def _job_event_body(job: dict[str, Any]) -> dict[str, Any]:
    """Build a Google Calendar event body from a job dict."""
    job_id = str(job.get("id", "")).strip()
    name = str(job.get("name", "Job")).strip()
    address = str(job.get("address", "")).strip()
    notes = str(job.get("notes", "")).strip()
    est_completion = str(job.get("est_completion", "")).strip()
    contract_value = job.get("contract_value")

    description_parts = []
    if address:
        description_parts.append(f"Address: {address}")
    if contract_value:
        description_parts.append(f"Contract value: ${contract_value:,.0f}" if isinstance(contract_value, (int, float)) else f"Contract value: {contract_value}")
    if notes:
        description_parts.append(f"Notes: {notes}")
    description_parts.append(f"Job ID: {job_id}")
    description = "\n".join(description_parts)

    event: dict[str, Any] = {
        "summary": name,
        "description": description,
        "extendedProperties": {
            "private": {
                "arbor_job_id": job_id,
            }
        },
    }

    if est_completion:
        # All-day event on the target completion date
        event["start"] = {"date": est_completion[:10]}
        event["end"] = {"date": est_completion[:10]}
    else:
        # No date yet — skip calendar sync until est_completion is set
        return {}

    return event


async def _find_existing_event(service: Any, job_id: str) -> Optional[str]:
    """Return the Google Calendar event ID previously synced for this job."""
    def _search() -> Optional[str]:
        result = (
            service.events()
            .list(
                calendarId=_CALENDAR_ID,
                privateExtendedProperty=f"arbor_job_id={job_id}",
                maxResults=1,
                singleEvents=True,
            )
            .execute()
        )
        items = result.get("items", [])
        return items[0]["id"] if items else None

    try:
        return await asyncio.to_thread(_search)
    except Exception:
        LOGGER.exception("Failed searching Calendar for job_id=%s", job_id)
        return None


async def sync_job_to_calendar(gc_id: str, job: dict[str, Any]) -> Optional[str]:
    """Create or update a Google Calendar event for the given job.

    Returns the Google Calendar event ID, or None if sync was skipped/failed.
    """
    job_id = str(job.get("id", "")).strip()
    if not job_id:
        return None

    service = await _get_calendar_service(gc_id)
    if service is None:
        return None

    event_body = _job_event_body(job)
    if not event_body:
        # No est_completion — nothing to sync yet
        return None

    existing_event_id = await _find_existing_event(service, job_id)

    def _create() -> str:
        result = (
            service.events()
            .insert(calendarId=_CALENDAR_ID, body=event_body)
            .execute()
        )
        return str(result.get("id", ""))

    def _update(event_id: str) -> str:
        result = (
            service.events()
            .update(calendarId=_CALENDAR_ID, eventId=event_id, body=event_body)
            .execute()
        )
        return str(result.get("id", ""))

    try:
        if existing_event_id:
            event_id = await asyncio.to_thread(_update, existing_event_id)
            LOGGER.info("Calendar event updated job_id=%s event_id=%s gc_id=%s", job_id, event_id, gc_id)
        else:
            event_id = await asyncio.to_thread(_create)
            LOGGER.info("Calendar event created job_id=%s event_id=%s gc_id=%s", job_id, event_id, gc_id)
        return event_id
    except Exception:
        LOGGER.exception("Calendar sync failed job_id=%s gc_id=%s", job_id, gc_id)
        return None


async def delete_job_calendar_event(gc_id: str, job_id: str) -> bool:
    """Remove the Google Calendar event for a job, if one exists."""
    service = await _get_calendar_service(gc_id)
    if service is None:
        return False

    event_id = await _find_existing_event(service, job_id)
    if not event_id:
        return False

    def _delete() -> None:
        service.events().delete(calendarId=_CALENDAR_ID, eventId=event_id).execute()

    try:
        await asyncio.to_thread(_delete)
        LOGGER.info("Calendar event deleted job_id=%s gc_id=%s", job_id, gc_id)
        return True
    except Exception:
        LOGGER.exception("Failed deleting Calendar event job_id=%s gc_id=%s", job_id, gc_id)
        return False


__all__ = ["sync_job_to_calendar", "delete_job_calendar_event"]
