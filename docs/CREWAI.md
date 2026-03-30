# Arbor Agent · CrewAI Build Guide

This document describes how to implement Arbor’s agentic loop using CrewAI. It is scoped to the core flow: **field update → queue → draft → approval → job history**.

## Why CrewAI here

CrewAI is a good fit for coordinating specialized agents with clear roles, deterministic handoffs, and human‑in‑the‑loop checkpoints. We use it to keep the system reliable and auditable.

## Target Loop (MVP)

1. Inbound capture (call/text/upload/voice note).
2. Extracted deltas and requests.
3. Queue item created with confidence + context.
4. Human review (approve/edit/dismiss).
5. Draft artifact generated (quote/follow‑up).
6. Job history updated with traceability.

## Agent Roles

### 1) Intake Agent
**Purpose:** Normalize raw inbound payloads into a single schema.
**Inputs:** Call transcript, text body, file upload metadata, voice note.
**Outputs:** `NormalizedInbound` object.

### 2) Extraction Agent
**Purpose:** Extract scope changes, commitments, pricing, and open questions.
**Inputs:** `NormalizedInbound`.
**Outputs:** `ExtractionResult` with `confidence`, `entities`, and `requires_human_review`.

### 3) Queue Writer
**Purpose:** Create a reviewable queue item and attach context.
**Inputs:** `ExtractionResult`, related job/customer context.
**Outputs:** `QueueItem` saved in backend.

### 4) Draft Builder
**Purpose:** Build draft quotes and follow‑ups after approval.
**Inputs:** Approved `QueueItem`, estimating memory, job context.
**Outputs:** `DraftQuote` or `DraftFollowUp`.

### 5) Job Historian
**Purpose:** Persist a clean audit trail of what changed.
**Inputs:** Approved `QueueItem`, created draft.
**Outputs:** `JobHistoryEvent`.

### 6) Supervisor (Orchestrator)
**Purpose:** Enforce ordering, retry rules, and safety checks.
**Inputs:** All agent outputs.
**Outputs:** Status state machine transitions.

## Minimal Data Contracts

### NormalizedInbound
```json
{
  "source": "CALL|TEXT|UPLOAD|VOICE",
  "job_id": "string|null",
  "contact": { "name": "string", "phone": "string|null" },
  "content": "string",
  "received_at": "iso8601"
}
```

### ExtractionResult
```json
{
  "changes": ["string"],
  "amounts": [{ "label": "string", "value": 600 }],
  "questions": ["string"],
  "confidence": 0.0,
  "requires_human_review": true
}
```

### QueueItem
```json
{
  "id": "uuid",
  "status": "pending|approved|dismissed|manual_review",
  "summary": "string",
  "details": "string",
  "confidence": 0.0
}
```

## Confidence Policy

If `confidence < 0.7` or `requires_human_review === true`, queue item must be flagged as **manual review**.

## Execution Board (Now / Next / Later)

### Now
1. Implement `Intake Agent` + `Extraction Agent` with robust schema validation.
2. Wire `Queue Writer` to live backend queue endpoint.
3. Enforce confidence thresholds.

### Next
1. Draft Builder with estimating memory context.
2. Job Historian events with links to source transcript.
3. Retry policy + error reporting to UI.

### Later
1. Voice call real‑time follow‑ups (question‑asking).
2. Auto‑messaging for approved follow‑ups.
3. Per‑trade agent specializations.

## Where to integrate in this repo

- Backend API: `gc_agent/` (FastAPI endpoints for queue, jobs, quotes).
- Frontend UI: `frontend/` (Queue detail, Jobs follow‑ups, transcript inbox).
- Landing: `fieldr-landing/` (only if needed for messaging).

## Implementation Notes

- Keep agent outputs deterministic and loggable.
- Always attach `source_id` and `transcript_id` to queue items.
- Never auto‑send a draft without explicit approval.

---

If you want, I can scaffold a `crewai/` folder with the agent definitions and a CLI runner.
