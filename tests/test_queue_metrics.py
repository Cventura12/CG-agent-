from __future__ import annotations

from gc_agent.db import queries


def test_approval_tracking_marks_clean_approval() -> None:
    payload = queries._approval_tracking_fields({"was_edited": False}, "approved")

    assert payload["approval_status"] == "approved_without_edit"
    assert "approval_recorded_at" in payload


def test_approval_tracking_marks_edited_approval() -> None:
    payload = queries._approval_tracking_fields({"was_edited": True}, "approved")

    assert payload["approval_status"] == "approved_with_edit"
    assert "approval_recorded_at" in payload


def test_approval_tracking_marks_discarded() -> None:
    payload = queries._approval_tracking_fields({}, "discarded")

    assert payload["approval_status"] == "discarded"
    assert "approval_recorded_at" in payload


def test_approval_tracking_ignores_non_final_statuses() -> None:
    assert queries._approval_tracking_fields({"was_edited": True}, "queued") == {}
