# Arbor Agent

Arbor Agent is an agentic operations system for field contractors. It sits between the field and the office, captures inbound updates (calls, texts, uploads, voice notes), extracts what changed, surfaces it for human review, and turns it into draft quotes, follow-ups, and job history.

This repo contains the production app, the marketing site, and the supporting backend services.

## What the agent does

- Captures inbound communication from the field.
- Extracts scope changes and requests into a reviewable queue.
- Produces draft quotes or follow-ups after approval.
- Writes updates to job history so nothing slips.
- Supports a voice intake path with transcript + extraction.

## Repo layout

- `gc_agent/` FastAPI backend (API, webhooks, schedulers, integrations).
- `frontend/` React app for the agent workspace (Queue, Jobs, Quotes, Analytics).
- `fieldr-landing/` Marketing site (Arbor brand/positioning).
- `supabase/` Database definitions and migrations.
- `docs/` Internal memos, product notes, and planning.

## One-command local dev setup

```bash
python -m pip install -r requirements.txt && npm --prefix frontend install
```

## Run locally

Primary backend (Clerk-authenticated `/api/v1/*`, webhooks, scheduler, plus mounted public API under `/public/*`):

```bash
uvicorn gc_agent.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
npm --prefix frontend run dev
```

By default, the frontend public quote flow will call the mounted `/public` routes on the primary backend. You can still run `uvicorn gc_agent.api.main:app` standalone for isolated debugging, but production and normal local dev should use only `gc_agent.main:app`.

## Environment files

- Backend template: `.env.example`
- Frontend template: `frontend/.env.example`

Never commit real secrets.

## Notes for onboarding + demo

- The onboarding flow supports a ghost-call capture for a fast "aha" moment.
- Once real data arrives, onboarding auto-hides.
- If a UI error appears, check the browser console and backend logs first.

## Deployment

- The frontend and landing site are Vite apps and can be deployed to Vercel.
- Backend is FastAPI and can run on Railway or any container host.
