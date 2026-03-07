from __future__ import annotations

import pytest

from gc_agent.nodes import parse_call_transcript as transcript_node
from gc_agent.state import AgentState, Job


@pytest.mark.asyncio
async def test_parse_call_transcript_returns_validated_analysis(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_call_claude(system: str, user: str, max_tokens: int = 1200) -> str:
        assert "call transcript triage node" in system.lower()
        assert "Need to move the walkthrough to Monday" in user
        assert max_tokens == 1200
        return """
        {
          "classification": "reschedule",
          "confidence": 87,
          "summary": "Caller wants to move the walkthrough to Monday morning.",
          "urgency": "normal",
          "risks": ["Schedule slip if the walkthrough is not rebooked today."],
          "missing_information": ["Exact Monday time"],
          "next_actions": ["Confirm the new walkthrough time with the customer."],
          "job_type": "remodel",
          "scope_items": [],
          "customer_questions": ["Can we do Monday morning instead?"],
          "insurance_involved": false,
          "scheduling_notes": ["Customer requested Monday morning."]
        }
        """.strip()

    monkeypatch.setattr(transcript_node, "_call_claude", _fake_call_claude)

    state = AgentState(
        mode="transcript",
        raw_input="Need to move the walkthrough to Monday morning.",
        from_number="+14235550123",
        active_job_id="job-1",
        jobs=[
            Job(
                id="job-1",
                name="Oak Street",
                type="Remodel",
                status="active",
                address="123 Oak St",
                contract_value=10000,
                contract_type="Lump Sum",
                est_completion="2026-04-01",
            )
        ],
    )

    result = await transcript_node.parse_call_transcript(state)
    analysis = result["transcript_analysis"]

    assert analysis.classification == "reschedule"
    assert analysis.confidence == 87.0
    assert analysis.summary == "Caller wants to move the walkthrough to Monday morning."
    assert analysis.urgency == "normal"
    assert analysis.next_actions == ["Confirm the new walkthrough time with the customer."]


@pytest.mark.asyncio
async def test_parse_call_transcript_rejects_missing_summary(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_call_claude(system: str, user: str, max_tokens: int = 1200) -> str:
        _ = (system, user, max_tokens)
        return """
        {
          "classification": "unknown",
          "confidence": 10,
          "summary": "",
          "urgency": "normal",
          "risks": [],
          "missing_information": [],
          "next_actions": [],
          "job_type": null,
          "scope_items": [],
          "customer_questions": [],
          "insurance_involved": null,
          "scheduling_notes": []
        }
        """.strip()

    monkeypatch.setattr(transcript_node, "_call_claude", _fake_call_claude)

    with pytest.raises(ValueError, match="summary is required"):
        await transcript_node.parse_call_transcript(
            AgentState(mode="transcript", raw_input="Bare transcript text")
        )
