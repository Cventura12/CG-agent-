from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from gc_agent.db import queries


class _FakeResponse:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data


class _FakeTable:
    def __init__(self, store: dict[str, list[dict[str, Any]]], name: str) -> None:
        self._store = store
        self._name = name
        self._action = "select"
        self._payload: dict[str, Any] = {}
        self._filters: list[tuple[str, Any]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None

    def select(self, _: str) -> _FakeTable:
        self._action = "select"
        return self

    def insert(self, payload: dict[str, Any]) -> _FakeTable:
        self._action = "insert"
        self._payload = dict(payload)
        return self

    def update(self, payload: dict[str, Any]) -> _FakeTable:
        self._action = "update"
        self._payload = dict(payload)
        return self

    def eq(self, key: str, value: Any) -> _FakeTable:
        self._filters.append((key, value))
        return self

    def order(self, key: str, desc: bool = False) -> _FakeTable:
        self._order = (key, desc)
        return self

    def limit(self, value: int) -> _FakeTable:
        self._limit = int(value)
        return self

    def execute(self) -> _FakeResponse:
        rows = self._store.setdefault(self._name, [])

        if self._action == "insert":
            row = dict(self._payload)
            rows.append(row)
            return _FakeResponse([row])

        if self._action == "update":
            updated: list[dict[str, Any]] = []
            for row in rows:
                if self._matches(row):
                    row.update(self._payload)
                    updated.append(dict(row))
            return _FakeResponse(updated)

        selected = [dict(row) for row in rows if self._matches(row)]
        if self._order is not None:
            key, desc = self._order
            selected.sort(key=lambda row: row.get(key) or "", reverse=desc)
        if self._limit is not None:
            selected = selected[: self._limit]
        return _FakeResponse(selected)

    def _matches(self, row: dict[str, Any]) -> bool:
        for key, value in self._filters:
            if row.get(key) != value:
                return False
        return True


class _FakeClient:
    def __init__(self, store: dict[str, list[dict[str, Any]]]) -> None:
        self._store = store

    def table(self, name: str) -> _FakeTable:
        return _FakeTable(self._store, name)


def _patch_queries(
    monkeypatch: pytest.MonkeyPatch,
    store: dict[str, list[dict[str, Any]]],
    *,
    now: str = "2026-03-06T15:00:00+00:00",
) -> None:
    async def _fake_run_db(_: str, fn):
        return fn()

    monkeypatch.setattr(queries, "get_client", lambda: _FakeClient(store))
    monkeypatch.setattr(queries, "_run_db", _fake_run_db)
    monkeypatch.setattr(queries, "_utcnow_iso", lambda: now)


@pytest.mark.asyncio
async def test_insert_call_transcript_with_required_fields_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store: dict[str, list[dict[str, Any]]] = {}
    _patch_queries(monkeypatch, store)

    transcript_id = await queries.insert_call_transcript(
        gc_id="gc-demo",
        source="manual",
        transcript_text="Customer called asking for a quote.",
    )

    rows = store["call_transcripts"]
    assert len(rows) == 1
    row = rows[0]
    assert transcript_id == row["id"]
    assert row["gc_id"] == "gc-demo"
    assert row["source"] == "manual"
    assert row["transcript_text"] == "Customer called asking for a quote."
    assert row["extracted_json"] == {}
    assert row["risk_flags"] == []
    assert row["recommended_actions"] == []
    assert row["metadata"] == {}
    assert row["trace_id"] is None
    assert row["created_at"] == "2026-03-06T15:00:00+00:00"
    assert row["updated_at"] == "2026-03-06T15:00:00+00:00"


@pytest.mark.asyncio
async def test_insert_call_transcript_with_optional_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store: dict[str, list[dict[str, Any]]] = {}
    _patch_queries(monkeypatch, store)

    await queries.insert_call_transcript(
        gc_id="gc-demo",
        job_id="job-1",
        quote_id="quote-1",
        call_id="call-1",
        source="provider_webhook",
        provider="twilio",
        caller_phone="+14235550000",
        caller_name="Taylor",
        started_at="2026-03-06T14:30:00+00:00",
        duration_seconds=182,
        recording_url="https://example.test/recordings/1",
        transcript_text="Need to move the walkthrough to Monday.",
        summary="Caller wants to reschedule the walkthrough.",
        classification="reschedule",
        confidence=0.91,
        extracted_json={"requested_date": "Monday"},
        risk_flags=["schedule slip"],
        recommended_actions=["confirm new walkthrough time"],
        trace_id="trace-call-1",
        metadata={"provider_status": "completed"},
    )

    row = store["call_transcripts"][0]
    assert row["job_id"] == "job-1"
    assert row["quote_id"] == "quote-1"
    assert row["call_id"] == "call-1"
    assert row["provider"] == "twilio"
    assert row["caller_phone"] == "+14235550000"
    assert row["caller_name"] == "Taylor"
    assert row["duration_seconds"] == 182
    assert row["confidence"] == 0.91
    assert row["trace_id"] == "trace-call-1"
    assert row["recommended_actions"] == ["confirm new walkthrough time"]


@pytest.mark.asyncio
async def test_get_call_transcript_by_id_returns_normalized_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "call_id": "call-1",
                "source": "manual",
                "provider": "twilio",
                "caller_phone": " +14235550000 ",
                "caller_name": " Taylor ",
                "started_at": "2026-03-06T14:30:00+00:00",
                "duration_seconds": "182",
                "recording_url": " https://example.test/recordings/1 ",
                "transcript_text": " Need a quote update. ",
                "summary": " Waiting for a revised number. ",
                "classification": " quote_question ",
                "confidence": "0.76",
                "extracted_json": [],
                "risk_flags": {"bad": True},
                "recommended_actions": "call back",
                "trace_id": " trace-1 ",
                "metadata": [],
                "created_at": "2026-03-06T15:00:00+00:00",
                "updated_at": "2026-03-06T15:05:00+00:00",
            }
        ]
    }
    _patch_queries(monkeypatch, store)

    payload = await queries.get_call_transcript_by_id("ct-1", "gc-demo")

    assert payload is not None
    assert payload["id"] == "ct-1"
    assert payload["caller_phone"] == "+14235550000"
    assert payload["caller_name"] == "Taylor"
    assert payload["transcript_text"] == "Need a quote update."
    assert payload["summary"] == "Waiting for a revised number."
    assert payload["classification"] == "quote_question"
    assert payload["confidence"] == 76.0
    assert payload["extracted_json"] == {}
    assert payload["risk_flags"] == []
    assert payload["recommended_actions"] == []
    assert payload["metadata"] == {}
    assert payload["trace_id"] == "trace-1"


