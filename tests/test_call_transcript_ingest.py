from __future__ import annotations

from typing import Any

import pytest

from gc_agent import call_transcripts
from gc_agent.db.queries import DatabaseError
from gc_agent.input_surface import InboundInput
from gc_agent.state import CallTranscriptAnalysis, Draft, Job, ParsedIntent


def _job(job_id: str, name: str = "Oak Street") -> Job:
    return Job(
        id=job_id,
        name=name,
        type="Roofing",
        status="active",
        address="123 Oak St",
        contract_value=10000,
        contract_type="Lump Sum",
        est_completion="2026-04-01",
    )


@pytest.fixture(autouse=True)
def _patch_transcript_runtime_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _no_existing_transcript(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    async def _no_related_drafts(*_args: Any, **_kwargs: Any) -> list[str]:
        return []

    monkeypatch.setattr(
        call_transcripts.queries,
        "find_existing_call_transcript_for_ingest",
        _no_existing_transcript,
    )
    monkeypatch.setattr(
        call_transcripts.queries,
        "get_related_transcript_review_draft_ids",
        _no_related_drafts,
    )
    monkeypatch.setattr(call_transcripts, "write_agent_trace", lambda **_kwargs: None)


@pytest.mark.asyncio
async def test_process_call_transcript_links_explicit_quote_and_creates_review_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    inserted_drafts: list[Draft] = []
    ingress: list[dict[str, Any]] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-1")]

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        assert quote_id == "quote-1"
        return {"id": "quote-1", "gc_id": "gc-demo", "job_id": "job-1"}

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        _ = (gc_id, destination)
        return None

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        inserted.append(dict(kwargs))
        return "ct-1"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        assert gc_id == "gc-demo"
        inserted_drafts.extend(drafts)

    def _fake_log_ingress_trace(state, *, input_surface: str, payload: Any, node_name: str = "ingress") -> None:
        ingress.append(
            {
                "trace_id": state.trace_id,
                "input_surface": input_surface,
                "payload": payload,
                "node_name": node_name,
            }
        )

    async def _fake_parse_transcript(state) -> dict[str, object]:
        assert state.mode == "transcript"
        assert state.active_job_id == "job-1"
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="quote_question",
                confidence=92,
                summary="Caller asked when the revised quote will be ready.",
                urgency="normal",
                risks=[],
                missing_information=[],
                next_actions=["Confirm quote turnaround time."],
                job_type=None,
                scope_items=[],
                customer_questions=["When will the revised quote be ready?"],
                insurance_involved=None,
                scheduling_notes=[],
            )
        }

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", _fake_log_ingress_trace)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Can you tell me when that revised quote will be ready?",
        external_id="trace-1",
        quote_id="quote-1",
        from_number="+14235550101",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-1")

    assert result["mode"] == "transcript"
    assert result["trace_id"] == "trace-1"
    assert result["transcript_id"] == "ct-1"
    assert result["active_job_id"] == "job-1"
    assert result["linked_quote_id"] == "quote-1"
    assert len(result["created_draft_ids"]) == 1
    assert inserted[0]["job_id"] == "job-1"
    assert inserted[0]["quote_id"] == "quote-1"
    assert updated[0]["classification"] == "quote_question"
    assert inserted_drafts[0].type == "transcript-review"
    assert ingress[0]["input_surface"] == "call_transcript"


@pytest.mark.asyncio
async def test_process_call_transcript_matches_recent_quote_delivery_by_phone(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_drafts: list[Draft] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-9", name="Rivera Commercial")]

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        assert gc_id == "gc-demo"
        assert destination == "4235550109"
        return {
            "quote_id": "quote-9",
            "job_id": "job-9",
            "recipient_name": "Rivera Commercial",
            "channel": "sms",
            "trace_id": "trace-q-9",
        }

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        return "ct-9"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        _ = (transcript_id, gc_id, kwargs)

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        _ = gc_id
        inserted_drafts.extend(drafts)

    async def _fake_parse_transcript(state) -> dict[str, object]:
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="followup_response",
                confidence=81,
                summary="Caller asked for the quote again and wants a callback.",
                urgency="normal",
                risks=[],
                missing_information=[],
                next_actions=["Call back the customer."],
                job_type=None,
                scope_items=[],
                customer_questions=[],
                insurance_involved=None,
                scheduling_notes=[],
            )
        }

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        _ = quote_id
        return None

    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Hey, can you call me back about that quote?",
        external_id="trace-9",
        from_number="+1 423 555 0109",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-9")

    assert result["active_job_id"] == "job-9"
    assert result["linked_quote_id"] == "quote-9"
    assert len(inserted_drafts) == 1
    assert inserted_drafts[0].job_id == "job-9"


