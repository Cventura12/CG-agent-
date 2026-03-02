# Prompt Iteration From Real Usage

Day 27 is about tuning from edited approvals, not from guesses.

## Pull The Edits

Run:

[prompt_tuning_review.sql](c:/Users/caleb/OneDrive/Desktop/hello/supabase/queries/prompt_tuning_review.sql)

Or use:

`python -m gc_agent.cli review-edits --contractor-id <gc_id> --limit 20`

Read the `original_content` next to the final `content`.

Do not summarize before reading the actual edits.

## Find Patterns

Look for repeated changes:

- contractors rewrite the same sentence shape
- contractors change the same line item names
- contractors keep changing the price or markup

Repeated edits are prompt signals, not random noise.

## Prompt Tuning Signals

`update_memory` now writes deterministic `prompt_tuning_signals` into memory metadata for approved-with-edit quotes.

Current signals include:

- `scope_language_rewrite`
- `price_adjustment`
- `line_item_rewrite`

Likely prompt targets:

- `generate_quote`
- `calculate_materials`

## Tuning Rule

Make one change per prompt per iteration.

Do not change multiple prompts at once unless the same edit pattern clearly hits both layers.

## Current Iteration

This iteration makes one targeted change:

- `GENERATE_QUOTE_SYSTEM`
  - now explicitly asks for direct, field-ready contractor wording
  - avoids padded marketing phrasing and filler intros

That change is designed to reduce avoidable scope-language rewrites.

## Regression Step

After each prompt change:

1. Re-run the batch test
2. Compare the score to the prior baseline
3. Confirm you improved the target pattern without lowering the overall batch quality

If the batch score drops, revert the prompt change and tighten the next iteration.
