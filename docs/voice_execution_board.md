# Fieldr Voice Execution Board

Last updated: 2026-03-18

This is the shorter execution board version of the voice readiness backlog.

## P0

Ship the current voice capture path as something trustworthy.

- Validate end-to-end voice smoke flow in deployed environment
- Make transcript and transcription failures visible to operators
- Add idempotency protection for duplicate Twilio transcript and callback events
- Confirm Twilio production routing and callback configuration

Definition of done:

- real call or voice note becomes reviewable work
- failures are visible, not hidden
- duplicate provider delivery does not create duplicate queue work

## P1

Make voice-derived work easier to trust and easier to operate.

- Add transcript quality scoring and low-confidence handling
- Add stronger audit trail for what Fieldr heard, extracted, and drafted
- Tighten queue and job-detail visibility for voice-derived actions
- Document and verify operator review states for manual-review-needed cases

Definition of done:

- operators can see what came from voice
- low-quality transcripts get stricter handling
- queue and job history reflect voice-derived work clearly

## P2

Decide whether Fieldr is going to become a real live voice agent and build the missing runtime accordingly.

- Define live call state model
- Add human escalation / transfer path
- Add real-time conversational loop only if live voice remains a product priority

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
