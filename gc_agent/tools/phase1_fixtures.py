"""Shared Phase 1 fixtures for local estimating-loop testing."""

from __future__ import annotations

PHASE1_PRICE_LIST: dict[str, float] = {
    "tear_off_per_square": 65.0,
    "laminated_shingles_per_square": 145.0,
    "synthetic_underlayment_per_square": 18.0,
    "ice_water_per_square": 42.0,
    "ridge_cap_per_square": 28.0,
    "starter_strip_per_square": 16.0,
}

PHASE1_SCOPE_LANGUAGE_EXAMPLES: list[str] = [
    "Remove the existing damaged roofing system down to the deck in affected areas and install replacement laminated shingles to match the structure profile.",
    "Replace compromised accessories including starter, ridge cap, and underlayment where required to restore a watertight roofing assembly.",
    "Perform all work using standard roofing safety practices and complete debris haul-off at the end of the project.",
]

PHASE1_CONTRACTOR_INFO: dict[str, object] = {
    "company_name": "Cventura Roofing & Exteriors",
    "estimator_name": "Caleb Ventura",
    "license": "TX Roofing Contractor",
    "phone": "(512) 555-0199",
    "email": "estimates@cventura-roofing.com",
}


def build_phase1_memory_context() -> dict[str, object]:
    """Return the default memory context used for local Phase 1 testing."""
    return {
        "pricing_context": dict(PHASE1_PRICE_LIST),
        "scope_language_examples": list(PHASE1_SCOPE_LANGUAGE_EXAMPLES),
    }


__all__ = [
    "PHASE1_PRICE_LIST",
    "PHASE1_SCOPE_LANGUAGE_EXAMPLES",
    "PHASE1_CONTRACTOR_INFO",
    "build_phase1_memory_context",
]
