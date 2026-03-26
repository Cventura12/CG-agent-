# Arbor Agent Current State / Next Priorities

Last updated: 2026-03-14

This memo is the practical status view of Arbor Agent.

It is meant to answer four questions:

1. What is fully done?
2. What is not done yet?
3. What is production-ready versus not production-ready?
4. What should we build next?

This should be read alongside:

- [founder_positioning_memo.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/founder_positioning_memo.md)
- [beta-smoke-checklist.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/beta-smoke-checklist.md)

## Product Definition

Arbor Agent is not a generic AI agent for contractors.

Arbor Agent is execution-side software that helps a general contractor keep control of messy project communication and financial follow-through once work is underway.

The core pattern is:

- capture what happened
- detect what changed
- surface what is unresolved
- turn communication into tracked action
- protect follow-through and money

## Current State Summary

Arbor Agent is now a real product in the following sense:

- it can ingest messy inputs such as notes, uploads, and transcripts
- it can turn those inputs into quote drafts, queue work, and job history
- it can support review, send, and follow-through
- it has a more coherent product story and UI than it did before

Arbor Agent is not yet a fully complete execution-control system.

The quote, transcript, queue, and follow-through loop is real.
The broader unresolved-item and financially exposed-change loop is only partially built.

## Fully Done

### Positioning and product story

- `/product` has been rewritten around execution-side communication control
- the main in-app copy now aligns with that positioning
- the product is no longer framed primarily as a generic AI contractor agent

### Core UI direction

- the main app shell has been redesigned into the light dashboard UI
- `Briefing`, `Queue`, `Jobs`, `Job Detail`, `Quote`, `Analytics`, and `Onboarding` have been moved into the current visual system
- shared wording for review, follow-through, and operational status has been tightened

### Quote workflow

- create quote drafts
- edit quote drafts
- approve quote drafts
- discard quote drafts
- export PDF
- export XLSX
- send flow wiring
- follow-through visibility in the UI
- send gating for review-required / low-confidence drafts

### Transcript workflow

- durable transcript persistence
- manual/API transcript ingest
- normalized transcript input path
- transcript queue integration
- transcript history in job detail
- transcript-to-quote prefill
- provider-normalization groundwork for webhook-based transcript ingest

### Spreadsheet workflow

- CSV/XLSX price book import preview
- column auto-mapping
- import commit
- import summary
- XLSX quote export

### Hardening and tests

- transcript hardening around null handling, retries, and queue fallbacks
- meaningful backend test coverage around transcript, pricing, quote, and webhook-adjacent behavior
- meaningful frontend test coverage around quote, job detail, queue, onboarding, and landing page flows

## Not Done Yet

### Execution-side unresolved-item system

This is the biggest strategic gap.

We do not yet have a complete system for:

- unresolved owner requests
- unresolved field changes
- commitments that were made but not formalized
- financially exposed work that changed before paperwork caught up

### Change and commitment tracking

We only partially support:

- who said what and when
- what changed in scope
- what still needs approval
- what should become a change order or formal follow-up item

### Communication coverage

We do not yet have one fully unified communication-control layer across:

- phone calls
- texts
- emails
- meeting notes
- superintendent updates
- subcontractor commitments

### Telephony maturity

Twilio/provider groundwork exists, but full production telephony is not done.

That includes:

- production SMS delivery readiness
- end-to-end transcript webhook production verification
- stronger provider identity resolution
- broader communication-channel coverage

### Broader execution-control wedge

The product has not yet fully expanded from:

- quote and follow-through control

into:

- unresolved operational and financial control across the whole job

## Production-Ready

These areas are in reasonable shape for internal use or beta validation:

- the modernized frontend UI
- quote draft creation, review, and export
- transcript persistence and transcript-driven review flow
- transcript-to-quote prefill
- pricing import/export basics
- queue and job detail operational surfaces
- public product positioning and app copy alignment

## Not Production-Ready

