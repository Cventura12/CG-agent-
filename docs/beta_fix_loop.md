# Beta Fix Loop

This is the Day 25 operating document for turning beta feedback into fixes.

## Triage Buckets

Every note from [BETA_LOG.md](c:/Users/caleb/OneDrive/Desktop/hello/BETA_LOG.md) goes into one of these buckets:

- `broken`
  - blocks the contractor from finishing `voice -> quote -> PDF -> send`
  - fix first
- `confusing`
  - the flow technically works, but the contractor hesitates, misreads, or taps the wrong thing
  - fix this week
- `missing`
  - feature request or larger workflow gap
  - log for v2, do not let it displace broken fixes

## Day 25 Rule

Fix broken things before anything else.

A missing feature is not more important than a bug that stops a quote from being sent.

## Current Status

At the moment, the repo has the triage structure but no real beta-session issues logged yet.

That means:

- no honest top-3 bug list exists yet from field usage
- do not fabricate beta feedback
- once real notes are added to `BETA_LOG.md`, promote the top 3 blockers into the `broken` section below

## Broken (Fix Now)

- Pending real beta feedback

## Confusing (Fix This Week)

- Pending real beta feedback

## Missing (Log For V2)

- Pending real beta feedback

## Commit Format

Use one fix per commit:

`git commit -m "fix: <specific issue from beta feedback>"`

Examples:

- `fix: queue edit keeps draft visible for final approval`
- `fix: quote pdf opens share sheet on mobile safari`
- `fix: voice transcript no longer clears before submit`

## Contractor Update Message

Use this exact message after shipping a beta fix:

`Fixed [issue]. If you see anything else wrong, text me directly.`

Send it to each active beta contractor after the fix is deployed.
