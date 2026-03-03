create table if not exists public.quote_drafts (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    job_id text references public.jobs(id) on delete set null,
    trace_id text,
    quote_draft jsonb not null default '{}'::jsonb,
    rendered_quote text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_quote_drafts_gc_created
    on public.quote_drafts (gc_id, created_at desc);

create index if not exists idx_quote_drafts_trace
    on public.quote_drafts (trace_id);
