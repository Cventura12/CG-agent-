# Arbor Agent Top Priority Tickets

Last updated: 2026-03-14

This is the execution backlog that follows from:

- [current_state_next_priorities.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/current_state_next_priorities.md)
- [founder_positioning_memo.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/founder_positioning_memo.md)
- [beta-smoke-checklist.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/beta-smoke-checklist.md)

Each ticket is scoped to real files in this repo.

## P0-1: Production Wiring And Smoke Validation

Status: `Not Started`

Goal:
Make the existing quote/transcript/follow-through loop trustworthy in a deployed environment before expanding scope.

Primary files:

- [deployment.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/deployment.md)
- [beta-smoke-checklist.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/beta-smoke-checklist.md)
- [main.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/main.py)
- [router.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/api/router.py)
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [email_delivery.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/email_delivery.py)

Acceptance criteria:

- deployed environment has the correct env vars
- `014` through `019` are confirmed applied in Supabase
- health checks pass
- quote create, approve, send, and follow-through work in deployed infra
- transcript ingest and queue rendering work in deployed infra
- smoke checklist is updated from assumptions into verified results

## P0-2: Twilio Production Readiness

Status: `Blocked Outside Code`

Goal:
Finish the app-side and operational work needed for real SMS delivery and transcript webhook validation.

Primary files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [main.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/main.py)
- [twilio_setup.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/twilio_setup.md)
- [test_twilio_status_callback.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_twilio_status_callback.py)
- [test_twilio_transcript_webhook.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_twilio_transcript_webhook.py)

Acceptance criteria:

- Twilio account is upgraded
- A2P 10DLC is registered for the U.S. sender
- quote send via SMS succeeds to a real handset
- delivery callbacks update status in the app
- transcript webhook hits `/webhook/twilio/transcript` end to end

Notes:

- code groundwork is largely in place
- the current blocker is Twilio account/compliance state

## P1-1: Transcript Matching And Actionability

Status: `Not Started`

Goal:
Improve transcript-to-job and transcript-to-quote matching so communication becomes tracked work more reliably.

Primary files:

- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/transcripts.py)
- [queue.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/queue.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

Tests to extend:

- [test_call_transcript_ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_call_transcript_ingest.py)
- [test_queue_router_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_queue_router_transcripts.py)
- [test_transcript_actions_router.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_transcript_actions_router.py)
- [queue-page-transcript.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/queue-page-transcript.test.tsx)
- [job-detail-transcripts.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/job-detail-transcripts.test.tsx)

Acceptance criteria:

- explicit and inferred transcript linkage paths are more reliable
- unlinked transcripts always land in an actionable inbox path
- transcript actions from queue and job detail behave consistently
- fewer transcripts persist without a usable next step

## P1-2: Unresolved Change / Financial Exposure Loop

Status: `Not Started`

Goal:
Extend Arbor Agent beyond quote drafts so it can surface unresolved owner requests, field changes, and financially exposed work.

Primary files:

- [parse_update.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/parse_update.py)
- [flag_risks.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/flag_risks.py)
- [draft_actions.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/draft_actions.py)
- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/ingest.py)
- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

Acceptance criteria:

- field updates can surface unresolved change-like items
- queue clearly distinguishes review work from financially exposed work
- job detail makes it clear what changed and what still needs action
- risky/unresolved communication is not treated as generic notes

## P1-3: Job Detail As The Operational Record

Status: `In Progress`

Goal:
Make job detail the best place for the office to understand what happened, what changed, and what still needs follow-through.

Primary files:

- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)
- [FollowupStatusCard.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/FollowupStatusCard.tsx)

Tests to extend:

- [test_jobs_audit_router.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_jobs_audit_router.py)
- [job-detail-followup.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/job-detail-followup.test.tsx)
- [job-detail-transcripts.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/job-detail-transcripts.test.tsx)

Acceptance criteria:

- one clear activity record for job events
- transcript, update, quote, and follow-through lineage stays understandable
- duplicate or noisy sections are reduced further
- a PM or office lead can quickly answer: what happened, what changed, what is unresolved

## P1-4: Quote Trust And Safe-To-Send Behavior

Status: `In Progress`

Goal:
Keep quote generation useful while making weak drafts impossible to confuse with send-ready work.

Primary files:

- [extract_job_scope.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/extract_job_scope.py)
- [calculate_materials.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/calculate_materials.py)
- [generate_quote.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/generate_quote.py)
- [router.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/api/router.py)
- [QuotePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QuotePage.tsx)

Tests to extend:

- [test_generate_quote.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_generate_quote.py)
- [test_quote_send_api.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_quote_send_api.py)
- [quote-page-transcript-prefill.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/quote-page-transcript-prefill.test.tsx)
- [quote-page-followup.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/quote-page-followup.test.tsx)

Acceptance criteria:

- missing information is highly visible
- evidence for the draft is visible and concrete
- send gating remains strict when review is required
- transcript-to-quote prefill remains useful but not overconfident

## P2-1: Pricing Import Impact Visibility

Status: `Partially Done`

Goal:
Make spreadsheet pricing feel operationally important instead of just a setup feature.

Primary files:

- [spreadsheet_import.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/spreadsheet_import.py)
- [spreadsheet_mapping.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/spreadsheet_mapping.py)
- [pricing.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/pricing.py)
- [OnboardingPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/OnboardingPage.tsx)
- [PricingImportPanel.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/PricingImportPanel.tsx)
- [QuotePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QuotePage.tsx)

Acceptance criteria:

- import preview handles more messy contractor sheets
- imported rows clearly affect quote context and copy
- the user can see that price-book data shaped a draft
- import history is ready to become visible later

## P2-2: Briefing And Analytics As Action Surfaces

Status: `In Progress`

Goal:
Keep briefing and analytics focused on operational control instead of decorative reporting.

Primary files:

- [generate_briefing.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/generate_briefing.py)
- [analytics.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/analytics.py)
- [insights.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/insights.py)
- [BriefingPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/BriefingPage.tsx)
- [AnalyticsPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/AnalyticsPage.tsx)

Acceptance criteria:

- briefing prioritizes unresolved and financially relevant work
- analytics stays focused on quote turnaround, queue backlog, follow-through effectiveness, and transcript linkage
- no new decorative AI framing is introduced

## P2-3: Jobs Surface Language And Navigation Cleanup

Status: `In Progress`

Goal:
Finish turning jobs and shared navigation surfaces into execution-side product language.

Primary files:

- [JobsPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobsPage.tsx)
- [JobSidebar.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/JobSidebar.tsx)
- [AppShell.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/AppShell.tsx)
- [PageHeader.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/PageHeader.tsx)

Tests to extend:

- [jobs-page-risk.test.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/tests/components/jobs-page-risk.test.tsx)

Acceptance criteria:

- remaining â€œagent/system memoryâ€ style phrasing is removed
- navigation and page headers sound consistent with the execution-control story
- jobs surfaces keep highlighting risk, reminders, and review work clearly

## Recommended Execution Order

1. `P0-1` Production Wiring And Smoke Validation
2. `P0-2` Twilio Production Readiness
3. `P1-1` Transcript Matching And Actionability
4. `P1-2` Unresolved Change / Financial Exposure Loop
5. `P1-3` Job Detail As The Operational Record
6. `P1-4` Quote Trust And Safe-To-Send Behavior
7. `P2-1` Pricing Import Impact Visibility
8. `P2-2` Briefing And Analytics As Action Surfaces
9. `P2-3` Jobs Surface Language And Navigation Cleanup

## Notes

- `P0-2` is partially blocked outside the codebase by Twilio account/compliance work.
- `P1-2` is the biggest net-new product wedge from the current strategy shift.
- `P1-3` and `P1-4` are already underway in the current app and should continue, not restart.