@pytest.mark.asyncio
async def test_get_call_transcripts_for_job_returns_newest_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-old",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "source": "manual",
                "transcript_text": "Old transcript",
                "created_at": "2026-03-05T10:00:00+00:00",
                "updated_at": "2026-03-05T10:00:00+00:00",
            },
            {
                "id": "ct-new",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "source": "manual",
                "transcript_text": "New transcript",
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:00:00+00:00",
            },
            {
                "id": "ct-other",
                "gc_id": "gc-demo",
                "job_id": "job-2",
                "quote_id": "",
                "source": "manual",
                "transcript_text": "Other job",
                "created_at": "2026-03-07T10:00:00+00:00",
                "updated_at": "2026-03-07T10:00:00+00:00",
            },
        ]
    }
    _patch_queries(monkeypatch, store)

    payload = await queries.get_call_transcripts_for_job("gc-demo", "job-1")

    assert [row["id"] for row in payload] == ["ct-new", "ct-old"]


@pytest.mark.asyncio
async def test_get_call_transcripts_for_quote_returns_newest_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "quote-1",
                "source": "manual",
                "transcript_text": "First quote transcript",
                "created_at": "2026-03-05T10:00:00+00:00",
                "updated_at": "2026-03-05T10:00:00+00:00",
            },
            {
                "id": "ct-2",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "quote-1",
                "source": "manual",
                "transcript_text": "Second quote transcript",
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:00:00+00:00",
            },
        ]
    }
    _patch_queries(monkeypatch, store)

    payload = await queries.get_call_transcripts_for_quote("gc-demo", "quote-1")

    assert [row["id"] for row in payload] == ["ct-2", "ct-1"]


