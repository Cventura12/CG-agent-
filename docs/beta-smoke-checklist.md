# Arbor Agent Beta Smoke Checklist

## Core product
- Typed quote flow works end to end
- Upload-to-quote works end to end
- Transcript-to-queue works end to end
- Transcript-to-quote prefill works end to end
- Edit, approve, discard, send, and follow-up work on real data

## Reliability
- `016`, `017`, `018`, and `019` migrations are applied in Supabase
- Retry and duplicate webhook behavior is verified
- Quote PDF and XLSX export both work after restart
- Follow-up scheduler runs hourly in production
- Delivery callbacks update visible status correctly

## Auth and identity
- Clerk internal routes work in deployed env
- Public quote routes work with the expected API-key path
- No route or CORS mismatch between frontend and backend
- Transcript internal ingest is not exposed on the public surface

## Data integrity
- Raw transcript is persisted before model work
- Failed transcript parsing still leaves a reviewable record
- Quote edits preserve final draft and delta
- Spreadsheet imports log imported, skipped, and error counts

## Frontend
- Queue handles transcript and non-transcript items together
- Job detail handles missing transcript summary and raw text safely
- Quote page handles transcript-derived missing information cleanly
- Mobile layouts are usable on real devices

## Manual smoke
1. Ingest transcript with explicit `job_id`
2. Ingest transcript matched by caller phone
3. Ingest unlinked transcript
4. Create quote from transcript prefill
5. Export quote PDF and XLSX
6. Send quote by SMS and email
7. Confirm follow-up runs and stops correctly
8. Import CSV price book
9. Import XLSX price book with messy headers
10. Load job detail and confirm transcript history and timeline

## Operational
- Twilio credentials and callbacks are correct
- SMTP is configured and verified
- Scheduler is enabled in the deployed backend
- Logs include usable `trace_id` values
- Supabase RLS and policies match the expected runtime flows
