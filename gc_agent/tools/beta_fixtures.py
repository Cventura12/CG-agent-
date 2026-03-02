"""Day 22 beta onboarding fixtures for contractor rollout."""

from __future__ import annotations

CHATTANOOGA_PRICE_LIST: dict[str, float] = {
    "tear_off_per_square": 72.0,
    "laminated_shingles_per_square": 158.0,
    "synthetic_underlayment_per_square": 21.0,
    "ice_water_per_square": 48.0,
    "ridge_cap_per_square": 31.0,
    "starter_strip_per_square": 18.0,
}

BETA_CONTRACTOR_ACCOUNTS: list[dict[str, object]] = [
    {
        "contractor_id": "00000000-0000-0000-0000-000000000101",
        "phone_number": "+14235550101",
        "company_name": "Scenic City Roofing",
        "contact_name": "Micah Lawson",
        "trade": "roofing",
        "api_key_name": "beta_gc_1",
    },
    {
        "contractor_id": "00000000-0000-0000-0000-000000000102",
        "phone_number": "+14235550102",
        "company_name": "Ridgeline Exteriors",
        "contact_name": "Jordan Hale",
        "trade": "roofing",
        "api_key_name": "beta_gc_2",
    },
    {
        "contractor_id": "00000000-0000-0000-0000-000000000103",
        "phone_number": "+14235550103",
        "company_name": "Signal Mountain Painting",
        "contact_name": "Avery Brooks",
        "trade": "painting",
        "api_key_name": "beta_gc_3",
    },
]


def beta_api_key_env_template() -> str:
    """Return the .env template value for the three beta contractor API keys."""
    segments = []
    for contractor in BETA_CONTRACTOR_ACCOUNTS:
        contractor_id = str(contractor["contractor_id"])
        key_name = str(contractor["api_key_name"])
        segments.append(f"{contractor_id}=replace-with-{key_name}-key")
    return ",".join(segment.replace("=", ":") for segment in segments)


__all__ = [
    "CHATTANOOGA_PRICE_LIST",
    "BETA_CONTRACTOR_ACCOUNTS",
    "beta_api_key_env_template",
]