@pytest.mark.asyncio
async def test_process_call_transcript_links_explicit_job_and_creates_review_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    inserted_drafts: list[Draft] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-7", name="Miller Renovation")]

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        _ = quote_id
        return None

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        _ = (gc_id, destination)
        return None

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        inserted.append(dict(kwargs))
        return "ct-7"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        assert gc_id == "gc-demo"
        inserted_drafts.extend(drafts)

    async def _fake_parse_transcript(state) -> dict[str, object]:
        assert state.active_job_id == "job-7"
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="estimate_request",
                confidence=88,
                summary="Caller wants a repaint estimate for the detached garage.",
                urgency="high",
                risks=["Pricing may change if wood rot is present."],
                missing_information=["Exact garage dimensions"],
                next_actions=["Create quote draft", "Confirm material grade"],
                job_type="painting",
                scope_items=["Prep siding", "Prime garage trim", "Finish coat"],
                customer_questions=["Can you include upgraded exterior paint?"],
                insurance_involved=False,
                scheduling_notes=["Needs number before Friday"],
            )
        }

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="I need a repaint estimate for the detached garage before Friday.",
        external_id="trace-7",
        job_id="job-7",
        from_number="+14235550107",
        caller_name="Miller Renovation",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-7")

    assert result["transcript_id"] == "ct-7"
    assert result["active_job_id"] == "job-7"
    assert result["linked_quote_id"] == ""
    assert len(result["created_draft_ids"]) == 1
    assert inserted[0]["job_id"] == "job-7"
    assert inserted[0]["caller_name"] == "Miller Renovation"
    assert updated[0]["job_id"] == "job-7"
    assert updated[0]["classification"] == "estimate_request"
    assert inserted_drafts[0].job_id == "job-7"
    assert inserted_drafts[0].job_name == "Miller Renovation"
    assert inserted_drafts[0].type == "transcript-review"


@pytest.mark.asyncio
async def test_process_call_transcript_persists_unlinked_transcript_without_creating_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []
    inserted_drafts: list[Draft] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-1")]

    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        _ = quote_id
        return None

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        _ = (gc_id, destination)
        return None

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        inserted.append(dict(kwargs))
        return "ct-unlinked"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        _ = gc_id
        inserted_drafts.extend(drafts)

    async def _fake_parse_transcript(state) -> dict[str, object]:
        assert state.active_job_id == ""
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="unknown",
                confidence=41,
                summary="Inbound transcript needs manual classification.",
                urgency="normal",
                risks=[],
                missing_information=["Identify the job or quote this caller is asking about"],
                next_actions=["Review transcript manually"],
                job_type=None,
                scope_items=[],
                customer_questions=[],
                insurance_involved=None,
                scheduling_notes=[],
            )
        }

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Hi, calling back about the project. Please call me when you can.",
        external_id="trace-unlinked",
        from_number="+14235550999",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-unlinked")

    assert result["transcript_id"] == "ct-unlinked"
    assert result["active_job_id"] == ""
    assert result["linked_quote_id"] == ""
    assert result["created_draft_ids"] == []
    assert inserted[0]["job_id"] == ""
    assert inserted[0]["quote_id"] == ""
    assert updated[0]["classification"] == "unknown"
    assert inserted_drafts == []


@pytest.mark.asyncio
async def test_process_call_transcript_falls_back_safely_when_parser_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    updated: list[dict[str, Any]] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-2")]

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        return "ct-2"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        _ = (drafts, gc_id)

    async def _failing_parse_transcript(state) -> dict[str, object]:
        _ = state
        raise ValueError("bad transcript payload")

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        _ = quote_id
        return None

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        _ = (gc_id, destination)
        return None

    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _failing_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Something is wrong with the schedule.",
        external_id="trace-2",
        job_id="job-2",
        from_number="+14235550102",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-2")

    assert result["transcript_id"] == "ct-2"
    assert result["classification"] == "unknown"
    assert result["created_draft_ids"] != []
    assert "parse_call_transcript failed" in result["errors"][0]
    assert updated[0]["metadata"]["processing_error"] == "bad transcript payload"


