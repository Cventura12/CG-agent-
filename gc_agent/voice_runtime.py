"""In-memory conversational voice runtime for live call handling."""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone
from typing import Iterable

from gc_agent.state import (
    VoiceConversationGoal,
    VoiceMissingSlot,
    VoiceSpeaker,
    VoiceSession,
    VoiceSessionPlan,
    VoiceSessionStatus,
    VoiceTurn,
)

_SESSION_TTL = timedelta(hours=8)
_VOICE_SESSIONS: dict[str, VoiceSession] = {}

_QUOTE_KEYWORDS = ("quote", "estimate", "pricing", "price", "bid")
_FOLLOW_UP_KEYWORDS = ("follow up", "follow-up", "heard back", "response", "checking on", "call back")
_ISSUE_KEYWORDS = (
    "change",
    "add",
    "swap",
    "replace",
    "issue",
    "problem",
    "leak",
    "damage",
    "repair",
)
_UPDATE_KEYWORDS = ("schedule", "reschedule", "finished", "done", "onsite", "on site", "crew")
_URGENT_KEYWORDS = ("urgent", "asap", "right away", "immediately", "today", "tonight", "leak", "damage")
_SCOPE_SIGNAL_KEYWORDS = (
    "need",
    "needs",
    "want",
    "wants",
    "changed",
    "change",
    "add",
    "swap",
    "replace",
    "repair",
    "fix",
    "quote",
    "estimate",
    "price",
    "follow up",
    "call back",
    "send",
)
_TIMELINE_PATTERNS = (
    "today",
    "tomorrow",
    "tonight",
    "this week",
    "next week",
    "asap",
    "right away",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
_ESCALATION_KEYWORDS = ("human", "person", "office", "someone else", "not sure", "confused")
_TRADE_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("roofing", ("roof", "roofing", "shingle", "flashing", "ridge", "valley", "drip edge", "chimney")),
    ("electrical", ("electrical", "lighting", "fixture", "panel", "switch", "breaker")),
    ("plumbing", ("plumbing", "drain", "water", "valve", "supply line", "leak", "toilet")),
    ("interiors", ("cabinet", "tile", "drywall", "paint", "counter", "ceiling", "flooring")),
    ("exteriors", ("siding", "soffit", "fascia", "gutter", "window", "door", "decking")),
)
_MEASUREMENT_PATTERN = re.compile(
    r"(\b\d+(?:\.\d+)?\s*(?:sq|squares?|ft|feet|foot|lf|linear feet|sheets?|pieces?|windows?|doors?|fixtures?)\b|\b\d{1,2}/12\b)",
    re.IGNORECASE,
)
_MATERIAL_PATTERN = re.compile(
    r"\b(?:shingle|flashing|ridge vent|underlayment|drip edge|window package|door package|decking|tile|cabinet|fixture|panel|pipe|drain)\b",
    re.IGNORECASE,
)
_SITE_ACCESS_KEYWORDS = ("occupied", "tenant", "gate", "lift", "parking", "interior access", "access", "weather", "crew closes")
_DECISION_KEYWORDS = ("owner wants", "customer wants", "waiting on approval", "decide", "choice", "option", "approve", "approval")
_INSURANCE_KEYWORDS = ("insurance", "carrier", "adjuster", "supplement", "claim")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def clear_voice_sessions() -> None:
    """Test helper to remove all in-memory voice sessions."""
    _VOICE_SESSIONS.clear()


def prune_voice_sessions(*, now: datetime | None = None) -> None:
    """Drop expired in-memory voice sessions."""
    current = now or _utcnow()
    expired = [
        session_id
        for session_id, session in _VOICE_SESSIONS.items()
        if current - session.updated_at > _SESSION_TTL
    ]
    for session_id in expired:
        _VOICE_SESSIONS.pop(session_id, None)


def get_voice_session(session_id: str) -> VoiceSession | None:
    """Return an active voice session from the in-memory store."""
    prune_voice_sessions()
    return _VOICE_SESSIONS.get(session_id.strip())


def remember_voice_session(session: VoiceSession) -> VoiceSession:
    """Restore or replace one in-memory voice session snapshot."""
    session_id = session.id.strip()
    if not session_id:
        raise ValueError("voice session id is required")
    _VOICE_SESSIONS[session_id] = session
    return session


