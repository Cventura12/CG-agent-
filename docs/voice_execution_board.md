# Fieldr Voice Execution Board

Last updated: 2026-03-18

This is the shorter execution board version of the voice readiness backlog.

## P0

Ship the current voice capture path as something trustworthy.

Tickets:

1. End-to-end voice smoke validation
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/ingest.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)

2. Transcript and transcription failure visibility
Files:
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

3. Idempotency protection for duplicate transcript and callback events
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)

4. Twilio production routing and callback verification
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [twilio_setup.md](/c:/Users/caleb/OneDrive/Desktop/hello/docs/twilio_setup.md)

Definition of done:

- real call or voice note becomes reviewable work
- failures are visible, not hidden
- duplicate provider delivery does not create duplicate queue work

## P1

Make voice-derived work easier to trust and easier to operate.

Tickets:

1. Transcript quality scoring and low-confidence handling
Files:
- [parse_call_transcript.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/parse_call_transcript.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)

2. Operator audit trail for what Fieldr heard, extracted, and drafted
Files:
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [jobs.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/jobs.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)

3. Queue and job-detail visibility for voice-derived actions
Files:
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)
- [JobDetailPage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/JobDetailPage.tsx)
- [transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/routers/transcripts.py)

4. Manual-review-needed operator states
Files:
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)
- [queries.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/db/queries.py)
- [QueuePage.tsx](/c:/Users/caleb/OneDrive/Desktop/hello/frontend/src/pages/QueuePage.tsx)

Definition of done:

- operators can see what came from voice
- low-quality transcripts get stricter handling
- queue and job history reflect voice-derived work clearly

## P2

Decide whether Fieldr is going to become a real live voice agent and build the missing runtime accordingly.

Tickets:

1. Live call state model
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [state.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/state.py)

2. Human escalation / transfer path
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- future live-call routing / operator-control modules

3. Real-time conversational voice loop
Files:
- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/ingest.py)
- future live-call orchestration modules

Definition of done:

- live voice behavior is explicit and auditable
- escalation path exists
- the product boundary between async capture and live conversation is no longer ambiguous

## Recommended Order

1. P0
2. P1
3. P2

## Current Positioning Rule

Until P0 and most of P1 are complete, Fieldr voice should be positioned as:

`voice capture and transcript-driven operational review`

Not:

`fully autonomous live contractor phone agent`
