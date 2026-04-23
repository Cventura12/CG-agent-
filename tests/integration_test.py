"""Day 14 full integration test: real Supabase + scripted 2-day GC simulation."""

from __future__ import annotations

import asyncio
import importlib
import json
import os
import time
from typing import Any
from uuid import uuid4

import pytest

from gc_agent import graph
from gc_agent.db import queries
from gc_agent.db.client import get_client
from gc_agent.db.onboard import onboard_gc
from gc_agent.state import Draft

flag_risks_node = importlib.import_module("gc_agent.nodes.flag_risks")
generate_briefing_node = importlib.import_module("gc_agent.nodes.generate_briefing")
ingest_node = importlib.import_module("gc_agent.nodes.ingest")
parse_update_node = importlib.import_module("gc_agent.nodes.parse_update")


class ScriptedModel:
    """Deterministic model behavior for integration flow consistency."""

    def __init__(self, jobs: list[dict[str, Any]]) -> None:
        self.jobs_by_id = {job["id"]: job for job in jobs}
        self.job_names = [str(job["name"]) for job in jobs]
        self.open_item_description = "Electrical rough-in schedule confirmation pending from utility."
        self.day1_note_marker = "DAY1_PERSIST_NOTE"
        self._risk_by_marker = {
            "U1": [f"{jobs[0]['name']}: utility delay may impact rough-in sequence this week."],
            "U2": [f"{jobs[1]['name']}: permit revision risk could push inspections by 48 hours."],
            "U3": [f"{jobs[2]['name']}: long-lead equipment delivery needs immediate follow-up."],
            "U4": [f"{jobs[3]['name']}: manpower availability risk on weekend shift."],
            "U5": [f"{jobs[0]['name']}: owner decision lag can block finish sequencing."],
            "D2": [f"{jobs[0]['name']}: confirm closeout docs after resolved electrical item."],
        }

    @staticmethod
    def _long_content(seed: str) -> str:
        body = (
            f"{seed} Please confirm scope, schedule impact, and exact owner decision timing today. "
            "Share constraints, next responsible party, and target completion so the field team can execute "
            "without waiting on missing information."
        )
        return body.strip()

    def _marker_from_text(self, value: str) -> str:
        for marker in ("U1", "U2", "U3", "U4", "U5", "D2"):
            if marker in value:
                return marker
        raise ValueError(f"Unknown scripted marker in input: {value!r}")

    def _intent_for_marker(self, marker: str) -> dict[str, Any]:
        if marker == "U1":
            job = self.jobs_by_id[next(iter(self.jobs_by_id.keys()))]
            return {
                "understanding": "Captured broad day one field update and utility dependency.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": f"{self.day1_note_marker}_U1 electrical rough-in moved two days.",
                    }
                ],
                "new_open_items": [
                    {
                        "job_id": job["id"],
                        "type": "follow-up",
                        "description": self.open_item_description,
                        "owner": "GC",
                    }
                ],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "follow-up",
                        "title": "Utility Rough-In Follow-Up",
                        "content": self._long_content(
                            "Electrical rough-in date shifted and utility confirmation is required."
                        ),
                        "why": "Keeps critical path dependencies visible.",
                    }
                ],
                "risks_flagged": [],
            }

        if marker == "U2":
            job = list(self.jobs_by_id.values())[1]
            return {
                "understanding": "Captured single-job permit coordination update.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": f"{self.day1_note_marker}_U2 permit packet revision submitted.",
                    }
                ],
                "new_open_items": [],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "RFI",
                        "title": "Permit Revision RFI",
                        "content": self._long_content(
                            "Permit revision package is in review and needs proactive inspector coordination."
                        ),
                        "why": "Maintains permit momentum and avoids idle crews.",
                    }
                ],
                "risks_flagged": [],
            }

        if marker == "U3":
            job = list(self.jobs_by_id.values())[2]
            return {
                "understanding": "Captured voice-style equipment delivery concern.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": f"{self.day1_note_marker}_U3 voice note on equipment delay risk.",
                    }
                ],
                "new_open_items": [],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "sub-message",
                        "title": "Equipment Delivery Escalation",
                        "content": self._long_content(
                            "Critical equipment ETA is uncertain and supplier needs escalation for confirmed dates."
                        ),
                        "why": "Protects sequencing for dependent trades.",
                    }
                ],
                "risks_flagged": [],
            }

        if marker == "U4":
            job = list(self.jobs_by_id.values())[3]
            return {
                "understanding": "Captured manpower risk on industrial fit-out shift.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": f"{self.day1_note_marker}_U4 weekend shift crew may be short.",
                    }
                ],
                "new_open_items": [],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "owner-update",
                        "title": "Weekend Staffing Plan",
                        "content": self._long_content(
                            "Weekend staffing constraints need owner visibility and contingency approvals now."
                        ),
                        "why": "Keeps owner aligned with labor mitigation plan.",
                    }
                ],
                "risks_flagged": [],
            }

        if marker == "U5":
            job = list(self.jobs_by_id.values())[0]
            return {
                "understanding": "Captured owner-decision follow-up that can block finishes.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": f"{self.day1_note_marker}_U5 owner finish selection still pending.",
                    }
                ],
                "new_open_items": [],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "follow-up",
                        "title": "Finish Selection Decision Request",
                        "content": self._long_content(
                            "Owner finish selections remain unresolved and must be finalized to protect schedule."
                        ),
                        "why": "Avoids downstream resequencing and rework.",
                    }
                ],
                "risks_flagged": [],
            }

        if marker == "D2":
            job = list(self.jobs_by_id.values())[0]
            return {
                "understanding": "Captured day-two resolution and closeout step.",
                "job_updates": [
                    {
                        "job_id": job["id"],
                        "summary": "D2 resolved utility confirmation item and released rough-in work.",
                        "resolved_open_items": [self.open_item_description],
                    }
                ],
                "new_open_items": [],
                "drafts": [
                    {
                        "job_id": job["id"],
                        "job_name": job["name"],
                        "type": "follow-up",
                        "title": "Resolution Confirmation Note",
                        "content": self._long_content(
                            "Utility dependency was cleared and downstream coordination has been updated."
                        ),
                        "why": "Closes the loop and documents next execution steps.",
                    }
                ],
                "risks_flagged": [],
            }

        raise ValueError(f"Unsupported marker: {marker}")

    async def call_parse_update(self, system: str, user: str, max_tokens: int = 2000) -> str:
        _ = (system, max_tokens)
        marker = self._marker_from_text(user)
        return json.dumps(self._intent_for_marker(marker))

    async def call_flag_risks(self, system: str, user: str, max_tokens: int = 600) -> str:
        _ = (system, max_tokens)
        marker = self._marker_from_text(user)
        return json.dumps(self._risk_by_marker.get(marker, []))

    async def call_generate_briefing(self, system: str, user: str, max_tokens: int = 1000) -> str:
        _ = (system, max_tokens)

        queue_lines: list[str] = []
        for line in user.splitlines():
            stripped = line.strip()
            if stripped.startswith("- ") and "|" in stripped and "status=" in stripped:
                queue_lines.append(stripped)

        if queue_lines:
            ready_for_approval_block = "\n".join(f"- {line}" for line in queue_lines)
        else:
            ready_for_approval_block = "- No queued drafts."
        risk_lines = [
            risk for marker in ("U1", "U2", "U3", "U4", "U5") for risk in self._risk_by_marker.get(marker, [])
        ]
        action_line = risk_lines[0] if risk_lines else "No immediate actions."
        watch_line = risk_lines[1] if len(risk_lines) > 1 else "No watch items."

        return (
            "MORNING BRIEFING\n\n"
            "READY FOR APPROVAL\n"
            f"{ready_for_approval_block}\n\n"
            "ACTION\n"
            f"- {action_line}\n\n"
            "WATCH\n"
            f"- {watch_line}\n"
        )


