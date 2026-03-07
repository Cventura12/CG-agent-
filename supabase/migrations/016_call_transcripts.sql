create table if not exists public.call_transcripts (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    job_id text references public.jobs(id) on delete set null,
    quote_id text references public.quote_drafts(id) on delete set null,
    call_id text,
    source text not null,
    provider text,
    caller_phone text,
    caller_name text,
    started_at timestamptz,
    duration_seconds integer,
    recording_url text,
    transcript_text text not null,
    summary text,
    classification text,
    confidence numeric,
    extracted_json jsonb not null default '{}'::jsonb,
    risk_flags jsonb not null default '[]'::jsonb,
    recommended_actions jsonb not null default '[]'::jsonb,
    trace_id text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.call_transcripts enable row level security;

create policy call_transcripts_gc_scope
on public.call_transcripts
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create index if not exists idx_call_transcripts_gc_created
    on public.call_transcripts (gc_id, created_at desc);

create index if not exists idx_call_transcripts_job_created
    on public.call_transcripts (job_id, created_at desc);

create index if not exists idx_call_transcripts_quote_created
    on public.call_transcripts (quote_id, created_at desc);

create index if not exists idx_call_transcripts_trace_id
    on public.call_transcripts (trace_id);

create index if not exists idx_call_transcripts_source_call
    on public.call_transcripts (source, call_id);