@pytest.mark.asyncio
async def test_update_call_transcript_persists_enrichment_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": None,
                "quote_id": None,
                "source": "manual",
                "transcript_text": "Original transcript",
                "summary": None,
                "classification": None,
                "confidence": None,
                "extracted_json": {},
                "risk_flags": [],
                "recommended_actions": [],
                "metadata": {},
                "created_at": "2026-03-06T15:00:00+00:00",
                "updated_at": "2026-03-06T15:00:00+00:00",
            }
        ]
    }
    _patch_queries(monkeypatch, store, now="2026-03-06T16:00:00+00:00")

    await queries.update_call_transcript(
        "ct-1",
        "gc-demo",
        job_id="job-7",
        quote_id="quote-9",
        call_id="call-9",
        provider="twilio",
        summary="Caller reported a framing issue.",
        classification="issue",
        confidence=0.88,
        extracted_json={"trade": "Framing"},
        risk_flags=["blocked inspection"],
        recommended_actions=["call superintendent"],
        trace_id="trace-call-9",
        metadata={"ingested_by": "manual"},
    )

    row = store["call_transcripts"][0]
    assert row["job_id"] == "job-7"
    assert row["quote_id"] == "quote-9"
    assert row["call_id"] == "call-9"
    assert row["provider"] == "twilio"
    assert row["summary"] == "Caller reported a framing issue."
    assert row["classification"] == "issue"
    assert row["confidence"] == 0.88
    assert row["extracted_json"] == {"trade": "Framing"}
    assert row["risk_flags"] == ["blocked inspection"]
    assert row["recommended_actions"] == ["call superintendent"]
    assert row["trace_id"] == "trace-call-9"
    assert row["metadata"] == {"ingested_by": "manual"}
    assert row["updated_at"] == "2026-03-06T16:00:00+00:00"


@pytest.mark.asyncio
async def test_list_recent_call_transcripts_and_missing_row_behaviors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "",
                "quote_id": "",
                "source": "manual",
                "transcript_text": "One",
                "created_at": "2026-03-05T10:00:00+00:00",
                "updated_at": "2026-03-05T10:00:00+00:00",
            },
            {
                "id": "ct-2",
                "gc_id": "gc-demo",
                "job_id": "",
                "quote_id": "",
                "source": "manual",
                "transcript_text": "Two",
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:00:00+00:00",
            },
        ]
    }
    _patch_queries(monkeypatch, store)

    recent = await queries.list_recent_call_transcripts("gc-demo", limit=1)
    missing = await queries.get_call_transcript_by_id("missing", "gc-demo")
    job_rows = await queries.get_call_transcripts_for_job("gc-demo", "missing-job")
    quote_rows = await queries.get_call_transcripts_for_quote("gc-demo", "missing-quote")

    assert [row["id"] for row in recent] == ["ct-2"]
    assert missing is None
    assert job_rows == []
    assert quote_rows == []


@pytest.mark.asyncio
async def test_find_recent_quote_delivery_match_uses_normalized_phone_destination(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "quote_delivery_log": [
            {
                "quote_id": "quote-old",
                "job_id": "job-old",
                "recipient_name": "Old Match",
                "channel": "sms",
                "trace_id": "trace-old",
                "destination": "+1 (423) 555-0101",
                "created_at": "2026-03-05T10:00:00+00:00",
                "gc_id": "gc-demo",
            },
            {
                "quote_id": "quote-new",
                "job_id": "job-new",
                "recipient_name": "New Match",
                "channel": "whatsapp",
                "trace_id": "trace-new",
                "destination": "423-555-0101",
                "created_at": "2026-03-06T10:00:00+00:00",
                "gc_id": "gc-demo",
            },
        ]
    }
    _patch_queries(monkeypatch, store)

    payload = await queries.find_recent_quote_delivery_match("gc-demo", "+1 423 555 0101")

    assert payload is not None
    assert payload["quote_id"] == "quote-new"
    assert payload["job_id"] == "job-new"
    assert payload["recipient_name"] == "New Match"
    assert payload["channel"] == "whatsapp"


@pytest.mark.asyncio
async def test_get_queued_drafts_attaches_transcript_context(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "draft_queue": [
            {
                "id": "draft-transcript-1",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "transcript-review",
                "title": "Call transcript review",
                "content": "Transcript ID: ct-1\nSummary: Caller needs a revised quote.",
                "why": "Transcript classified as quote question with high urgency.",
                "status": "queued",
                "created_at": "2026-03-06T10:00:00+00:00",
                "trace_id": "trace-transcript-1",
                "jobs": {"name": "Miller Job"},
            }
        ],
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "quote-9",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550101",
                "caller_name": "Taylor Brooks",
                "transcript_text": "Can you send me the revised number before Friday?",
                "summary": "Caller wants the revised quote before Friday.",
                "classification": "quote_question",
                "confidence": 91,
                "extracted_json": {
                    "urgency": "high",
                    "missing_information": ["Updated total with permit allowance"],
                },
                "risk_flags": ["Client may stall approval without revised number."],
                "recommended_actions": ["Send revised quote", "Confirm permit allowance"],
                "trace_id": "trace-transcript-1",
                "metadata": {},
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:05:00+00:00",
            }
        ],
    }
    _patch_queries(monkeypatch, store)

    drafts = await queries.get_queued_drafts("gc-demo")

    assert len(drafts) == 1
    assert drafts[0].type == "transcript-review"
    assert drafts[0].transcript is not None
    assert drafts[0].transcript.summary == "Caller wants the revised quote before Friday."
    assert drafts[0].transcript.caller_label == "Taylor Brooks - +14235550101"
    assert drafts[0].transcript.urgency == "high"
    assert drafts[0].transcript.recommended_actions == ["Send revised quote", "Confirm permit allowance"]
    assert drafts[0].transcript.linked_quote_id == "quote-9"


