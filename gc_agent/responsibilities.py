"""General contractor responsibility routing helpers for Arbor Agent."""

from __future__ import annotations

from gc_agent.state import ResponsibilityDefinition, ResponsibilityTag


_RESPONSIBILITIES: list[ResponsibilityDefinition] = [
    ResponsibilityDefinition(
        tag="project_management",
        label="Project management",
        description="Planning, scheduling, and supervising the full build so it stays on track.",
    ),
    ResponsibilityDefinition(
        tag="communication",
        label="Communication",
        description="Keeping clients, architects, subs, and suppliers aligned when changes hit.",
    ),
    ResponsibilityDefinition(
        tag="budgeting",
        label="Budget and cost control",
        description="Estimating, tracking spend, and protecting margin against scope drift.",
    ),
    ResponsibilityDefinition(
        tag="subcontractor_management",
        label="Subcontractor management",
        description="Hiring specialists and verifying quality and accountability on site.",
    ),
    ResponsibilityDefinition(
        tag="permits_and_compliance",
        label="Permits and compliance",
        description="Securing approvals and meeting local code and inspection requirements.",
    ),
    ResponsibilityDefinition(
        tag="safety_management",
        label="Safety management",
        description="Enforcing safety standards and reducing on-site risk.",
    ),
]


_KEYWORDS: dict[ResponsibilityTag, set[str]] = {
    "project_management": {
        "schedule",
        "timeline",
        "delay",
        "milestone",
        "coordination",
        "progress",
        "start date",
        "completion",
    },
    "communication": {
        "call",
        "text",
        "update",
        "client",
        "owner",
        "architect",
        "message",
        "notify",
        "meeting",
        "follow-up",
        "follow up",
    },
    "budgeting": {
        "quote",
        "estimate",
        "change order",
        "add",
        "cost",
        "price",
        "billing",
        "invoice",
        "budget",
        "markup",
        "$",
    },
    "subcontractor_management": {
        "sub",
        "subcontractor",
        "vendor",
        "trade",
        "electrician",
        "plumber",
        "hvac",
        "roofing",
        "drywall",
        "concrete",
    },
    "permits_and_compliance": {
        "permit",
        "inspection",
        "code",
        "compliance",
        "regulation",
    },
    "safety_management": {
        "safety",
        "hazard",
        "incident",
        "injury",
        "osha",
        "ppe",
        "unsafe",
    },
}

_DRAFT_TYPE_HINTS: dict[str, list[ResponsibilityTag]] = {
    "CO": ["budgeting"],
    "RFI": ["communication", "permits_and_compliance"],
    "sub-message": ["subcontractor_management", "communication"],
    "follow-up": ["communication"],
    "owner-update": ["communication"],
    "material-order": ["project_management", "budgeting"],
    "transcript-review": ["communication"],
}

_CLASSIFICATION_HINTS: dict[str, list[ResponsibilityTag]] = {
    "estimate_request": ["budgeting"],
    "quote_question": ["budgeting", "communication"],
    "job_update": ["project_management"],
    "reschedule": ["project_management", "communication"],
    "complaint_or_issue": ["communication", "safety_management"],
    "followup_response": ["communication"],
    "vendor_or_subcontractor": ["subcontractor_management"],
}


def responsibilities_catalog() -> list[ResponsibilityDefinition]:
    """Return the canonical GC responsibility list."""
    return list(_RESPONSIBILITIES)


def classify_responsibilities(
    *,
    text: str = "",
    draft_type: str = "",
    classification: str = "",
) -> list[ResponsibilityTag]:
    """Assign GC responsibility tags based on draft or transcript context."""
    normalized = (text or "").lower()
    tags: list[ResponsibilityTag] = []

    def _push(tag: ResponsibilityTag) -> None:
        if tag not in tags:
            tags.append(tag)

    for tag, keywords in _KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            _push(tag)

    for tag in _DRAFT_TYPE_HINTS.get(draft_type.strip(), []):
        _push(tag)

    for tag in _CLASSIFICATION_HINTS.get(classification.strip(), []):
        _push(tag)

    if not tags:
        _push("communication")

    return tags


__all__ = ["classify_responsibilities", "responsibilities_catalog"]