@pytest.mark.asyncio
async def test_process_call_transcript_reuses_update_parse_for_update_like_classifications(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    updated: list[dict[str, Any]] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-3")]

    async def _fake_insert_call_transcript(**kwargs: Any) -> str:
        return "ct-3"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(drafts: list[Draft], gc_id: str) -> None:
        _ = (drafts, gc_id)

    async def _fake_parse_transcript(state) -> dict[str, object]:
        _ = state
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="job_update",
                confidence=84,
                summary="Crew said the framing inspection slipped to Tuesday.",
                urgency="high",
                risks=["Inspection delay"],
                missing_information=["Reason for the slip"],
                next_actions=["Confirm the rescheduled inspection slot."],
                job_type="framing",
                scope_items=[],
                customer_questions=[],
                insurance_involved=None,
                scheduling_notes=["Inspection moved to Tuesday."],
            )
        }

    async def _fake_parse_update(state) -> dict[str, object]:
        _ = state
        return {
            "parsed_intent": ParsedIntent(
                understanding="Schedule changed",
                job_updates=[{"job_id": "job-3", "field": "inspection_date", "value": "Tuesday"}],
            )
        }

    async def _fake_flag_risks(state) -> dict[str, object]:
        _ = state
        return {"risk_flags": ["Tuesday inspection may impact drywall start."]}

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    async def _fake_get_quote_draft_record(quote_id: str) -> dict[str, Any] | None:
        _ = quote_id
        return None

    async def _fake_find_recent_quote_delivery_match(gc_id: str, destination: str) -> dict[str, Any] | None:
        _ = (gc_id, destination)
        return None

    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(
        call_transcripts.queries,
        "find_recent_quote_delivery_match",
        _fake_find_recent_quote_delivery_match,
    )
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)
    monkeypatch.setattr(call_transcripts, "_PARSE_UPDATE", _fake_parse_update)
    monkeypatch.setattr(call_transcripts, "_FLAG_RISKS", _fake_flag_risks)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Inspection got pushed to Tuesday.",
        external_id="trace-3",
        job_id="job-3",
        from_number="+14235550103",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-3")

    assert result["classification"] == "job_update"
    assert "Tuesday inspection may impact drywall start." in result["risk_flags"]
    assert updated[0]["extracted_json"]["parsed_update"]["understanding"] == "Schedule changed"