@pytest.mark.asyncio
async def test_get_queued_drafts_omits_transcript_reviews_once_transcript_is_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "draft_queue": [
            {
                "id": "draft-transcript-reviewed",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "transcript-review",
                "title": "Call transcript review",
                "content": "Transcript ID: ct-reviewed\nSummary: Caller already handled.",
                "why": "Transcript classified as followup response.",
                "status": "queued",
                "created_at": "2026-03-06T10:00:00+00:00",
                "trace_id": "trace-reviewed",
                "jobs": {"name": "Miller Job"},
            },
            {
                "id": "draft-transcript-pending",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "transcript-review",
                "title": "Call transcript review",
                "content": "Transcript ID: ct-pending\nSummary: Caller needs an update logged.",
                "why": "Transcript classified as job update.",
                "status": "queued",
                "created_at": "2026-03-06T10:05:00+00:00",
                "trace_id": "trace-pending",
                "jobs": {"name": "Miller Job"},
            },
            {
                "id": "draft-owner-1",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "owner-update",
                "title": "Owner update draft",
                "content": "Send updated schedule.",
                "why": "Owner needs an updated schedule.",
                "status": "queued",
                "created_at": "2026-03-06T10:10:00+00:00",
                "trace_id": "trace-owner-1",
                "jobs": {"name": "Miller Job"},
            },
        ],
        "call_transcripts": [
            {
                "id": "ct-reviewed",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550101",
                "caller_name": "Taylor Brooks",
                "transcript_text": "Thanks, we already handled it.",
                "summary": "Handled on the call.",
                "classification": "followup_response",
                "confidence": 82,
                "extracted_json": {"urgency": "normal"},
                "risk_flags": [],
                "recommended_actions": [],
                "trace_id": "trace-reviewed",
                "metadata": {"review_state": "reviewed"},
                "created_at": "2026-03-06T09:55:00+00:00",
                "updated_at": "2026-03-06T10:00:00+00:00",
            },
            {
                "id": "ct-pending",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550102",
                "caller_name": "Jordan Lane",
                "transcript_text": "We found another issue on site.",
                "summary": "Field issue needs a logged update.",
                "classification": "job_update",
                "confidence": 88,
                "extracted_json": {"urgency": "high"},
                "risk_flags": ["Schedule risk"],
                "recommended_actions": ["Log as update"],
                "trace_id": "trace-pending",
                "metadata": {"review_state": "pending"},
                "created_at": "2026-03-06T10:05:00+00:00",
                "updated_at": "2026-03-06T10:05:00+00:00",
            },
        ],
    }
    _patch_queries(monkeypatch, store)

    drafts = await queries.get_queued_drafts("gc-demo")

    assert [draft.id for draft in drafts] == ["draft-owner-1", "draft-transcript-pending"]
    assert drafts[1].transcript is not None
    assert drafts[1].transcript.transcript_id == "ct-pending"
    assert all(draft.id != "draft-transcript-reviewed" for draft in drafts)


