"""Draft generation node for ready-to-send action items."""

from __future__ import annotations

import inspect
import logging
import re
from uuid import uuid4

from gc_agent.db import queries
from gc_agent.state import AgentState, Draft, Job

LOGGER = logging.getLogger(__name__)

VALID_DRAFT_TYPES = {
    "CO",
    "RFI",
    "sub-message",
    "follow-up",
    "owner-update",
    "material-order",
}
PLACEHOLDER_PATTERN = re.compile(r"\[[^\[\]\n]+\]")


def _has_placeholders(content: str) -> bool:
    """Return True when content still contains bracketed template placeholders."""
    return bool(PLACEHOLDER_PATTERN.search(content))


def _job_lookup(jobs: list[Job]) -> dict[str, Job]:
    """Create a fast lookup map for resolving job names from job IDs."""
    return {job.id: job for job in jobs}


async def draft_actions(state: AgentState) -> dict[str, object]:
    """Convert parsed draft specs into Draft objects and persist queue entries."""
    if state.parsed_intent is None or not state.parsed_intent.drafts:
        return {"drafts_created": []}

    job_map = _job_lookup(state.jobs)
    created_drafts: list[Draft] = []
    errors = list(state.errors)

    for draft_spec in state.parsed_intent.drafts:
        if not isinstance(draft_spec, dict):
            LOGGER.warning("Skipping non-dict draft spec: %r", draft_spec)
            errors.append("invalid draft spec: expected object")
            continue

        draft_type = str(draft_spec.get("type", "")).strip()
        if draft_type not in VALID_DRAFT_TYPES:
            LOGGER.warning("Skipping draft with invalid type: %s", draft_type)
            errors.append(f"invalid draft type skipped: {draft_type or 'missing'}")
            continue

        job_id = str(draft_spec.get("job_id", "")).strip()
        job_name = str(draft_spec.get("job_name", "")).strip()
        if job_id and not job_name and job_id in job_map:
            job_name = job_map[job_id].name

        if not job_id:
            if job_name:
                matched_job = next((job for job in state.jobs if job.name == job_name), None)
                if matched_job is not None:
                    job_id = matched_job.id
            if not job_id:
                job_id = "unknown-job"

        if not job_name:
            job_name = job_map.get(job_id).name if job_id in job_map else "Unknown Job"

        content = str(draft_spec.get("content", "")).strip()
        draft_status = "queued"
        if _has_placeholders(content):
            LOGGER.warning(
                "Draft has placeholders and requires review: title=%s",
                str(draft_spec.get("title", "")).strip(),
            )
            draft_status = "needs-review"

        draft = Draft(
            id=uuid4().hex,
            job_id=job_id,
            job_name=job_name,
            type=draft_type,
            title=str(draft_spec.get("title", "")).strip() or "Untitled Draft",
            content=content,
            why=str(draft_spec.get("why", "")).strip() or "Generated from latest update.",
            status=draft_status,
        )
        created_drafts.append(draft)
        LOGGER.debug("Draft created title=%s type=%s", draft.title, draft.type)

    if created_drafts:
        gc_id = state.gc_id or "gc-demo"
        try:
            db_result = queries.insert_drafts(created_drafts, gc_id)
            if inspect.isawaitable(db_result):
                await db_result
        except Exception as exc:
            LOGGER.exception("Failed to write %s draft(s) to draft_queue", len(created_drafts))
            errors.append(f"draft queue write failed: {exc}")

    result: dict[str, object] = {"drafts_created": created_drafts}
    if errors != state.errors:
        result["errors"] = errors
    return result


__all__ = ["draft_actions", "_has_placeholders"]