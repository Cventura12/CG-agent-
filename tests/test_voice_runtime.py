from __future__ import annotations

from gc_agent.voice_runtime import (
    append_voice_turn,
    clear_voice_sessions,
    plan_voice_session,
    upsert_voice_session,
)


def setup_function() -> None:
    clear_voice_sessions()


def teardown_function() -> None:
    clear_voice_sessions()


def test_voice_planner_asks_for_scope_after_only_job_reference() -> None:
    session = upsert_voice_session("call-1", gc_id="gc-demo", from_number="+14235550111")
    session = append_voice_turn(session.id, speaker="caller", text="This is Taylor at Johnson site.")

    plan = plan_voice_session(session)

    assert plan.ready_for_review is False
    assert plan.status == "awaiting_caller"
    assert plan.extracted_fields["job_reference"] == "Johnson site"
    assert [slot.name for slot in plan.missing_slots] == ["scope_summary"]
    assert plan.next_prompt == "Tell me what changed on site or what you need priced."


def test_voice_planner_marks_issue_ready_when_job_and_scope_are_present() -> None:
    session = upsert_voice_session("call-2", gc_id="gc-demo", from_number="+14235550111")
    append_voice_turn(session.id, speaker="caller", text="This is Taylor at Johnson site.")
    session = append_voice_turn(
        session.id,
        speaker="caller",
        text="We need to swap the flashing and add $320 today before the crew closes the roof.",
    )

    plan = plan_voice_session(session)

    assert plan.goal == "issue_report"
    assert plan.ready_for_review is True
    assert plan.status == "ready_for_review"
    assert plan.extracted_fields["job_reference"] == "Johnson site"
    assert plan.extracted_fields["value_signal"] == "$320"
    assert plan.extracted_fields["urgency"] == "high"
    assert "Field issue at Johnson site" in plan.summary