### Messaging delivery in production

Twilio is not fully production-ready today because:

- the app-side wiring is in place
- but live carrier/compliance readiness is blocked by Twilio account state and A2P registration

### End-to-end deployed infrastructure validation

Still needs full smoke testing in the deployed environment:

- Clerk internal auth
- public quote API path
- SMTP
- scheduler
- webhook URLs
- callback flow
- CORS and route behavior

### Transcript/action reliability under real-world noise

Transcript matching and actionability are improved, but not yet strong enough to call fully production-grade across messy live data.

### Full execution-control scope

The current product is production-leaning for the quote/transcript/follow-through core.
It is not yet production-complete for the larger execution-control vision.

## Main Risks Right Now

1. Product risk: the execution-control story is sharper than the current feature depth in unresolved-item tracking.
2. Operational risk: Twilio production messaging still depends on account/compliance work outside the codebase.
3. Reliability risk: deployed infra still needs full end-to-end smoke validation.
4. Scope risk: it is still easy to drift back toward generic AI or preconstruction framing if roadmap discipline slips.

## Exact Next Build Priorities

These are ordered.

### 1. Finish production wiring and deployed smoke validation

Before widening scope further, verify the existing product loop on real infrastructure:

- Supabase migrations are fully applied
- SMTP is configured and verified
- scheduler is running
- Clerk/internal routes behave correctly
- public quote API works as expected
- callback and webhook URLs are correct
- deployed smoke checklist passes

This is the highest priority because the current quote/transcript/follow-through loop already exists and needs operational trust.

### 2. Finish Twilio operational readiness

The app side is mostly there.
The remaining work is operational:

- upgrade Twilio account
- register A2P 10DLC
- verify real SMS delivery
- verify status callbacks
- verify transcript webhook flow end to end

Without this, the communication-to-action story remains partially blocked in production.

### 3. Strengthen transcript-to-action reliability

This is the next most important product-quality investment:

- improve transcript-to-job and transcript-to-quote matching
- make unlinked transcripts consistently actionable
- tighten transcript inbox behaviors
- reduce persisted-but-not-usable transcript cases

This keeps the product anchored in messy communication becoming tracked work.

### 4. Build the unresolved-item / financially exposed change loop

This is the most important net-new product wedge.

Focus on:

- unresolved owner requests
- field changes needing office action
- pending approvals
- scope changes that should become documentation, quote revision, or change work

This is where Arbor Agent becomes more than a quote workflow.

### 5. Make Job Detail the operational record

Push `Job Detail` further toward:

- what happened
- what changed
- what action followed
- what is still unresolved

This should become the clearest source of truth for the office.

### 6. Tighten quote trust further

Continue improving:

- missing-information visibility
- confidence evidence
- review-required behavior
- transcript-to-quote usability
- safe-to-send clarity

Quotes still matter because they are a financially important action, even if they are no longer the whole product identity.

### 7. Keep analytics secondary and action-driving

Only expand analytics that help run operations:

- quote turnaround
- follow-through effectiveness
- queue backlog
- transcript linkage rate
- unresolved operational pressure

Avoid decorative reporting and generic AI-insight drift.

## What We Should Not Do Next

These should remain deprioritized for now:

- generic AI-agent messaging
- broad preconstruction document-review expansion
- live voice-agent ambition before transcript/action loops are fully trusted
- decorative insights that do not drive operational decisions
- broad platform sprawl into unrelated back-office systems

## Decision Rule

For near-term roadmap decisions, prefer work that improves one or more of these:

1. capture of messy communication
2. tracking of unresolved operational work
3. financially important follow-through
4. office/field coordination
5. traceability from communication to action

If a proposed feature does not improve one of those, it is probably not a current priority.

## One-Line Summary

Arbor Agent is now a real quote/transcript/follow-through product with a coherent execution-side identity.

The next step is not more abstraction.
The next step is operational reliability plus unresolved-item tracking.


