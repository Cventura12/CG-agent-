# Fieldr Voice Production Readiness Tickets

Last updated: 2026-03-18

This backlog is the focused engineering path to move Fieldr voice from useful capture infrastructure to a truly production-ready capability.

## P0-1: End-To-End Voice Smoke Validation

Status: `Not Started`

Goal:
Prove the current voice intake path works end to end in a real deployed environment.

Primary files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/ingest.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)
- [twilio_setup.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/twilio_setup.md)

Acceptance criteria:

- a real call or voice note creates a transcript or transcribed voice input
- the payload is normalized and persisted
- the transcript links to queue or review state
- operational actions surface without manual DB intervention
- smoke results are documented

## P0-2: Voice Failure Visibility

Status: `Not Started`

Goal:
Make failures visible instead of silently degrading into hidden operator confusion.

Primary files:

- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

Acceptance criteria:

- failed or partial transcript processing is visible in the operator UI
- manual-review-needed state is first-class and consistent
- the UI distinguishes missing transcript content from low-confidence extraction

## P0-3: Webhook Idempotency And Replay Safety

Status: `Not Started`

Goal:
Prevent duplicate Twilio delivery or transcript events from creating duplicate work.

Primary files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)

Tests to extend:

- [test_twilio_transcript_webhook.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_twilio_transcript_webhook.py)
- [test_twilio_status_callback.py](/c:/Users/caleb/OneDrive/Desktop/hello/tests/test_twilio_status_callback.py)

Acceptance criteria:

- duplicate webhook delivery does not create duplicate transcript rows or duplicate queue work
- replayed provider events are ignored safely
- idempotent keys are documented and enforced

## P1-1: Transcript Quality Scoring

Status: `Not Started`

Goal:
Introduce explicit quality/confidence rules so low-quality audio gets stricter review treatment.

Primary files:

- [parse_call_transcript.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/parse_call_transcript.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)

Acceptance criteria:

- transcripts can be flagged low-confidence
- low-confidence transcripts surface a stricter review state
- downstream quote/update actions respect that state

## P1-2: Operator Audit Trail For Voice Actions

Status: `Not Started`

Goal:
Make it obvious what Fieldr heard, what it extracted, and what it turned into work.

Primary files:

- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

Acceptance criteria:

- transcript origin is preserved in job and queue views
- operators can see the raw excerpt, extracted actions, and resulting draft linkage
- audit history reflects voice-derived actions clearly

## P1-3: Twilio Production Hardening

Status: `Blocked Outside Code`

Goal:
Finish the account/compliance and delivery hardening needed for live production traffic.

Primary files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [twilio_setup.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/twilio_setup.md)

Acceptance criteria:

- Twilio production account is configured
- number routing is stable
- callback URLs are verified in production
- production voice and transcript events are exercised against real traffic

## P2-1: Live Call Control Model

Status: `Not Started`

Goal:
Define and implement a real live-call state model if Fieldr is going to become a true voice agent.

Primary files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)
- future live-call orchestration module(s)

Acceptance criteria:

- live calls have explicit states
- failure, escalation, and completion behavior are defined
- operator-facing call status becomes visible in product

## P2-2: Human Escalation And Transfer

Status: `Not Started`

Goal:
Add a real fallback path from live voice handling into office or human review.

Acceptance criteria:

- low-confidence or blocked live interactions can escalate
- context is preserved during handoff
- escalation rules are configurable and testable

## P2-3: Real-Time Voice Agent Loop

Status: `Future`

Goal:
Build the actual live conversational agent layer, not just async capture.

Acceptance criteria:

- real-time audio turn-taking exists
- interruption and barge-in are handled
- the system can collect missing estimating information during live interaction
- conversation state is auditable and recoverable

## Recommended Execution Order

1. `P0-1` End-To-End Voice Smoke Validation
2. `P0-2` Voice Failure Visibility
3. `P0-3` Webhook Idempotency And Replay Safety
4. `P1-1` Transcript Quality Scoring
5. `P1-2` Operator Audit Trail For Voice Actions
6. `P1-3` Twilio Production Hardening
7. `P2-1` Live Call Control Model
8. `P2-2` Human Escalation And Transfer
9. `P2-3` Real-Time Voice Agent Loop