def _build_test_jobs(prefix: str) -> list[dict[str, Any]]:
    return [
        {
            "id": f"{prefix}-job-01",
            "name": "North Clinic Tenant Improvement",
            "type": "Commercial TI",
            "status": "active",
            "address": "101 Main St, Austin, TX",
            "contract_value": 1300000,
            "contract_type": "Lump Sum",
            "est_completion": "2026-11-30",
            "notes": "",
        },
        {
            "id": f"{prefix}-job-02",
            "name": "Retail Pod Conversion",
            "type": "Retail Buildout",
            "status": "active",
            "address": "550 Market Ave, Austin, TX",
            "contract_value": 900000,
            "contract_type": "Cost Plus",
            "est_completion": "2026-10-15",
            "notes": "",
        },
        {
            "id": f"{prefix}-job-03",
            "name": "Medical Office Renovation",
            "type": "Healthcare Renovation",
            "status": "active",
            "address": "200 River Blvd, Austin, TX",
            "contract_value": 1800000,
            "contract_type": "Lump Sum",
            "est_completion": "2027-01-10",
            "notes": "",
        },
        {
            "id": f"{prefix}-job-04",
            "name": "Warehouse Fit-Out East",
            "type": "Industrial Fit-Out",
            "status": "active",
            "address": "900 Industry Way, Austin, TX",
            "contract_value": 1600000,
            "contract_type": "T&M",
            "est_completion": "2026-12-20",
            "notes": "",
        },
    ]


