# Deployment Checklist

This document covers production deployment for:
- Backend (FastAPI) on Railway
- Frontend (React/Vite) on Vercel

Never commit real credentials. Only commit `.env.example` templates.

## 1. Railway backend deployment

1. Push repository to GitHub.
2. In Railway, create a new project from the GitHub repo.
3. Confirm Railway detects:
   - `Procfile`
   - `railway.json`
4. Set the backend start command (if Railway asks):
   - `uvicorn gc_agent.main:app --host 0.0.0.0 --port $PORT`
5. Trigger first deploy.
6. Confirm health endpoint:
   - `GET https://<railway-backend-domain>/health`

## 1b. Beta public API deployment

The contractor beta flow (`/quote`, `/briefing`, `/jobs`, `/queue`) is served by `gc_agent.api.main:app`, not the Clerk-protected `gc_agent.main:app`.

1. Create a second Railway/Render/Fly service for the public beta API.
2. Set the start command to:
   - `uvicorn gc_agent.api.main:app --host 0.0.0.0 --port $PORT`
3. Set `GC_AGENT_API_KEYS` with the three seeded contractor IDs and unique keys.
4. Confirm these endpoints resolve on a real public URL:
   - `GET https://<beta-api-domain>/health`
   - `POST https://<beta-api-domain>/quote`
   - `GET https://<beta-api-domain>/quote/<quote_id>/pdf`
5. Point the frontend beta env at that root domain with:
   - `VITE_PUBLIC_API_URL=https://<beta-api-domain>`

## 2. Vercel frontend deployment

1. In Vercel, import the same GitHub repo.
2. Set project root to `frontend`.
3. Confirm build command uses Vite defaults (or `npm run build`).
4. Confirm output directory is `dist`.
5. Ensure `frontend/vercel.json` is included for SPA route rewrites.
6. Trigger first deploy and open frontend URL.

## 3. Required Railway environment variables

Set these in Railway project settings:

- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional fallback)
- `SUPABASE_POSTGRES_URL` (if checkpoint persistence is enabled)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM` (format: `whatsapp:+1...`)
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `DEEPGRAM_API_KEY`
- `APP_ENV=production`
- `LOG_LEVEL=INFO`
- `PORT` (usually injected by Railway)
- `BRIEFING_HOUR` (UTC hour for scheduled briefing job)
- `FRONTEND_URL` (deployed Vercel URL)
- `WEB_APP_URL` (same as deployed Vercel URL; used in onboarding response text)
- `GC_AGENT_API_KEYS` (required for the public beta API service)

## 4. Required Vercel environment variables

Set these in Vercel project settings:

- `VITE_API_URL=https://<railway-backend-domain>/api/v1`
- `VITE_PUBLIC_API_URL=https://<beta-api-domain>` (or same host if both APIs are served together)
- `VITE_CLERK_KEY=<clerk_publishable_key>`

## 5. GitHub Actions deployment setup

The workflow in `.github/workflows/deploy.yml` runs on push to `main`:

1. Installs backend dependencies
2. Runs `pytest tests/`
3. Deploys backend to Railway through Railway CLI
4. Frontend deploy is handled by Vercel Git integration

Add required GitHub repository secrets:

- `RAILWAY_TOKEN`
- `RAILWAY_PROJECT_ID`
- `RAILWAY_ENVIRONMENT_ID`
- `RAILWAY_SERVICE_ID`

## 6. Post-deploy verification

Run these checks after every production deploy:

1. Backend health:
   - `GET https://<railway-backend-domain>/health` returns `status=ok`.
2. Frontend load:
   - `https://<vercel-domain>/` loads queue UI.
3. API auth flow:
   - Clerk sign-in works and `/api/v1/auth/me` returns profile for a registered user.
4. Queue flow:
   - Pending drafts load and approve/edit/discard actions succeed.
5. Briefing endpoint:
   - `/api/v1/jobs/briefing` returns expected sectioned text.
6. Beta quote flow:
   - `POST /quote` returns a `quote_id`
   - `GET /quote/{quote_id}/pdf` returns a readable PDF
   - a real phone can open the share sheet from `Send PDF`

## 7. Twilio production webhook verification

In Twilio Console for your production WhatsApp sender:

1. Inbound webhook URL:
   - `https://<railway-backend-domain>/webhook/whatsapp`
2. Status callback URL:
   - `https://<railway-backend-domain>/webhook/whatsapp/status`
3. Send test message from:
   - A registered GC number (should process graph and queue drafts)
   - An unregistered number (should receive onboarding message)
4. Confirm events in Twilio Debugger and backend logs.

## 8. Railway log monitoring

1. Open Railway project -> service -> `Deployments` or `Logs`.
2. Watch for:
   - Startup completion
   - `/webhook/whatsapp` requests
   - Scheduler run for daily briefing
   - Unhandled exceptions
3. For failed requests, inspect stack traces and correlate with Twilio message SID.