@pytest.mark.asyncio
async def test_get_job_call_history_returns_summary_first_entries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "quote-9",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550101",
                "caller_name": "Taylor Brooks",
                "transcript_text": "Can you send me the revised number before Friday?",
                "summary": "Caller wants the revised quote before Friday.",
                "classification": "quote_question",
                "confidence": 91,
                "extracted_json": {
                    "urgency": "high",
                    "missing_information": ["Updated total with permit allowance"],
                },
                "risk_flags": ["Client may stall approval without revised number."],
                "recommended_actions": ["Send revised quote", "Confirm permit allowance"],
                "trace_id": "trace-transcript-1",
                "metadata": {},
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:05:00+00:00",
            }
        ],
        "draft_queue": [
            {
                "id": "draft-transcript-1",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "transcript-review",
                "title": "Call transcript review",
                "content": "Transcript ID: ct-1",
                "why": "Transcript classified as quote question with high urgency.",
                "status": "queued",
                "trace_id": "trace-transcript-1",
                "created_at": "2026-03-06T10:06:00+00:00",
            }
        ],
    }
    _patch_queries(monkeypatch, store)

    history = await queries.get_job_call_history("gc-demo", "job-1")

    assert len(history) == 1
    assert history[0]["summary"] == "Caller wants the revised quote before Friday."
    assert "Taylor Brooks" in history[0]["caller_label"]
    assert "+14235550101" in history[0]["caller_label"]
    assert history[0]["related_queue_item_ids"] == ["draft-transcript-1"]
    assert history[0]["linked_quote_id"] == "quote-9"


@pytest.mark.asyncio
async def test_get_job_call_history_falls_back_to_embedded_transcript_id_for_queue_linkage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-embedded",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550101",
                "caller_name": "Taylor Brooks",
                "transcript_text": "Need the quote resent.",
                "summary": "",
                "classification": "",
                "confidence": 0.91,
                "extracted_json": {},
                "risk_flags": [],
                "recommended_actions": [],
                "trace_id": "",
                "metadata": {},
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:05:00+00:00",
            }
        ],
        "draft_queue": [
            {
                "id": "draft-transcript-embedded",
                "job_id": "job-1",
                "gc_id": "gc-demo",
                "type": "transcript-review",
                "title": "Call transcript review",
                "content": "Transcript ID: ct-embedded\nSummary: Needs quote resent.",
                "why": "Transcript classified as followup response.",
                "status": "queued",
                "trace_id": "",
                "created_at": "2026-03-06T10:06:00+00:00",
            }
        ],
    }
    _patch_queries(monkeypatch, store)

    history = await queries.get_job_call_history("gc-demo", "job-1")

    assert len(history) == 1
    assert history[0]["related_queue_item_ids"] == ["draft-transcript-embedded"]
    assert history[0]["summary"] == "Need the quote resent."
    assert history[0]["classification"] == "unknown"
    assert history[0]["confidence"] == 91.0


@pytest.mark.asyncio
async def test_get_job_audit_timeline_includes_transcript_events(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = {
        "call_transcripts": [
            {
                "id": "ct-1",
                "gc_id": "gc-demo",
                "job_id": "job-1",
                "quote_id": "quote-9",
                "source": "call_transcript",
                "provider": "manual",
                "caller_phone": "+14235550101",
                "caller_name": "Taylor Brooks",
                "transcript_text": "Can you send me the revised number before Friday?",
                "summary": "Caller wants the revised quote before Friday.",
                "classification": "quote_question",
                "confidence": 91,
                "extracted_json": {"urgency": "high"},
                "risk_flags": [],
                "recommended_actions": [],
                "trace_id": "trace-transcript-1",
                "metadata": {},
                "created_at": "2026-03-06T10:00:00+00:00",
                "updated_at": "2026-03-06T10:05:00+00:00",
            }
        ]
    }
    _patch_queries(monkeypatch, store)

    timeline = await queries.get_job_audit_timeline("gc-demo", "job-1")

    assert len(timeline) == 1
    assert timeline[0]["event_type"] == "call_transcript_received"
    assert timeline[0]["title"] == "Call captured"
    assert timeline[0]["metadata"]["transcript_id"] == "ct-1"
    assert timeline[0]["metadata"]["urgency"] == "high"


def test_call_transcripts_migration_matches_repo_fk_types() -> None:
    migration_path = Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "016_call_transcripts.sql"
    migration_sql = migration_path.read_text(encoding="utf-8")

    assert "gc_id uuid not null" in migration_sql
    assert "job_id text references public.jobs(id)" in migration_sql
    assert "quote_id text references public.quote_drafts(id)" in migration_sql


def test_call_transcript_lookup_index_migration_exists() -> None:
    migration_path = Path(__file__).resolve().parents[1] / "supabase" / "migrations" / "017_call_transcript_lookup_indexes.sql"
    migration_sql = migration_path.read_text(encoding="utf-8")

    assert "idx_call_transcripts_gc_source_call" in migration_sql
    assert "on public.call_transcripts (gc_id, source, call_id)" in migration_sql
    assert "idx_call_transcripts_gc_source_trace" in migration_sql
    assert "on public.call_transcripts (gc_id, source, trace_id)" in migration_sql
