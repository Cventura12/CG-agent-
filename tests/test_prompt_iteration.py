from __future__ import annotations

import pytest

from gc_agent.nodes.update_memory import build_prompt_tuning_signals


def test_prompt_tuning_signals_detect_scope_rewrite() -> None:
    signals = build_prompt_tuning_signals(
        {"scope_of_work": "Replace roof at 101 Main St with laminated shingles."},
        {"scope_of_work": "Remove existing shingles and install laminated shingles at 101 Main St."},
    )

    assert signals["scope_language_changed"] is True
    assert "scope_language_rewrite" in signals["change_patterns"]
    assert "generate_quote" in signals["likely_prompt_targets"]


def test_prompt_tuning_signals_detect_price_and_line_item_changes() -> None:
    signals = build_prompt_tuning_signals(
        {
            "scope_of_work": "Interior repaint.",
            "total_price": 4200,
            "line_items": [{"item": "Paint labor"}],
        },
        {
            "scope_of_work": "Interior repaint.",
            "total_price": 4700,
            "line_items": [{"item": "Paint labor and wall prep"}],
        },
    )

    assert signals["price_changed"] is True
    assert signals["line_items_changed"] is True
    assert "price_adjustment" in signals["change_patterns"]
    assert "line_item_rewrite" in signals["change_patterns"]
    assert "calculate_materials" in signals["likely_prompt_targets"]


def test_prompt_tuning_signals_fall_back_to_minor_edit() -> None:
    signals = build_prompt_tuning_signals(
        {"scope_of_work": "Short update."},
        {"scope_of_work": "Short update."},
    )

    assert signals["change_patterns"] == ["minor_non_structural_edit"]
    assert signals["likely_prompt_targets"] == []
    
