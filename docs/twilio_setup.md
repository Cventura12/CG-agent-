# Twilio WhatsApp Production Setup

This guide moves GC Agent from the Twilio WhatsApp sandbox to a real WhatsApp Business number for beta GCs.

## 1. Set up a production WhatsApp Business sender in Twilio

1. Create or upgrade a Twilio account and enable billing.
2. In Twilio Console, open `Messaging -> Senders -> WhatsApp Senders`.
3. Start WhatsApp sender onboarding (not Sandbox):
   - Connect or create a Meta Business Manager account.
   - Complete Meta business verification if prompted.
   - Register the production phone number you want to use for GC Agent.
4. Configure the WhatsApp Business Profile:
   - Display name (example: `GC Agent`)
   - Business category
   - Business description
   - Logo/profile image
5. Wait for Twilio/Meta approval for the sender.
6. Configure incoming webhooks on the approved sender:
   - `When a message comes in` -> `POST https://<backend-domain>/webhook/whatsapp`
   - `Status callback URL` -> `POST https://<backend-domain>/webhook/whatsapp/status`
7. Validate backend reachability:
   - `GET https://<backend-domain>/webhook/whatsapp/health` should return `{"status":"ok"}`.

## 2. Ngrok local testing flow

Use this when backend is running locally.

1. Start backend locally on port `8000`.
2. Run:

```bash
ngrok http 8000
```

3. Copy the public HTTPS URL from ngrok (example: `https://abc123.ngrok-free.app`).
4. In Twilio sender webhook settings:
   - `When a message comes in` -> `https://abc123.ngrok-free.app/webhook/whatsapp`
   - `Status callback URL` -> `https://abc123.ngrok-free.app/webhook/whatsapp/status`
5. Send a WhatsApp message to the Twilio production number.
6. Verify delivery and processing:
   - Twilio Console `Monitor -> Logs -> Errors` and `Debugger`
   - Backend logs for `/webhook/whatsapp` request and response
   - Optional health check: `https://abc123.ngrok-free.app/webhook/whatsapp/health`

## 3. Production environment variable checklist

Set these before production rollout.

### Backend

- `OPENAI_API_KEY`
  - Source: Anthropic console API keys.
- `SUPABASE_URL`
  - Source: Supabase project settings -> API URL.
- `SUPABASE_SERVICE_ROLE_KEY`
  - Source: Supabase project settings -> API keys (service role).
- `SUPABASE_ANON_KEY` (optional fallback)
  - Source: Supabase project settings -> API keys (anon/public).
- `SUPABASE_POSTGRES_URL` (if running Postgres checkpoints)
  - Source: Supabase database connection string.
- `TWILIO_ACCOUNT_SID`
  - Source: Twilio console account dashboard.
- `TWILIO_AUTH_TOKEN`
  - Source: Twilio console account dashboard.
- `TWILIO_WHATSAPP_FROM`
  - Source: Approved Twilio WhatsApp sender (format: `whatsapp:+1...`).
- `CLERK_SECRET_KEY`
  - Source: Clerk dashboard -> API keys (secret key).
- `DEEPGRAM_API_KEY`
  - Source: Deepgram console API keys.
- `APP_ENV`
  - Suggested value: `production`.
- `LOG_LEVEL`
  - Suggested value: `INFO`.
- `PORT`
  - Runtime-provided in Railway (or host platform).
- `BRIEFING_HOUR`
  - Morning briefing schedule hour (24h UTC).
- `FRONTEND_URL`
  - Source: deployed frontend URL(s), comma-separated if multiple.

### Frontend

- `VITE_API_URL`
  - Source: deployed backend URL + `/api/v1`.
- `VITE_CLERK_KEY`
  - Source: Clerk dashboard -> API keys (publishable key).

## 4. Real GC onboarding flow

1. GC installs no app; they just save the WhatsApp Business number.
2. GC opens the web app URL and signs in using phone OTP (Clerk).
3. Web app calls `POST /api/v1/auth/register` with the GC phone number.
4. GC sends a first WhatsApp message to the GC Agent number.
5. GC receives confirmation that updates are now accepted and processed.

### Unregistered number behavior

If a phone number sends WhatsApp before registering, GC Agent responds:

`Hi! To use GC Agent, sign up at [web app URL]. Once registered, send updates to this number anytime.`

LangGraph processing is skipped until the number is registered.
