alter table public.quote_drafts
    add column if not exists final_quote_draft jsonb;

alter table public.quote_drafts
    add column if not exists approval_status text not null default 'pending';

alter table public.quote_drafts
    add column if not exists was_edited boolean not null default false;

alter table public.quote_drafts
    add column if not exists feedback_note text;

alter table public.quote_drafts
    add column if not exists quote_delta jsonb not null default '{}'::jsonb;

alter table public.quote_drafts
    add column if not exists actioned_at timestamptz;

alter table public.quote_drafts
    add column if not exists memory_updated boolean not null default false;

alter table public.quote_drafts
    add column if not exists memory_summary text;

create index if not exists idx_quote_drafts_status_updated
    on public.quote_drafts (gc_id, approval_status, updated_at desc);
