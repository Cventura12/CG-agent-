create table if not exists public.quote_delivery_log (
    id text primary key,
    quote_id text not null references public.quote_drafts(id) on delete cascade,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    job_id text references public.jobs(id) on delete set null,
    trace_id text,
    channel text not null,
    destination text not null,
    recipient_name text,
    message_preview text,
    delivery_status text not null,
    provider_message_id text,
    error_message text,
    created_at timestamptz not null default now()
);

create index if not exists idx_quote_delivery_log_gc_created
    on public.quote_delivery_log (gc_id, created_at desc);

create index if not exists idx_quote_delivery_log_quote
    on public.quote_delivery_log (quote_id, created_at desc);
