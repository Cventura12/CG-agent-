# Queue Approval Metrics

Day 26 adds approval tracking directly to `draft_queue`.

Tracked outcomes:

- `approved_without_edit`
- `approved_with_edit`
- `discarded`

How it works:

- editing a draft sets `was_edited = true`
- approving a draft writes:
  - `approved_without_edit` if it was never edited
  - `approved_with_edit` if it was edited first
- discarding a draft writes:
  - `discarded`

Run the manual SQL in:

[queue_approval_rate.sql](c:/Users/caleb/OneDrive/Desktop/hello/supabase/queries/queue_approval_rate.sql)

Interpretation:

- Target approval-without-edit rate: `70%+`
- If the rate is below `50%`, review the `approved_with_edit` rows first.

What to look for in edited approvals:

- scope wording keeps getting rewritten
- pricing line items keep changing
- formatting is acceptable but tone is wrong

Each repeated pattern should map back to a specific prompt or node to tune, not a vague “the AI needs work” conclusion.