async def _cleanup_gc(gc_id: str) -> None:
    client = get_client()

    def _delete_gc_user() -> None:
        client.table("gc_users").delete().eq("id", gc_id).execute()

    await asyncio.to_thread(_delete_gc_user)


@pytest.mark.asyncio
async def test_full_gc_integration_simulation(monkeypatch: pytest.MonkeyPatch) -> None:
    """Simulate 2-day GC workflow and verify queue, briefing, and persistence coherence."""
    if not os.getenv("SUPABASE_URL", "").strip() or not os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip():
        pytest.skip("Integration test requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")

    started_at = time.perf_counter()
    failures: list[str] = []

    gc_id = str(uuid4())
    phone_number = f"+1555{str(uuid4().int)[-7:]}"
    gc_name = "Integration Test GC"
    job_prefix = gc_id.split("-")[0]
    jobs = _build_test_jobs(job_prefix)
    scripted = ScriptedModel(jobs)
    job_names = [job["name"] for job in jobs]

    monkeypatch.setattr(parse_update_node, "_call_claude", scripted.call_parse_update)
    monkeypatch.setattr(flag_risks_node, "_call_claude", scripted.call_flag_risks)
    monkeypatch.setattr(generate_briefing_node, "_call_claude", scripted.call_generate_briefing)

    async def _fake_transcribe_audio(audio_url: str) -> str:
        return f"U3 Voice transcript from {audio_url}: supplier still has no hard delivery date."

    monkeypatch.setattr(ingest_node, "_transcribe_audio", _fake_transcribe_audio)

    thread_day = {"value": "day1"}

    def _fake_daily_thread_id(current_gc_id: str) -> str:
        return f"{current_gc_id}-{thread_day['value']}"

    monkeypatch.setattr(graph, "_daily_thread_id", _fake_daily_thread_id)

    updates_processed = 0
    expected_updates = 6
    all_generated_drafts: list[Draft] = []
    all_risk_flags: list[str] = []
    queue_approve_discard_pass = False
    briefing_coherence_pass = False
    persistence_check_pass = False

    try:
        await onboard_gc(gc_id=gc_id, phone_number=phone_number, name=gc_name, jobs=jobs)

        day1_updates = [
            ("U1 Brain dump: electrical, owner decisions, and permitting are moving at once.", "whatsapp"),
            ("U2 Single job update: permit revision package submitted for inspection review.", "whatsapp"),
            ("https://example.com/audio/day1-u3.ogg", "voice"),
            ("U4 Field update: weekend manpower may be reduced on fit-out scope.", "whatsapp"),
            ("U5 Follow-up: owner finish selection still not finalized this afternoon.", "whatsapp"),
        ]

        for message, input_type in day1_updates:
            state = await graph.run_update(
                raw_input=message,
                gc_id=gc_id,
                from_number=phone_number,
                input_type=input_type,
            )
            updates_processed += 1

            if len(state.drafts_created) < 1:
                failures.append(f"Expected >=1 draft for update {updates_processed}, got 0")
            all_generated_drafts.extend(state.drafts_created)
            all_risk_flags.extend(state.risk_flags)

        queued_day1 = await queries.get_queued_drafts(gc_id)
        if len(queued_day1) < 5:
            failures.append(f"Expected >=5 queued drafts after day 1, found {len(queued_day1)}")

        actionable = queued_day1[:5]
        if len(actionable) >= 5:
            for draft in actionable[:3]:
                await queries.update_draft_status(draft.id, "approved")
            await queries.update_draft_status(actionable[3].id, "discarded")
            left_queued_id = actionable[4].id

            queued_after_actions = await queries.get_queued_drafts(gc_id)
            actioned = await queries.get_actioned_drafts(gc_id, limit=20)

            approved_count = sum(1 for draft in actioned if draft.status == "approved")
            discarded_count = sum(1 for draft in actioned if draft.status == "discarded")
            left_queued = any(draft.id == left_queued_id for draft in queued_after_actions)
            queue_approve_discard_pass = approved_count >= 3 and discarded_count >= 1 and left_queued
            if not queue_approve_discard_pass:
                failures.append(
                    "Queue action sequence failed (expected 3 approved, 1 discarded, 1 queued remaining)."
                )
        else:
            failures.append("Not enough drafts to run approve/discard/leave-queued sequence.")
            left_queued_id = ""

        briefing_day1 = await graph.run_briefing(gc_id)
        queued_in_briefing = "READY FOR APPROVAL" in briefing_day1 and left_queued_id != ""
        if actionable and left_queued_id:
            left_draft = next((draft for draft in actionable if draft.id == left_queued_id), None)
            if left_draft is not None and left_draft.title in briefing_day1:
                queued_in_briefing = queued_in_briefing and True
            else:
                queued_in_briefing = False

        action_or_watch_contains_risk = False
        briefing_day1_lower = briefing_day1.lower()
        if ("action" in briefing_day1_lower or "watch" in briefing_day1_lower) and all_risk_flags:
            action_or_watch_contains_risk = any(risk.lower() in briefing_day1_lower for risk in all_risk_flags)

        briefing_coherence_pass = queued_in_briefing and action_or_watch_contains_risk
        if not briefing_coherence_pass:
            failures.append("Day 1 briefing did not reference queued draft and flagged risks in ACTION/WATCH.")

        thread_day["value"] = "day2"
        day2_state = await graph.run_update(
            raw_input="D2 Day two update: utility confirmation arrived and rough-in can proceed.",
            gc_id=gc_id,
            from_number=phone_number,
            input_type="whatsapp",
        )
        updates_processed += 1
        if len(day2_state.drafts_created) < 1:
            failures.append("Expected >=1 draft for day 2 resolution update.")
        all_generated_drafts.extend(day2_state.drafts_created)
        all_risk_flags.extend(day2_state.risk_flags)

        fresh_jobs = await queries.get_active_jobs(gc_id)
        primary_job = next((job for job in fresh_jobs if job.id == jobs[0]["id"]), None)
        if primary_job is None:
            failures.append("Primary job missing after day 2 update.")
        else:
            still_open = any(
                item.description.strip() == scripted.open_item_description
                for item in primary_job.open_items
            )
            if still_open:
                failures.append("Resolved day 1 open item still present on day 2.")

            has_day1_note = scripted.day1_note_marker in primary_job.notes
            persistence_check_pass = has_day1_note
            if not has_day1_note:
                failures.append("Day 1 notes marker missing from persisted job notes.")

        briefing_day2 = await graph.run_briefing(gc_id)
        if scripted.open_item_description.lower() in briefing_day2.lower():
            failures.append("Day 2 briefing still references resolved open item.")

        placeholder_violations = [
            draft.id for draft in all_generated_drafts if "[" in draft.content or "]" in draft.content
        ]
        short_content_violations = [draft.id for draft in all_generated_drafts if len(draft.content) < 100]
        long_title_violations = [draft.id for draft in all_generated_drafts if len(draft.title) > 60]

        risk_name_violations = []
        for risk in all_risk_flags:
            if not any(job_name.lower() in risk.lower() for job_name in job_names):
                risk_name_violations.append(risk)

        if placeholder_violations:
            failures.append(f"Draft placeholder bracket violations: {placeholder_violations}")
        if short_content_violations:
            failures.append(f"Draft content length violations (<100): {short_content_violations}")
        if long_title_violations:
            failures.append(f"Draft title length violations (>60): {long_title_violations}")
        if risk_name_violations:
            failures.append(f"Risk flags missing specific job names: {risk_name_violations}")

        elapsed_seconds = time.perf_counter() - started_at
        if elapsed_seconds > 90:
            failures.append(f"Integration test exceeded 90s runtime: {elapsed_seconds:.2f}s")

        placeholder_pass = len(placeholder_violations) == 0
        overall_pass = (
            updates_processed == expected_updates
            and queue_approve_discard_pass
            and briefing_coherence_pass
            and persistence_check_pass
            and placeholder_pass
            and not short_content_violations
            and not long_title_violations
            and not risk_name_violations
            and elapsed_seconds <= 90
            and not failures
        )

        print("INTEGRATION TEST â€” Arbor Agent")
        print(f"Updates processed: {updates_processed}/{expected_updates}")
        print(f"Drafts generated: {len(all_generated_drafts)}")
        print(
            "Placeholder check: "
            f"{'PASS' if placeholder_pass else 'FAIL'} ({len(placeholder_violations)} violations)"
        )
        print(f"Queue approve/discard: {'PASS' if queue_approve_discard_pass else 'FAIL'}")
        print(f"Briefing coherence: {'PASS' if briefing_coherence_pass else 'FAIL'}")
        print(f"Persistence check: {'PASS' if persistence_check_pass else 'FAIL'}")
        print(f"OVERALL: {'PASS' if overall_pass else 'FAIL'}")

        assert not failures, "\n".join(failures)
    finally:
        await _cleanup_gc(gc_id)
print("Cleaned up test GC and related data.")
print("Integration test complete.0")
print()
