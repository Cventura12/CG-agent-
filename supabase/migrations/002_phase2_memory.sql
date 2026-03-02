-- GC Agent Phase 2 persistence additions.
-- Adds pgvector-backed memory storage without rewriting the existing schema.

create extension if not exists vector;

create table if not exists public.contractor_profile (
    contractor_id uuid primary key references public.gc_users(id) on delete cascade,
    company_name text not null default '',
    preferred_scope_language jsonb not null default '[]'::jsonb,
    pricing_signals jsonb not null default '{}'::jsonb,
    material_preferences jsonb not null default '{}'::jsonb,
    notes text not null default '',
    updated_at timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table if not exists public.job_memory (
    id text primary key,
    contractor_id uuid not null references public.gc_users(id) on delete cascade,
    job_id text references public.jobs(id) on delete set null,
    scope_text text not null,
    summary text not null default '',
    embedding vector,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

comment on table public.contractor_profile is 'Contractor-specific estimating preferences and learned profile signals.';
comment on column public.contractor_profile.contractor_id is 'Owner GC account ID and primary key (FK to gc_users).';
comment on column public.contractor_profile.company_name is 'Preferred company name for outgoing estimates.';
comment on column public.contractor_profile.preferred_scope_language is 'Reusable approved scope language snippets.';
comment on column public.contractor_profile.pricing_signals is 'Structured pricing tendencies learned from approvals.';
comment on column public.contractor_profile.material_preferences is 'Preferred material substitutions and defaults.';
comment on column public.contractor_profile.notes is 'Freeform contractor-specific notes for future context recall.';
comment on column public.contractor_profile.updated_at is 'Timestamp of latest profile update.';
comment on column public.contractor_profile.created_at is 'Timestamp when the profile row was created.';

comment on table public.job_memory is 'Approved estimate memory rows used for similarity recall.';
comment on column public.job_memory.id is 'Text primary key for a stored memory item.';
comment on column public.job_memory.contractor_id is 'Owner GC account ID (FK to gc_users).';
comment on column public.job_memory.job_id is 'Optional related job ID (FK to jobs).';
comment on column public.job_memory.scope_text is 'Canonical scope text used for embedding and recall.';
comment on column public.job_memory.summary is 'Compact natural-language summary of the approved job.';
comment on column public.job_memory.embedding is 'pgvector embedding used for cosine similarity search.';
comment on column public.job_memory.metadata is 'Structured metadata such as job type, totals, and tags.';
comment on column public.job_memory.created_at is 'Timestamp when the memory row was created.';

alter table public.contractor_profile enable row level security;
alter table public.job_memory enable row level security;

create policy contractor_profile_gc_scope
on public.contractor_profile
for all
to authenticated
using (contractor_id = auth.uid())
with check (contractor_id = auth.uid());

create policy job_memory_gc_scope
on public.job_memory
for all
to authenticated
using (contractor_id = auth.uid())
with check (contractor_id = auth.uid());

create index if not exists idx_contractor_profile_updated_at
    on public.contractor_profile (updated_at desc);

create index if not exists idx_job_memory_contractor_created
    on public.job_memory (contractor_id, created_at desc);

create index if not exists idx_job_memory_job_id
    on public.job_memory (job_id);

create index if not exists idx_job_memory_embedding_cosine
    on public.job_memory
    using ivfflat (embedding vector_cosine_ops);
