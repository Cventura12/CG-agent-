# GC Agent

GC Agent is a FastAPI + React system for WhatsApp-first contractor updates, draft queue review, and morning briefings.

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
