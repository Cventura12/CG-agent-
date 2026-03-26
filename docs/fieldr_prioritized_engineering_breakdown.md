# Arbor Prioritized Engineering Breakdown

Last updated: 2026-03-21

## Goal

Move Arbor from a strong agent-shaped product into a dependable pilot operating system for contractors.

The correct sequence is:

1. tighten the main field-to-office loop
2. harden voice and operator trust
3. deepen job intelligence and proof of value

## P0: Make The Core Workflow Airtight

This is the highest-value work in the product.

### Ticket 1: Normalize one end-to-end operational state model

Problem:

- queue, quote, follow-up, and job history do not yet feel fully locked to one shared lifecycle

Goal:

- every surfaced item has an explicit state from capture through logged outcome

Files:

- [appStore.ts](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/store/appStore.ts)
- [index.ts](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/types/index.ts)
- [queue.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/queue.py)
- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)

Definition of done:

- captured work has explicit states
- approved work transitions cleanly
- completed actions are visible in job history
- no ambiguous "half-done" items

### Ticket 2: Tighten field update -> queue item -> draft output loop

Problem:

- the flagship flow exists, but it still needs stronger live coherence

Goal:

- when an update comes in, it reliably becomes reviewable work and a next action

Files:

- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/ingest.py)
- [parse_update.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/parse_update.py)
- [draft_actions.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/draft_actions.py)
- [generate_quote.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/generate_quote.py)
- [QueueView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/queue/QueueView.tsx)
- [QuotesView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/quotes/QuotesView.tsx)

Definition of done:

- a new field update reliably appears in queue
- the extracted action is understandable
- the draft output is attached to the right job
- approval changes downstream state immediately

### Ticket 3: Add visible failure and manual-review states

Problem:

- uncertainty and failed routing are still not explicit enough in the operator UI

Goal:

- every parse failure, send failure, or low-confidence result becomes visible and actionable

Files:

- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/transcripts.py)
- [queue.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/queue.py)
- [QueueItemDetail.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/queue/QueueItemDetail.tsx)
- [TodayView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/today/TodayView.tsx)

Definition of done:

- low-confidence states are explicit
- failed actions do not disappear silently
- operators know what needs manual cleanup

## P1: Make Voice Dependable Enough To Matter

### Ticket 4: Improve voice outcome quality by call intent

Problem:

- questioning is better now, but still not specialized enough by real contractor intent

Goal:

- voice sessions ask the most relevant next question based on quote request, issue report, follow-up, or change request

Files:

- [voice_runtime.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/voice_runtime.py)
- [voice_streaming.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/voice_streaming.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)

Definition of done:

- quote calls produce better scope detail
- issue calls surface urgency and blockers
- follow-up calls identify missing decisions clearly

### Ticket 5: Strengthen low-confidence and fallback handling for live calls

Problem:

- voice is promising, but still needs more trustworthy degradation behavior

Goal:

- every low-confidence or interrupted call degrades safely to saved reviewable work

Files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [voice_runtime.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/voice_runtime.py)
- [voice.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/voice.py)
- [voice.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/api/voice.py)

Definition of done:

- no call ends in ambiguous state
- transfer failures are visible
- saved-for-review fallback always exists

### Ticket 6: Make operator review of live calls simpler and faster

Problem:

- voice session review is improving, but still too debug-forward and not outcome-forward

Goal:

- operators should immediately understand what the caller wanted, what Arbor extracted, and what happens next

Files:

- [VoiceSessionList.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/voice/VoiceSessionList.tsx)
- [TodayView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/today/TodayView.tsx)
- [JobDetail.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/jobs/JobDetail.tsx)
- [useVoiceSessions.ts](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/hooks/useVoiceSessions.ts)
- [voice.ts](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/api/voice.ts)

Definition of done:

- call review cards are understandable without replaying the audio
- next action is obvious
- debug info supports operators instead of dominating the UI

## P2: Make Jobs The Operating Truth Center

### Ticket 7: Add unresolved risk and blocking-state summaries to jobs

Problem:

- Jobs is useful, but it still under-communicates what is drifting or blocked

Goal:

- a job should show open risk, unresolved approvals, and next blocking work

Files:

- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [JobDetail.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/jobs/JobDetail.tsx)
- [JobsView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/jobs/JobsView.tsx)

Definition of done:

- jobs surface unresolved risk
- office can see what needs action without reading the full timeline

### Ticket 8: Add explicit ROI surfaces inside the product

Problem:

- value is still too implied

Goal:

- show money and time protected by the system

Files:

- [analytics.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/analytics.py)
- [insights.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/insights.py)
- [AnalyticsView.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/analytics/AnalyticsView.tsx)
- [MetricCard.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/components/analytics/MetricCard.tsx)

Definition of done:

- show missed changes surfaced
- show quote deltas prepared
- show follow-ups prevented from slipping

## P3: Production Hardening

### Ticket 9: Expand idempotency, observability, and audit coverage

Problem:

- production trust requires stronger failure tracing and duplicate-event safety

Goal:

- all critical ingest and runtime paths are observable and replay-safe

Files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [telemetry.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/telemetry.py)
- [019_call_transcript_idempotency.sql](/c:/Users/caleb/OneDrive/Desktop/hello/supabase/migrations/019_call_transcript_idempotency.sql)
- [021_voice_call_sessions.sql](/c:/Users/caleb/OneDrive/Desktop/hello/supabase/migrations/021_voice_call_sessions.sql)

Definition of done:

- duplicate provider events do not create duplicate work
- critical failures are visible
- operator-visible audit trail is reliable

## Recommended Order

1. Ticket 1
2. Ticket 2
3. Ticket 3
4. Ticket 4
5. Ticket 5
6. Ticket 6
7. Ticket 7
8. Ticket 8
9. Ticket 9

## One-Line Rule

Until P0 and most of P1 are complete, Arbor should be optimized for:

> trustworthy human-reviewed operational capture

not:

> broad autonomous contractor automation

