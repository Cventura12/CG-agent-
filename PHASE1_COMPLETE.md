# Phase 1 Complete

Phase 1 focused on validating the extraction and quote loop with messy roofing inputs before adding persistence or UI.

## Metrics

- Average manual score: 4.0 / 5.0 across 10 sampled outputs
- Parse rate: 100.0% (30 / 30 inputs produced valid `job_scope` objects)
- Hallucination check: 0 issues found in a 10-output manual scan

## Example Outputs

### Example 1

- Source: `tests/batch_outputs/01-uh-yeah-this-is-caleb-over-on-92-elm-str.txt`
- Result summary:
  - Address extracted: `92 Elm Street`
  - Customer extracted: `Mrs Dalton`
  - Job type inferred: `hail damage roof replacement`
  - Quote included 2-square replacement scope, 6/12 pitch note, and itemized pricing

### Example 2

- Source: `tests/batch_outputs/03-hey-got-a-steep-one-on-cedar-run-for-the.txt`
- Result summary:
  - Address extracted: `Cedar Run`
  - Customer extracted: `Johnsons`
  - Job type inferred: `roof repair`
  - Quote used repair-specific line items instead of full replacement language

### Example 3

- Source: `tests/batch_outputs/04-can-you-quote-the-church-office-roof-beh.txt`
- Result summary:
  - Address extracted: `77 Pine Road`
  - Customer extracted: `Church Office`
  - Job type inferred: `modified bitumen replacement`
  - Quote used low-slope membrane line items and matching scope language

## What Changed During Tuning

- Added deterministic fallback extraction so Phase 1 still works when `ANTHROPIC_API_KEY` is not set
- Improved address, customer, square-count, pitch, and layer heuristics from messy voice-style input
- Reduced unnecessary clarification by only asking for fields that are truly missing
- Tuned fallback material line items by roof type (`repair`, `low_slope`, `metal`, `tile`, `shingle`)
- Tuned quote scope wording so low-slope and repair jobs no longer use generic shingle language
- Cleaned batch artifacts so scoring outputs contain only the quote, not internal debug errors

## Prompt Learning

The main lesson is that quote quality improves materially when the generated scope sentence is anchored to the inferred roof type, address, and measured size instead of generic fallback phrasing.
