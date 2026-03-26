# Arbor Voice Capability Internal Memo

Last updated: 2026-03-18

## Summary

Arbor's current voice capability is strongest as an async capture and review system, not as a fully autonomous live phone agent.

The product can credibly capture:

- call transcripts
- voice notes
- transcript-derived scope changes
- follow-up signals
- quote-related intake

It can then route that information into:

- review queue
- draft quote flow
- tracked updates
- job history

That is real product value.

What we should not claim yet is that Arbor is a fully production-ready live conversational AI receptionist or a fully autonomous phone rep.

## What Is Working

### 1. Voice and transcript ingestion foundation

The backend has working foundations for:

- Twilio webhook handling
- Twilio request signature validation
- provider transcript normalization
- Deepgram transcription for audio URLs
- transcript persistence and linkage

Relevant files:

- [twilio.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/twilio.py)
- [transcript_normalization.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/webhooks/transcript_normalization.py)
- [ingest.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/ingest.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)

### 2. Transcript parsing into operational output

Arbor can parse transcripts into structured outputs such as:

- classification
- urgency
- risks
- missing information
- next actions
- scope items

Relevant files:

- [parse_call_transcript.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/nodes/parse_call_transcript.py)
- [call_transcripts.py](/c:/Users/caleb/OneDrive/Desktop/hello/gc_agent/call_transcripts.py)

### 3. Human-in-the-loop review path

The strongest current voice story is:

1. inbound call or voice note arrives
2. transcript is captured or audio is transcribed
3. Arbor extracts what changed
4. the result lands in queue or transcript review
5. the contractor approves the next action
6. approved items become draft quotes, logged updates, or tracked unresolved work

This is aligned with the product.

## What Is Not Yet Ready

### 1. Live conversational voice agent

We do not yet have a clearly production-ready live voice loop with:

- real-time turn taking
- interruption handling
- transfer to human
- robust live escalation rules
- operator controls for active calls

### 2. Full production hardening

We still need more confidence in:

- real-world telephony failure handling
- idempotency and replay behavior under duplicate webhook delivery
- observability for end-to-end voice failures
- stronger operator-facing failure states
- compliance and operational readiness around Twilio production traffic

### 3. Product-safe positioning boundary

Current safe claim:

- Arbor captures calls and voice notes and turns them into reviewable operational work.

Unsafe claim right now:

- Arbor can fully run live contractor phone conversations end to end with production reliability.

## Recommended External Positioning

Position voice as:

- voice capture
- transcript-driven extraction
- human-reviewed office action
- queue-driven follow-through

Do not position voice as:

- autonomous receptionist
- fully live AI phone rep
- office replacement for all phone handling

## Product Truth

The voice capability is already useful.

It is useful because it reduces loss between:

- what was said in the field
- what the office needs to act on

That is enough to sell the value carefully.

It is not yet enough to overstate the product as a polished autonomous voice agent.

## Recommendation

For now, treat Arbor voice as:

`voice-to-operations capture with human review`

That is the most accurate and defensible framing for customers, demos, and roadmap decisions.

