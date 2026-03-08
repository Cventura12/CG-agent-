create table if not exists public.pricing_import_log (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    filename text not null,
    sheet_name text,
    source_type text not null,
    mapping_json jsonb not null default '{}'::jsonb,
    summary_json jsonb not null default '{}'::jsonb,
    imported_count integer not null default 0,
    skipped_count integer not null default 0,
    error_count integer not null default 0,
    trace_id text,
    created_at timestamptz not null default now()
);

alter table public.pricing_import_log enable row level security;

create policy pricing_import_log_gc_scope
on public.pricing_import_log
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create index if not exists idx_pricing_import_log_gc_created
    on public.pricing_import_log (gc_id, created_at desc);

create index if not exists idx_pricing_import_log_trace_id
    on public.pricing_import_log (trace_id)
    where trace_id is not null;
