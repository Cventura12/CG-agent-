alter table public.quote_drafts
    add column if not exists source_files jsonb not null default '[]'::jsonb;

create index if not exists idx_quote_drafts_source_files
    on public.quote_drafts using gin (source_files);
