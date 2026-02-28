"""Pydantic state and domain models for GC Agent."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class OpenItem(BaseModel):
    """Represents a tracked action item tied to a job."""

    id: str
    job_id: str
    type: Literal[
        "RFI",
        "CO",
        "sub-confirm",
        "material",
        "decision",
        "approval",
        "follow-up",
    ]
    description: str
    owner: str
    status: Literal["open", "in-progress", "resolved", "overdue"] = "open"
    days_silent: int = 0
    due_date: Optional[date] = None


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
    ]
    title: str
    content: str
    why: str
    status: Literal["queued", "approved", "edited", "discarded", "needs-review"] = "queued"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ParsedIntent(BaseModel):
    """Structured interpretation of an incoming GC update message."""

    understanding: str
    job_updates: list[dict[str, object]] = Field(default_factory=list)
    new_open_items: list[dict[str, object]] = Field(default_factory=list)
    drafts: list[dict[str, object]] = Field(default_factory=list)
    risks_flagged: list[str] = Field(default_factory=list)


class AgentState(BaseModel):
    """Single LangGraph state object shared across all execution nodes."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    # Input
    input_type: Literal["whatsapp", "sms", "chat", "cron", "voice"] = "chat"
    raw_input: str = ""
    from_number: str = ""
    mode: Optional[Literal["update", "briefing", "query"]] = None
    thread_style: bool = False

    # Context
    gc_id: str = ""
    jobs: list[Job] = Field(default_factory=list)

    # Execution outputs
    parsed_intent: Optional[ParsedIntent] = None
    risk_flags: list[str] = Field(default_factory=list)
    drafts_created: list[Draft] = Field(default_factory=list)
    briefing_output: str = ""
    errors: list[str] = Field(default_factory=list)
    thread_id: str = ""


__all__ = [
    "OpenItem",
    "Job",
    "Draft",
    "ParsedIntent",
    "AgentState",
]