def update_voice_session(session_id: str, updates: Mapping[str, object]) -> VoiceSession:
    """Apply one shallow update to a stored voice session."""
    session = get_voice_session(session_id)
    if session is None:
        raise ValueError(f"voice session not found: {session_id}")

    updated = session.model_copy(update={**dict(updates), "updated_at": _utcnow()})
    _VOICE_SESSIONS[session_id] = updated
    return updated


def upsert_voice_session(
    session_id: str,
    *,
    gc_id: str = "",
    call_id: str = "",
    from_number: str = "",
    to_number: str = "",
    provider: str = "",
    caller_name: str = "",
    metadata: dict[str, object] | None = None,
) -> VoiceSession:
    """Create or update one voice session shell."""
    prune_voice_sessions()
    session_key = session_id.strip()
    if not session_key:
        raise ValueError("session_id is required")

    existing = _VOICE_SESSIONS.get(session_key)
    if existing is None:
        existing = VoiceSession(id=session_key)

    merged_metadata = dict(existing.metadata)
    if metadata:
        merged_metadata.update(metadata)

    updated = existing.model_copy(
        update={
            "gc_id": gc_id.strip() or existing.gc_id,
            "call_id": call_id.strip() or existing.call_id or session_key,
            "from_number": from_number.strip() or existing.from_number,
            "to_number": to_number.strip() or existing.to_number,
            "provider": provider.strip() or existing.provider,
            "caller_name": caller_name.strip() or existing.caller_name,
            "metadata": merged_metadata,
            "updated_at": _utcnow(),
        }
    )
    _VOICE_SESSIONS[session_key] = updated
    return updated


def append_voice_turn(
    session_id: str,
    *,
    speaker: VoiceSpeaker,
    text: str,
    confidence: float | None = None,
) -> VoiceSession:
    """Append one caller or agent turn to the session transcript."""
    session = get_voice_session(session_id)
    if session is None:
        raise ValueError(f"voice session not found: {session_id}")

    cleaned_text = text.strip()
    if not cleaned_text:
        return session

    turns = [*session.turns, VoiceTurn(speaker=speaker, text=cleaned_text, confidence=confidence)]
    update_payload: dict[str, object] = {"turns": turns, "updated_at": _utcnow()}
    if speaker == "caller":
        update_payload["last_caller_transcript"] = cleaned_text
    updated = session.model_copy(update=update_payload)
    _VOICE_SESSIONS[session_id] = updated
    return updated


def increment_voice_silence(session_id: str) -> VoiceSession:
    """Track consecutive no-input reprompts for one session."""
    session = get_voice_session(session_id)
    if session is None:
        raise ValueError(f"voice session not found: {session_id}")

    updated = session.model_copy(
        update={
            "silence_count": session.silence_count + 1,
            "updated_at": _utcnow(),
        }
    )
    _VOICE_SESSIONS[session_id] = updated
    return updated


def apply_voice_plan(session_id: str, plan: VoiceSessionPlan) -> VoiceSession:
    """Persist planner output back onto the session."""
    session = get_voice_session(session_id)
    if session is None:
        raise ValueError(f"voice session not found: {session_id}")

    updated = session.model_copy(
        update={
            "goal": plan.goal,
            "status": plan.status,
            "summary": plan.summary,
            "extracted_fields": plan.extracted_fields,
            "missing_slots": plan.missing_slots,
            "last_prompt": plan.next_prompt,
            "asked_slots": (
                [*session.asked_slots, plan.missing_slots[0].name]
                if plan.missing_slots and plan.missing_slots[0].prompt == plan.next_prompt and plan.missing_slots[0].name not in session.asked_slots
                else list(session.asked_slots)
            ),
            "updated_at": _utcnow(),
        }
    )
    _VOICE_SESSIONS[session_id] = updated
    return updated


def mark_voice_handoff(
    session_id: str,
    *,
    trace_id: str,
    handoff_result: dict[str, object],
    status: VoiceSessionStatus = "completed",
) -> VoiceSession:
    """Record that a live voice session has been handed off for review."""
    session = get_voice_session(session_id)
    if session is None:
        raise ValueError(f"voice session not found: {session_id}")

    updated = session.model_copy(
        update={
            "transcript_id": str(handoff_result.get("transcript_id", "")).strip() or session.transcript_id,
            "handoff_trace_id": trace_id.strip(),
            "handoff_result": dict(handoff_result),
            "status": status,
            "stream_state": "closed",
            "updated_at": _utcnow(),
        }
    )
    _VOICE_SESSIONS[session_id] = updated
    return updated