@pytest.mark.asyncio
async def test_process_call_transcript_reuses_existing_transcript_without_duplicate_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-4", name="Taylor Project")]

    async def _fake_existing_transcript(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return {
            "id": "ct-existing",
            "gc_id": "gc-demo",
            "job_id": "job-4",
            "quote_id": "quote-4",
            "call_id": "call-4",
            "source": "call_transcript",
            "provider": "twilio",
            "caller_phone": "+14235550104",
            "caller_name": "Taylor Brooks",
            "transcript_text": "Please resend the estimate.",
            "summary": "Caller asked for the estimate again.",
            "classification": "followup_response",
            "confidence": 82.0,
            "extracted_json": {"urgency": "normal", "missing_information": []},
            "risk_flags": [],
            "recommended_actions": ["Send estimate again"],
            "trace_id": "trace-4",
            "metadata": {},
        }

    async def _fake_related_drafts(*_args: Any, **_kwargs: Any) -> list[str]:
        return ["draft-existing-1"]

    async def _fake_get_quote_draft_record(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    async def _fake_find_recent_quote_delivery_match(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "find_existing_call_transcript_for_ingest", _fake_existing_transcript)
    monkeypatch.setattr(call_transcripts.queries, "get_related_transcript_review_draft_ids", _fake_related_drafts)
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", pytest.fail)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", pytest.fail)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(call_transcripts.queries, "find_recent_quote_delivery_match", _fake_find_recent_quote_delivery_match)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="Please resend the estimate.",
        external_id="trace-4",
        call_id="call-4",
        from_number="+14235550104",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-4")

    assert result["transcript_id"] == "ct-existing"
    assert result["active_job_id"] == "job-4"
    assert result["linked_quote_id"] == "quote-4"
    assert result["created_draft_ids"] == ["draft-existing-1"]
    assert result["summary"] == "Caller asked for the estimate again."


@pytest.mark.asyncio
async def test_process_call_transcript_recreates_missing_queue_draft_for_existing_transcript(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    inserted_drafts: list[Draft] = []
    updated: list[dict[str, Any]] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-6", name="Jordan Residence")]

    async def _fake_existing_transcript(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return {
            "id": "ct-existing-6",
            "gc_id": "gc-demo",
            "job_id": "job-6",
            "quote_id": "",
            "call_id": "call-6",
            "source": "call_transcript",
            "provider": "twilio",
            "caller_phone": "+14235550106",
            "caller_name": "Jordan Residence",
            "transcript_text": "I need a quote for the detached garage.",
            "summary": "Caller needs a detached garage estimate.",
            "classification": "estimate_request",
            "confidence": 88.0,
            "extracted_json": {"urgency": "high", "missing_information": ["Exact square footage"]},
            "risk_flags": [],
            "recommended_actions": ["Create quote draft"],
            "trace_id": "trace-6",
            "metadata": {},
        }

    async def _fake_no_related_drafts(*_args: Any, **_kwargs: Any) -> list[str]:
        return []

    async def _fake_get_quote_draft_record(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    async def _fake_find_recent_quote_delivery_match(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    async def _fake_insert_drafts(drafts: list[Draft], _gc_id: str) -> None:
        inserted_drafts.extend(drafts)

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "find_existing_call_transcript_for_ingest", _fake_existing_transcript)
    monkeypatch.setattr(call_transcripts.queries, "get_related_transcript_review_draft_ids", _fake_no_related_drafts)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", pytest.fail)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(call_transcripts.queries, "find_recent_quote_delivery_match", _fake_find_recent_quote_delivery_match)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="I need a quote for the detached garage.",
        external_id="trace-6",
        call_id="call-6",
        from_number="+14235550106",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-6")

    assert len(inserted_drafts) == 1
    assert inserted_drafts[0].type == "transcript-review"
    assert result["created_draft_ids"] == [inserted_drafts[0].id]
    assert updated[-1]["metadata"]["created_draft_ids"] == [inserted_drafts[0].id]


@pytest.mark.asyncio
async def test_process_call_transcript_continues_when_queue_draft_creation_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    updated: list[dict[str, Any]] = []

    async def _fake_get_active_jobs(gc_id: str) -> list[Job]:
        assert gc_id == "gc-demo"
        return [_job("job-5")]

    async def _fake_get_quote_draft_record(_quote_id: str) -> dict[str, Any] | None:
        return None

    async def _fake_find_recent_quote_delivery_match(*_args: Any, **_kwargs: Any) -> dict[str, Any] | None:
        return None

    async def _fake_insert_call_transcript(**_kwargs: Any) -> str:
        return "ct-5"

    async def _fake_update_call_transcript(transcript_id: str, gc_id: str, **kwargs: Any) -> None:
        updated.append({"transcript_id": transcript_id, "gc_id": gc_id, **kwargs})

    async def _fake_insert_drafts(_drafts: list[Draft], _gc_id: str) -> None:
        raise DatabaseError("draft_queue unavailable")

    async def _fake_parse_transcript(_state) -> dict[str, object]:
        return {
            "transcript_analysis": CallTranscriptAnalysis(
                classification="estimate_request",
                confidence=88,
                summary="Caller needs a detached garage estimate.",
                urgency="high",
                risks=[],
                missing_information=["Exact square footage"],
                next_actions=["Create quote draft"],
                job_type="painting",
                scope_items=["Prep siding"],
                customer_questions=[],
                insurance_involved=False,
                scheduling_notes=[],
            )
        }

    monkeypatch.setattr(call_transcripts.queries, "get_active_jobs", _fake_get_active_jobs)
    monkeypatch.setattr(call_transcripts.queries, "get_quote_draft_record", _fake_get_quote_draft_record)
    monkeypatch.setattr(call_transcripts.queries, "find_recent_quote_delivery_match", _fake_find_recent_quote_delivery_match)
    monkeypatch.setattr(call_transcripts.queries, "insert_call_transcript", _fake_insert_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "update_call_transcript", _fake_update_call_transcript)
    monkeypatch.setattr(call_transcripts.queries, "insert_drafts", _fake_insert_drafts)
    monkeypatch.setattr(call_transcripts, "log_ingress_trace", lambda *args, **kwargs: None)
    monkeypatch.setattr(call_transcripts, "_PARSE_CALL_TRANSCRIPT", _fake_parse_transcript)

    payload = InboundInput(
        surface="call_transcript",
        intent="transcript",
        raw_text="I need a detached garage estimate.",
        external_id="trace-5",
        job_id="job-5",
    )

    result = await call_transcripts.process_call_transcript(payload, "gc-demo", "trace-5")

    assert result["transcript_id"] == "ct-5"
    assert result["created_draft_ids"] == []
    assert any("queue draft creation failed" in item for item in result["errors"])
    assert updated[0]["classification"] == "estimate_request"
