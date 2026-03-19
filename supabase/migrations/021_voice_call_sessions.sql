create table if not exists public.voice_call_sessions (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    call_id text,
    provider text,
    from_number text,
    to_number text,
    caller_name text,
    runtime_mode text not null default 'gather',
    status text not null default 'active',
    goal text not null default 'general',
    stream_state text not null default 'idle',
    stream_sid text,
    turns jsonb not null default '[]'::jsonb,
    extracted_fields jsonb not null default '{}'::jsonb,
    missing_slots jsonb not null default '[]'::jsonb,
    asked_slots jsonb not null default '[]'::jsonb,
    summary text,
    last_prompt text,
    last_caller_transcript text,
    silence_count integer not null default 0,
    transcript_id text references public.call_transcripts(id) on delete set null,
    handoff_trace_id text,
    handoff_result jsonb not null default '{}'::jsonb,
    escalation_reason text,
    transfer_state text not null default 'none',
    transfer_target text,
    recording_url text,
    recording_storage_ref text,
    recording_content_type text,
    recording_duration_seconds double precision,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.voice_call_sessions enable row level security;

create policy voice_call_sessions_gc_scope
on public.voice_call_sessions
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create index if not exists idx_voice_call_sessions_gc_updated
    on public.voice_call_sessions (gc_id, updated_at desc);

create unique index if not exists voice_call_sessions_gc_call_id_uidx
    on public.voice_call_sessions (gc_id, call_id)
    where call_id is not null and call_id <> '';
