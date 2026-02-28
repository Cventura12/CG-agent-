# GC Agent

GC Agent is a FastAPI + React system for WhatsApp-first contractor updates, draft queue review, and morning briefings.

## One-command local dev setup

```bash
python -m pip install -r requirements.txt && npm --prefix frontend install
```

## Run locally

Backend:

```bash
uvicorn gc_agent.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
npm --prefix frontend run dev
```

## Environment files

- Backend template: `.env.example`
- Frontend template: `frontend/.env.example`

Never commit real secrets.