def build_voice_transcript(session: VoiceSession) -> str:
    """Render the session turns into a transcript string for downstream review."""
    lines: list[str] = []
    for turn in session.turns:
        speaker = "Caller" if turn.speaker == "caller" else "Agent"
        lines.append(f"{speaker}: {turn.text}")
    return "\n".join(lines).strip()


def _caller_turn_text(session: VoiceSession) -> list[str]:
    return [turn.text.strip() for turn in session.turns if turn.speaker == "caller" and turn.text.strip()]


def _combined_caller_text(session: VoiceSession) -> str:
    return " ".join(_caller_turn_text(session)).strip()


def _contains_phrase(text: str, phrase: str) -> bool:
    return bool(re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text))


def _contains_any(text: str, phrases: Iterable[str]) -> bool:
    return any(_contains_phrase(text, phrase) for phrase in phrases)


def _detect_goal(text: str) -> VoiceConversationGoal:
    lowered = text.lower()
    if _contains_any(lowered, _QUOTE_KEYWORDS):
        return "quote_request"
    if _contains_any(lowered, _FOLLOW_UP_KEYWORDS):
        return "follow_up"
    if _contains_any(lowered, _ISSUE_KEYWORDS):
        return "issue_report"
    if _contains_any(lowered, _UPDATE_KEYWORDS):
        return "job_update"
    return "general"


