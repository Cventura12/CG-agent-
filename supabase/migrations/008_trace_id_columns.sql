-- Trace correlation and node-level telemetry for production debugging.

alter table public.draft_queue
    add column if not exists trace_id text;

alter table public.open_items
    add column if not exists trace_id text;

alter table public.update_log
    add column if not exists trace_id text;

alter table public.briefing_log
    add column if not exists trace_id text;

create index if not exists idx_draft_queue_gc_trace_id
    on public.draft_queue (gc_id, trace_id);

create index if not exists idx_open_items_gc_trace_id
    on public.open_items (gc_id, trace_id);

create index if not exists idx_update_log_gc_trace_id
    on public.update_log (gc_id, trace_id);

create index if not exists idx_briefing_log_gc_trace_id
    on public.briefing_log (gc_id, trace_id);

create table if not exists public.agent_trace (
    id uuid primary key default gen_random_uuid(),
    trace_id text not null,
    gc_id uuid,
    job_id text,
    thread_id text,
    input_surface text not null,
    flow text,
    node_name text not null,
    prompt_name text,
    prompt_hash text,
    model_name text,
    latency_ms integer,
    input_tokens integer,
    output_tokens integer,
    status text,
    error_text text,
    input_preview jsonb not null default '{}'::jsonb,
    output_preview jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_agent_trace_trace_id
    on public.agent_trace (trace_id, created_at);

create index if not exists idx_agent_trace_gc_node
    on public.agent_trace (gc_id, node_name, created_at);
