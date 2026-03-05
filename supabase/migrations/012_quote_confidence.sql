alter table public.quote_drafts
    add column if not exists estimate_confidence jsonb not null default '{}'::jsonb;

create index if not exists idx_quote_drafts_confidence
    on public.quote_drafts using gin (estimate_confidence);