def _extract_caller_name(session: VoiceSession, turns: Iterable[str]) -> str:
    if session.caller_name.strip():
        return session.caller_name.strip()

    for text in turns:
        match = re.search(r"\b(?:this is|i am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return ""


def _extract_job_reference(turns: Iterable[str]) -> str:
    for text in turns:
        match = re.search(
            r"\b(?:at|for|on)\s+([A-Za-z0-9#&'./-]+(?:\s+[A-Za-z0-9#&'./-]+){0,5})",
            text,
            re.IGNORECASE,
        )
        if match:
            candidate = match.group(1).strip(" .,!?:;")
            if len(candidate) >= 4:
                return candidate
        match = re.search(
            r"\b([A-Za-z0-9#&'./-]+(?:\s+[A-Za-z0-9#&'./-]+){0,4})\s+job\b",
            text,
            re.IGNORECASE,
        )
        if match:
            candidate = match.group(1).strip(" .,!?:;")
            if len(candidate) >= 4:
                return candidate
    return ""


def _extract_scope_summary(turns: list[str]) -> str:
    for text in reversed(turns):
        lowered = text.lower()
        if _contains_any(lowered, (*_QUOTE_KEYWORDS, *_ISSUE_KEYWORDS, *_FOLLOW_UP_KEYWORDS, *_UPDATE_KEYWORDS)):
            return text.strip()

    for text in reversed(turns):
        lowered = text.lower()
        if _contains_any(lowered, _SCOPE_SIGNAL_KEYWORDS):
            return text.strip()
        if re.match(r"^\s*(this is|i am|i'm)\b", lowered):
            continue
        if len(text.split()) >= 8:
            return text.strip()

    return ""


def _extract_value_signal(text: str) -> str:
    match = re.search(r"(\$?\d[\d,]*(?:\.\d{1,2})?)", text)
    return match.group(1).strip() if match else ""


def _extract_timeline(text: str) -> str:
    lowered = text.lower()
    for pattern in _TIMELINE_PATTERNS:
        if _contains_phrase(lowered, pattern):
            return pattern
    return ""


def _infer_urgency(text: str) -> str:
    lowered = text.lower()
    if _contains_any(lowered, _URGENT_KEYWORDS):
        return "high"
    if lowered.strip():
        return "normal"
    return ""


def _extract_follow_up_target(text: str) -> str:
    match = re.search(r"\bfollow(?:-| )up with\s+([A-Za-z0-9 &'./-]+)", text, re.IGNORECASE)
    if match:
        return match.group(1).strip(" .,!?:;")
    if "owner" in text.lower():
        return "owner"
    if "customer" in text.lower():
        return "customer"
    return ""


def _detect_trade(text: str) -> str:
    lowered = text.lower()
    for trade, keywords in _TRADE_KEYWORDS:
        if any(_contains_phrase(lowered, keyword) for keyword in keywords):
            return trade
    return ""


def _extract_material_or_scope_item(text: str) -> str:
    match = _MATERIAL_PATTERN.search(text)
    if match:
        return match.group(0).strip()
    return ""


def _extract_quantity_or_measurement(text: str) -> str:
    match = _MEASUREMENT_PATTERN.search(text)
    if match:
        return match.group(0).strip()
    return ""


def _extract_site_access(text: str) -> str:
    lowered = text.lower()
    for keyword in _SITE_ACCESS_KEYWORDS:
        if _contains_phrase(lowered, keyword):
            return keyword
    return ""


def _extract_customer_decision(text: str) -> str:
    lowered = text.lower()
    for keyword in _DECISION_KEYWORDS:
        if _contains_phrase(lowered, keyword):
            return keyword
    return ""


def _extract_schedule_constraint(text: str) -> str:
    lowered = text.lower()
    for pattern in (*_TIMELINE_PATTERNS, "before inspection", "before the crew leaves", "before drywall", "before close-in"):
        if _contains_phrase(lowered, pattern):
            return pattern
    return ""


def _extract_insurance_context(text: str) -> str:
    lowered = text.lower()
    for keyword in _INSURANCE_KEYWORDS:
        if _contains_phrase(lowered, keyword):
            return keyword
    return ""


def _should_escalate(text: str, silence_count: int) -> bool:
    lowered = text.lower()
    return silence_count >= 2 or _contains_any(lowered, _ESCALATION_KEYWORDS)


def _dedupe_slot_names(slot_names: Iterable[str]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for slot_name in slot_names:
        normalized = slot_name.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def _required_slot_order(
    goal: VoiceConversationGoal,
    extracted: dict[str, str],
    combined_text: str,
) -> list[str]:
    lowered = combined_text.lower()
    trade = extracted.get("trade", "").strip().lower()
    material_known = bool(extracted.get("material_or_scope_item", "").strip())
    insurance_signaled = bool(extracted.get("insurance_context", "").strip()) or _contains_any(
        lowered,
        _INSURANCE_KEYWORDS,
    )
    urgency_high = extracted.get("urgency", "").strip().lower() == "high"
    schedule_signaled = bool(extracted.get("schedule_constraint", "").strip()) or _contains_any(
        lowered,
        (*_TIMELINE_PATTERNS, "inspection", "crew leaves", "crew closes", "deadline"),
    )

    if goal == "quote_request":
        ordered = ["job_reference", "scope_summary", "material_or_scope_item"]
        if material_known or trade in {"roofing", "electrical", "plumbing", "interiors", "exteriors"}:
            ordered.append("quantity_or_measurement")
        if insurance_signaled:
            ordered.extend(["insurance_context", "customer_decision"])
        ordered.append("timeline")
        if urgency_high or schedule_signaled:
            ordered.append("schedule_constraint")
        return _dedupe_slot_names(ordered)

    if goal == "issue_report":
        ordered = ["job_reference", "scope_summary", "material_or_scope_item", "urgency"]
        if urgency_high:
            ordered.extend(["schedule_constraint", "site_access"])
        elif material_known or trade in {"roofing", "exteriors", "plumbing"}:
            ordered.append("quantity_or_measurement")
        if insurance_signaled:
            ordered.append("insurance_context")
        return _dedupe_slot_names(ordered)

    if goal == "follow_up":
        ordered = ["job_reference", "scope_summary", "follow_up_target", "customer_decision"]
        if insurance_signaled:
            ordered.append("insurance_context")
        ordered.append("timeline")
        return _dedupe_slot_names(ordered)

    if goal == "job_update":
        ordered = ["job_reference", "scope_summary"]
        if schedule_signaled or urgency_high:
            ordered.extend(["schedule_constraint", "site_access"])
        return _dedupe_slot_names(ordered)

    return ["scope_summary", "job_reference"]


def _slot_prompt_and_reason(
    slot_name: str,
    *,
    goal: VoiceConversationGoal,
    extracted: dict[str, str],
) -> tuple[str, str]:
    trade = extracted.get("trade", "").strip().lower()
    urgency_high = extracted.get("urgency", "").strip().lower() == "high"
    insurance_context = extracted.get("insurance_context", "").strip()

    if slot_name == "job_reference":
        return (
            "The call still needs a job, site, or customer reference.",
            "Which job are you calling about?",
        )

    if slot_name == "scope_summary":
        if goal == "follow_up":
            return (
                "The follow-up topic is still unclear.",
                "What are we following up on, and what is still outstanding?",
            )
        if goal == "job_update":
            return (
                "The office still needs a clear summary of what changed on site.",
                "What changed on site that the office needs to track?",
            )
        return (
            "The requested change or work is still unclear.",
            "Tell me what changed on site or what you need priced.",
        )

    if slot_name == "timeline":
        return (
            "Timing is still unclear.",
            "When do you need this handled or followed up on?",
        )

    if slot_name == "urgency":
        return (
            "The level of urgency is still unclear.",
            "Does this need attention today, or can it wait?",
        )

    if slot_name == "follow_up_target":
        return (
            "The follow-up target is still unclear.",
            "Who are we waiting on here - owner, customer, sub, or carrier?",
        )

    if slot_name == "material_or_scope_item":
        if trade == "roofing":
            return (
                "The roof scope item that changed is still unclear.",
                "What part of the roof changed - flashing, shingle, ridge, decking, or something else?",
            )
        if trade == "electrical":
            return (
                "The electrical scope item that changed is still unclear.",
                "Which electrical item changed - fixture, switch, panel, or circuit?",
            )
        if trade == "plumbing":
            return (
                "The plumbing scope item that changed is still unclear.",
                "What plumbing item changed - drain, valve, fixture, or supply line?",
            )
        return (
            "The scope item or material that changed is still unclear.",
            "What material or scope item changed?",
        )

    if slot_name == "quantity_or_measurement":
        if trade == "roofing":
            return (
                "The call does not include a usable roofing quantity yet.",
                "How many squares, feet, or pieces changed on the roof?",
            )
        if trade == "electrical":
            return (
                "The call does not include a usable electrical quantity yet.",
                "How many fixtures, runs, or devices are involved?",
            )
        if trade == "plumbing":
            return (
                "The call does not include a usable plumbing quantity yet.",
                "How many fixtures, feet, or plumbing items changed?",
            )
        return (
            "The call does not include any usable quantity or measurement yet.",
            "Do you have a square count, quantity, or rough measurement I should attach?",
        )

    if slot_name == "site_access":
        if urgency_high:
            return (
                "We still do not know whether the crew is blocked or can keep moving.",
                "Is the crew blocked right now, or can they keep moving while the office handles this?",
            )
        return (
            "Any site access or crew constraint is still missing.",
            "Any access, tenant, or crew constraint I need to note with this?",
        )

    if slot_name == "customer_decision":
        if insurance_context:
            return (
                "The approval path is still unclear.",
                "Are we waiting on owner approval, carrier approval, or is this already approved?",
            )
        if goal == "follow_up":
            return (
                "The decision blocking follow-through is still unclear.",
                "What decision or response are they holding on?",
            )
        return (
            "The customer or owner decision point is still unclear.",
            "What decision is the customer or owner still making on this?",
        )

    if slot_name == "schedule_constraint":
        if urgency_high and goal == "issue_report":
            return (
                "The field impact timing is still unclear.",
                "Is the crew blocked right now, or is there a deadline like inspection or before they leave today?",
            )
        return (
            "The schedule constraint is still unclear.",
            "Is there a schedule or inspection deadline tied to this?",
        )

    if slot_name == "insurance_context":
        return (
            "Insurance context is still unclear.",
            "Is insurance, supplement, or carrier approval part of this request?",
        )

    return (
        "The call is still missing a required detail.",
        "Give me the next missing detail so I can route this correctly.",
    )


def _required_slots(
    goal: VoiceConversationGoal,
    extracted: dict[str, str],
    combined_text: str,
) -> list[VoiceMissingSlot]:
    missing: list[VoiceMissingSlot] = []
    for slot_name in _required_slot_order(goal, extracted, combined_text):
        if extracted.get(slot_name, "").strip():
            continue
        reason, prompt = _slot_prompt_and_reason(slot_name, goal=goal, extracted=extracted)
        missing.append(VoiceMissingSlot(name=slot_name, reason=reason, prompt=prompt))
    return missing


def _build_summary(goal: VoiceConversationGoal, extracted: dict[str, str], turns: list[str]) -> str:
    job_reference = extracted.get("job_reference", "").strip() or "unidentified job"
    scope_summary = extracted.get("scope_summary", "").strip() or (turns[-1].strip() if turns else "")
    trade = extracted.get("trade", "").strip()
    prefix = f"{trade.title()} · " if trade else ""

    if goal == "quote_request":
        return f"{prefix}Quote request for {job_reference}: {scope_summary}".strip()
    if goal == "follow_up":
        target = extracted.get("follow_up_target", "").strip() or "customer"
        return f"{prefix}Follow-up request for {job_reference} with {target}: {scope_summary}".strip()
    if goal == "issue_report":
        return f"{prefix}Field issue at {job_reference}: {scope_summary}".strip()
    if goal == "job_update":
        return f"{prefix}Job update for {job_reference}: {scope_summary}".strip()
    return scope_summary.strip() or "Caller needs office review."


def plan_voice_session(session: VoiceSession) -> VoiceSessionPlan:
    """Build the next conversational step from the current call transcript."""
    caller_turns = _caller_turn_text(session)
    combined_text = _combined_caller_text(session)
    goal = _detect_goal(combined_text)

    extracted_fields = dict(session.extracted_fields)
    extracted_fields["callback_number"] = session.from_number.strip()
    detected_trade = _detect_trade(combined_text)
    if detected_trade:
        extracted_fields["trade"] = detected_trade

    caller_name = _extract_caller_name(session, caller_turns)
    if caller_name:
        extracted_fields["caller_name"] = caller_name

    job_reference = _extract_job_reference(caller_turns)
    if job_reference:
        extracted_fields["job_reference"] = job_reference

    scope_summary = _extract_scope_summary(caller_turns)
    if scope_summary:
        extracted_fields["scope_summary"] = scope_summary

    value_signal = _extract_value_signal(combined_text)
    if value_signal:
        extracted_fields["value_signal"] = value_signal

    timeline = _extract_timeline(combined_text)
    if timeline:
        extracted_fields["timeline"] = timeline

    urgency = _infer_urgency(combined_text)
    if urgency:
        extracted_fields["urgency"] = urgency

    follow_up_target = _extract_follow_up_target(combined_text)
    if follow_up_target:
        extracted_fields["follow_up_target"] = follow_up_target

    material_or_scope_item = _extract_material_or_scope_item(combined_text)
    if material_or_scope_item:
        extracted_fields["material_or_scope_item"] = material_or_scope_item

    quantity_or_measurement = _extract_quantity_or_measurement(combined_text)
    if quantity_or_measurement:
        extracted_fields["quantity_or_measurement"] = quantity_or_measurement

    site_access = _extract_site_access(combined_text)
    if site_access:
        extracted_fields["site_access"] = site_access

    customer_decision = _extract_customer_decision(combined_text)
    if customer_decision:
        extracted_fields["customer_decision"] = customer_decision

    schedule_constraint = _extract_schedule_constraint(combined_text)
    if schedule_constraint:
        extracted_fields["schedule_constraint"] = schedule_constraint

    insurance_context = _extract_insurance_context(combined_text)
    if insurance_context:
        extracted_fields["insurance_context"] = insurance_context

    missing_slots = _required_slots(goal, extracted_fields, combined_text)
    escalate_to_human = _should_escalate(combined_text, session.silence_count)
    ready_for_review = bool(caller_turns) and not missing_slots

    if not ready_for_review and len(caller_turns) >= 3 and extracted_fields.get("scope_summary", "").strip():
        soft_slots = {
            "job_reference",
            "timeline",
            "follow_up_target",
            "quantity_or_measurement",
            "site_access",
            "schedule_constraint",
            "insurance_context",
        }
        if all(slot.name in soft_slots for slot in missing_slots):
            ready_for_review = True
            missing_slots = []

    summary = _build_summary(goal, extracted_fields, caller_turns)

    if escalate_to_human:
        status: VoiceSessionStatus = "escalated"
        next_prompt = "I'm routing this to the office now and keeping the context attached."
    elif ready_for_review:
        status = "ready_for_review"
        next_prompt = "I've got enough to route this for review and draft the next step."
    elif missing_slots:
        status = "awaiting_caller"
        unasked_slot = next((slot for slot in missing_slots if slot.name not in session.asked_slots), None)
        next_prompt = (unasked_slot or missing_slots[0]).prompt
    else:
        status = "awaiting_caller"
        next_prompt = "Tell me what changed on site or what needs to happen next."

    return VoiceSessionPlan(
        goal=goal,
        status=status,
        summary=summary,
        extracted_fields=extracted_fields,
        missing_slots=missing_slots,
        next_prompt=next_prompt,
        ready_for_review=ready_for_review,
        escalate_to_human=escalate_to_human,
        handoff_intent="transcript",
        detected_trade=detected_trade,
    )


__all__ = [
    "apply_voice_plan",
    "append_voice_turn",
    "build_voice_transcript",
    "clear_voice_sessions",
    "get_voice_session",
    "increment_voice_silence",
    "mark_voice_handoff",
    "plan_voice_session",
    "prune_voice_sessions",
    "remember_voice_session",
    "update_voice_session",
    "upsert_voice_session",
]

