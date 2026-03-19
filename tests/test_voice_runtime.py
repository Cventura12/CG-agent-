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


def test_voice_planner_asks_roofing_measurement_before_generic_timeline() -> None:
    session = upsert_voice_session("call-3", gc_id="gc-demo", from_number="+14235550111")
    session = append_voice_turn(
        session.id,
        speaker="caller",
        text="This is Taylor at Johnson site and I need a quote to swap the flashing on the rear slope.",
    )

    plan = plan_voice_session(session)

    assert plan.goal == "quote_request"
    assert plan.ready_for_review is False
    assert plan.missing_slots[0].name == "quantity_or_measurement"
    assert plan.next_prompt == "How many squares, feet, or pieces changed on the roof?"


def test_voice_planner_asks_blocking_question_for_urgent_issue() -> None:
    session = upsert_voice_session("call-4", gc_id="gc-demo", from_number="+14235550111")
    session = append_voice_turn(
        session.id,
        speaker="caller",
        text="At Johnson site we found a leak and need to replace the flashing immediately.",
    )

    plan = plan_voice_session(session)

    assert plan.goal == "issue_report"
    assert plan.ready_for_review is False
    assert plan.missing_slots[0].name == "schedule_constraint"
    assert plan.next_prompt == "Is the crew blocked right now, or is there a deadline like inspection or before they leave today?"


def test_voice_planner_asks_owner_vs_carrier_approval_when_insurance_is_involved() -> None:
    session = upsert_voice_session("call-5", gc_id="gc-demo", from_number="+14235550111")
    session = append_voice_turn(
        session.id,
        speaker="caller",
        text=(
            "This is Taylor on Hartley reroof. I need a quote for an upgraded shingle and this is part "
            "of an insurance supplement."
        ),
    )

    plan = plan_voice_session(session)

    assert plan.goal == "quote_request"
    assert plan.ready_for_review is False
    assert [slot.name for slot in plan.missing_slots[:2]] == ["quantity_or_measurement", "customer_decision"]
    assert any(slot.prompt == "Are we waiting on owner approval, carrier approval, or is this already approved?" for slot in plan.missing_slots)
