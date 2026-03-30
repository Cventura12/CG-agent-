"""Pydantic state and domain models for Arbor Agent."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class OpenItem(BaseModel):
    """Represents a tracked action item tied to a job."""

    id: str
    job_id: str
    type: Literal[
        "quote",
        "action",
        "RFI",
        "CO",
        "sub-confirm",
        "material",
        "decision",
        "approval",
        "follow-up",
        "followup",
    ]
    description: str
    owner: str
    status: Literal["open", "in-progress", "resolved", "overdue"] = "open"
    action_stage: Literal["drafted", "approved", "sent", "customer-approved", "completed"] | None = None
    days_silent: int = 0
    due_date: Optional[date] = None
    trace_id: str = ""


class Job(BaseModel):
    """Represents a construction job and its current operating context."""

    id: str
    name: str
    type: str
    status: Literal["active", "on-hold", "complete"] = "active"
    address: str
    contract_value: int
    contract_type: str
    est_completion: str
    notes: str = ""
    last_updated: str = ""
    open_items: list[OpenItem] = Field(default_factory=list)

    def status_summary(self) -> str:
        """Return a one-line summary with open item volume and oldest silence."""
        open_count = len(self.open_items)
        oldest_silent_days = max((item.days_silent for item in self.open_items), default=0)
        return (
            f"{self.name} ({self.status}) - "
            f"{open_count} open item(s), "
            f"oldest silent: {oldest_silent_days} day(s)"
        )


class Draft(BaseModel):
    """Represents a ready-to-send communication draft prepared by the agent."""

    id: str
    job_id: str
    job_name: str
    type: Literal[
        "CO",
        "RFI",
        "sub-message",
        "follow-up",
        "owner-update",
        "material-order",
        "transcript-review",
    ]
    title: str
    original_content: Optional[str] = None
    content: str
    why: str
    status: Literal["queued", "pending", "approved", "edited", "discarded", "needs-review"] = "queued"
    was_edited: bool = False
    approval_status: Literal["approved_without_edit", "approved_with_edit", "discarded"] | None = None
    approval_recorded_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    trace_id: str = ""
    transcript: Optional["DraftTranscriptContext"] = None
    responsibility_tags: list["ResponsibilityTag"] = Field(default_factory=list)


class ParsedIntent(BaseModel):
    """Structured interpretation of an incoming GC update message."""

    understanding: str
    job_updates: list[dict[str, object]] = Field(default_factory=list)
    new_open_items: list[dict[str, object]] = Field(default_factory=list)
    drafts: list[dict[str, object]] = Field(default_factory=list)
    risks_flagged: list[str] = Field(default_factory=list)


TranscriptClassification = Literal[
    "estimate_request",
    "quote_question",
    "job_update",
    "reschedule",
    "complaint_or_issue",
    "followup_response",
    "vendor_or_subcontractor",
    "unknown",
]

TranscriptUrgency = Literal["low", "normal", "high"]
ResponsibilityTag = Literal[
    "project_management",
    "communication",
    "budgeting",
    "subcontractor_management",
    "permits_and_compliance",
    "safety_management",
]
VoiceConversationGoal = Literal["quote_request", "job_update", "issue_report", "follow_up", "general"]
VoiceSessionStatus = Literal[
    "active",
    "awaiting_caller",
    "streaming",
    "ready_for_review",
    "escalated",
    "completed",
    "failed",
]
VoiceSpeaker = Literal["caller", "agent", "system"]
VoiceRuntimeMode = Literal["gather", "stream"]
VoiceTransferState = Literal["none", "requested", "dialing", "transferred", "saved_for_review", "failed"]
VoiceStreamState = Literal["idle", "connecting", "streaming", "paused", "closed", "failed"]
VoiceSlotName = Literal[
    "job_reference",
    "scope_summary",
    "timeline",
    "urgency",
    "caller_name",
    "callback_number",
    "value_signal",
    "follow_up_target",
    "trade",
    "material_or_scope_item",
    "quantity_or_measurement",
    "site_access",
    "customer_decision",
    "schedule_constraint",
    "insurance_context",
]


class CallTranscriptRecord(BaseModel):
    """Durable call transcript record used by persistence helpers."""

    id: str
    gc_id: str
    job_id: str = ""
    quote_id: str = ""
    call_id: str = ""
    source: str
    provider: str = ""
    caller_phone: str = ""
    caller_name: str = ""
    started_at: str | None = None
    duration_seconds: int | None = None
    recording_url: str = ""
    transcript_text: str
    summary: str = ""
    classification: TranscriptClassification = "unknown"
    confidence: float | None = None
    extracted_json: dict[str, Any] = Field(default_factory=dict)
    risk_flags: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    trace_id: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: str | None = None
    updated_at: str | None = None


class CallTranscriptAnalysis(BaseModel):
    """Validated classifier/extraction output for one call transcript."""

    classification: TranscriptClassification
    confidence: float | None = None
    summary: str
    urgency: TranscriptUrgency = "normal"
    risks: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    job_type: str | None = None
    scope_items: list[str] = Field(default_factory=list)
    customer_questions: list[str] = Field(default_factory=list)
    insurance_involved: bool | None = None
    scheduling_notes: list[str] = Field(default_factory=list)


class DraftTranscriptContext(BaseModel):
    """Queue-friendly transcript context attached to transcript-review drafts."""

    transcript_id: str
    source: str
    provider: str = ""
    caller_label: str = ""
    caller_phone: str = ""
    summary: str = ""
    classification: TranscriptClassification = "unknown"
    urgency: TranscriptUrgency = "normal"
    confidence: float | None = None
    recommended_actions: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    transcript_text: str = ""
    linked_quote_id: str = ""
    recording_url: str = ""
    started_at: str | None = None
    duration_seconds: int | None = None
    responsibility_tags: list[ResponsibilityTag] = Field(default_factory=list)


class TranscriptInboxItem(BaseModel):
    """Queue inbox representation for unlinked or manually triaged transcripts."""

    transcript_id: str
    trace_id: str = ""
    caller_label: str = ""
    caller_phone: str = ""
    source: str = ""
    provider: str = ""
    summary: str = ""
    classification: TranscriptClassification = "unknown"
    urgency: TranscriptUrgency = "normal"
    confidence: float | None = None
    recommended_actions: list[str] = Field(default_factory=list)
    risk_flags: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    transcript_text: str = ""
    linked_quote_id: str = ""
    related_queue_item_ids: list[str] = Field(default_factory=list)
    created_at: str | None = None
    recording_url: str = ""
    started_at: str | None = None
    duration_seconds: int | None = None
    match_source: str = "unlinked"
    review_state: Literal["pending", "reviewed", "discarded", "logged_update"] = "pending"
    responsibility_tags: list[ResponsibilityTag] = Field(default_factory=list)


class ResponsibilityDefinition(BaseModel):
    """Canonical GC responsibility definition for routing tags."""

    tag: ResponsibilityTag
    label: str
    description: str


class TranscriptQuotePrefill(BaseModel):
    """Quote-workspace prefill derived from a persisted call transcript."""

    transcript_id: str
    trace_id: str = ""
    classification: TranscriptClassification = "unknown"
    confidence: float | None = None
    summary: str = ""
    urgency: TranscriptUrgency = "normal"
    caller_name: str = ""
    caller_phone: str = ""
    linked_job_id: str = ""
    linked_quote_id: str = ""
    customer_name: str = ""
    job_type: str = ""
    scope_items: list[str] = Field(default_factory=list)
    customer_questions: list[str] = Field(default_factory=list)
    insurance_involved: bool | None = None
    missing_information: list[str] = Field(default_factory=list)
    recommended_actions: list[str] = Field(default_factory=list)
    scheduling_notes: list[str] = Field(default_factory=list)
    estimate_related: bool = False
    quote_input: str = ""


class TranscriptIngestResult(BaseModel):
    """Stable API payload returned after transcript ingest completes."""

    mode: Literal["transcript"] = "transcript"
    trace_id: str
    transcript_id: str
    summary: str = "Manual transcript review needed."
    classification: TranscriptClassification = "unknown"
    confidence: float | None = None
    urgency: TranscriptUrgency = "normal"
    risk_flags: list[str] = Field(default_factory=list)
    missing_information: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    active_job_id: str = ""
    linked_quote_id: str = ""
    created_draft_ids: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)


class VoiceTurn(BaseModel):
    """One conversational turn captured during a live voice session."""

    speaker: VoiceSpeaker
    text: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    confidence: float | None = None


class VoiceMissingSlot(BaseModel):
    """One required fact the agent still needs before handing off for review."""

    name: VoiceSlotName
    reason: str
    prompt: str


class VoiceSessionPlan(BaseModel):
    """Planner output for the next conversational step in a live call."""

    goal: VoiceConversationGoal = "general"
    status: VoiceSessionStatus = "active"
    summary: str = ""
    extracted_fields: dict[str, str] = Field(default_factory=dict)
    missing_slots: list[VoiceMissingSlot] = Field(default_factory=list)
    next_prompt: str = ""
    ready_for_review: bool = False
    escalate_to_human: bool = False
    handoff_intent: Literal["transcript", "update", "estimate"] = "transcript"
    detected_trade: str = ""


class VoiceSession(BaseModel):
    """In-memory representation of one live conversational voice call."""

    id: str
    call_id: str = ""
    gc_id: str = ""
    provider: str = ""
    from_number: str = ""
    to_number: str = ""
    caller_name: str = ""
    runtime_mode: VoiceRuntimeMode = "gather"
    status: VoiceSessionStatus = "active"
    goal: VoiceConversationGoal = "general"
    stream_state: VoiceStreamState = "idle"
    stream_sid: str = ""
    turns: list[VoiceTurn] = Field(default_factory=list)
    extracted_fields: dict[str, str] = Field(default_factory=dict)
    missing_slots: list[VoiceMissingSlot] = Field(default_factory=list)
    asked_slots: list[VoiceSlotName] = Field(default_factory=list)
    summary: str = ""
    last_prompt: str = ""
    last_caller_transcript: str = ""
    silence_count: int = 0
    transcript_id: str = ""
    handoff_trace_id: str = ""
    handoff_result: dict[str, Any] = Field(default_factory=dict)
    escalation_reason: str = ""
    transfer_state: VoiceTransferState = "none"
    transfer_target: str = ""
    recording_url: str = ""
    recording_storage_ref: str = ""
    recording_content_type: str = "audio/wav"
    recording_duration_seconds: float | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgentState(BaseModel):
    """Single LangGraph state object shared across all execution nodes."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Input
    input_type: Literal["whatsapp", "sms", "chat", "cron", "voice"] = "chat"
    raw_input: str = ""
    from_number: str = ""
    mode: Optional[Literal["update", "briefing", "query", "estimate", "transcript"]] = None
    thread_style: bool = False
    uploaded_files: list[dict[str, object]] = Field(default_factory=list)

    # Phase 1 / v5 estimating loop fields
    cleaned_input: str = ""
    job_scope: dict[str, object] = Field(default_factory=dict)
    materials: dict[str, object] = Field(default_factory=dict)
    quote_draft: dict[str, object] = Field(default_factory=dict)
    final_quote_draft: dict[str, object] = Field(default_factory=dict)
    memory_context: dict[str, object] = Field(default_factory=dict)
    clarification_needed: bool = False
    clarification_questions: list[str] = Field(default_factory=list)
    approval_status: Literal["pending", "approved", "edited", "rejected", "discarded"] = "pending"
    followup_count: int = 0
    active_job_id: str = ""
    stop_following_up: bool = False

    # Context
    gc_id: str = ""
    jobs: list[Job] = Field(default_factory=list)

    # Execution outputs
    parsed_intent: Optional[ParsedIntent] = None
    risk_flags: list[str] = Field(default_factory=list)
    drafts_created: list[Draft] = Field(default_factory=list)
    rendered_quote: str = ""
    briefing_output: str = ""
    errors: list[str] = Field(default_factory=list)
    thread_id: str = ""
    trace_id: str = ""


Draft.model_rebuild()


__all__ = [
    "OpenItem",
    "Job",
    "Draft",
    "ParsedIntent",
    "TranscriptClassification",
    "TranscriptUrgency",
    "VoiceConversationGoal",
    "VoiceSessionStatus",
    "VoiceSpeaker",
    "VoiceRuntimeMode",
    "VoiceTransferState",
    "VoiceStreamState",
    "VoiceSlotName",
    "CallTranscriptRecord",
    "CallTranscriptAnalysis",
    "DraftTranscriptContext",
    "TranscriptInboxItem",
    "TranscriptQuotePrefill",
    "TranscriptIngestResult",
    "ResponsibilityDefinition",
    "ResponsibilityTag",
    "VoiceTurn",
    "VoiceMissingSlot",
    "VoiceSessionPlan",
    "VoiceSession",
    "AgentState",
]
