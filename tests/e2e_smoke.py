"""Day 7 end-to-end smoke test: graph run + queue API flow."""

from __future__ import annotations

from typing import Any

import httpx
import pytest

from gc_agent import graph

CONTRACTOR_MESSAGE = (
    "Garcia just called - electrical rough-in pushed to Tuesday, not Friday. "
    "Also the owner on Maple Ave finally signed CO #4."
)
GC_ID = "gc-demo"
FROM_NUMBER = "+15005550006"
BASE_URL = "http://localhost:8000"


def _print_assert(label: str, passed: bool, actual: Any) -> None:
    """Print assertion status with concrete actual value."""
    status = "PASS" if passed else "FAIL"
    print(f"[{status}] {label} | actual={actual!r}")


@pytest.mark.asyncio
async def test_e2e_smoke() -> None:
    """Verify WhatsApp-style update reaches queue and supports approval action."""
    failures: list[str] = []

    graph_run_pass = False
    queue_api_pass = False
    approve_api_pass = False
    placeholder_pass = False

    drafts_generated = 0
    avg_content_length = 0

    state = None

    try:
        state = await graph.run_update(
            raw_input=CONTRACTOR_MESSAGE,
            gc_id=GC_ID,
            from_number=FROM_NUMBER,
            input_type="whatsapp",
        )
        graph_run_pass = True
        _print_assert("graph.run_update executed", True, "state returned")
    except Exception as exc:  # pragma: no cover - integration failure path
        graph_run_pass = False
        failures.append(f"graph.run_update exception: {exc}")
        _print_assert("graph.run_update executed", False, str(exc))

    if state is not None:
        cond = state.parsed_intent is not None
        _print_assert("state.parsed_intent is not None", cond, state.parsed_intent)
        if not cond:
            failures.append(f"state.parsed_intent is None; state={state}")

        understanding = state.parsed_intent.understanding if state.parsed_intent else ""
        cond = isinstance(understanding, str) and bool(understanding.strip())
        _print_assert("parsed_intent.understanding is non-empty", cond, understanding)
        if not cond:
            failures.append(f"understanding invalid: {understanding!r}")

        drafts_generated = len(state.drafts_created)
        cond = drafts_generated >= 1
        _print_assert("len(state.drafts_created) >= 1", cond, drafts_generated)
        if not cond:
            failures.append(f"expected >=1 drafts, got {drafts_generated}")

        contents = [draft.content for draft in state.drafts_created]
        placeholder_pass = all("[PLACEHOLDER]" not in content for content in contents)
        _print_assert("all drafts have no [PLACEHOLDER]", placeholder_pass, contents)
        if not placeholder_pass:
            failures.append("placeholder token found in one or more draft contents")

        cond = len(state.errors) == 0
        _print_assert("state.errors is empty", cond, state.errors)
        if not cond:
            failures.append(f"state.errors not empty: {state.errors}")

    queued_drafts: list[dict[str, Any]] = []
    queued_draft_id = ""

    try:
        async with httpx.AsyncClient(base_url=BASE_URL, timeout=20.0) as client:
            queue_response = await client.get(f"/api/v1/queue/{GC_ID}")
            cond = queue_response.status_code == 200
            _print_assert("GET /api/v1/queue/gc-demo status is 200", cond, queue_response.status_code)
            if not cond:
                failures.append(
                    f"queue API status expected 200, got {queue_response.status_code}, body={queue_response.text!r}"
                )

            queue_payload: dict[str, Any] = {}
            if cond:
                try:
                    queue_payload = queue_response.json()
                except Exception as exc:
                    failures.append(f"queue API returned non-JSON payload: {exc}")
                    _print_assert("queue API returned JSON", False, queue_response.text)
                else:
                    _print_assert("queue API returned JSON", True, "json parsed")

            if queue_payload.get("success") is True and isinstance(queue_payload.get("data"), dict):
                groups = queue_payload["data"].get("jobs", [])
                for group in groups:
                    drafts = group.get("drafts", []) if isinstance(group, dict) else []
                    for draft in drafts:
                        if isinstance(draft, dict) and draft.get("status") == "queued":
                            queued_drafts.append(draft)

                cond = len(queued_drafts) >= 1
                _print_assert("queue has at least one queued draft", cond, len(queued_drafts))
                if not cond:
                    failures.append(f"expected queued drafts >=1, got {len(queued_drafts)}")

                content_lengths = [len(str(draft.get("content", ""))) for draft in queued_drafts]
                avg_content_length = int(sum(content_lengths) / len(content_lengths)) if content_lengths else 0
                cond = any(length > 100 for length in content_lengths)
                _print_assert("queued draft content length > 100 chars", cond, content_lengths)
                if not cond:
                    failures.append(f"no queued draft content >100 chars; lengths={content_lengths}")

                queue_api_pass = cond and len(queued_drafts) >= 1 and queue_response.status_code == 200

                if queued_drafts:
                    queued_draft_id = str(queued_drafts[0].get("id", "")).strip()
                    if queued_draft_id:
                        approve_response = await client.post(
                            f"/api/v1/queue/{queued_draft_id}/approve",
                            json={"gc_id": GC_ID},
                        )
                        cond = approve_response.status_code == 200
                        _print_assert(
                            "POST /api/v1/queue/{draft_id}/approve status is 200",
                            cond,
                            approve_response.status_code,
                        )
                        if not cond:
                            failures.append(
                                "approve API status expected 200, "
                                f"got {approve_response.status_code}, body={approve_response.text!r}"
                            )

                        approved_status = None
                        if cond:
                            approve_payload = approve_response.json()
                            approved_status = (
                                approve_payload.get("data", {}).get("status")
                                if isinstance(approve_payload, dict)
                                else None
                            )
                            cond_status = approved_status == "approved"
                            _print_assert(
                                "approved draft status is 'approved'",
                                cond_status,
                                approved_status,
                            )
                            if not cond_status:
                                failures.append(
                                    f"approved draft status expected 'approved', got {approved_status!r}"
                                )
                            approve_api_pass = cond and cond_status
                    else:
                        failures.append("could not extract draft_id from queue response")
                        _print_assert("queued draft has valid id", False, queued_drafts[0])
            else:
                queue_api_pass = False
                failures.append(
                    f"queue payload invalid: success={queue_payload.get('success')!r}, payload={queue_payload!r}"
                )
                _print_assert("queue payload success envelope", False, queue_payload)

    except Exception as exc:  # pragma: no cover - integration failure path
        failures.append(f"httpx call failed: {exc}")
        _print_assert("HTTP calls to local API", False, str(exc))

    print("SMOKE TEST RESULTS")
    print(f"Graph run: {'PASS' if graph_run_pass else 'FAIL'}")
    print(f"Drafts generated: {drafts_generated}")
    print(f"Placeholder check: {'PASS' if placeholder_pass else 'FAIL'}")
    print(f"Queue API: {'PASS' if queue_api_pass else 'FAIL'}")
    print(f"Approve API: {'PASS' if approve_api_pass else 'FAIL'}")
    print(f"Draft quality (avg content length): {avg_content_length} chars")

    assert not failures, "\n".join(failures)