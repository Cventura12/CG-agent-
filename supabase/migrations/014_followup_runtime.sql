alter table public.open_items
    add column if not exists quote_id text;

alter table public.open_items
    add column if not exists reminder_count integer not null default 0;

alter table public.open_items
    add column if not exists last_reminder_at timestamptz;

alter table public.open_items
    add column if not exists next_due_at timestamptz;

alter table public.open_items
    add column if not exists stopped_at timestamptz;

alter table public.open_items
    add column if not exists stop_reason text;

create index if not exists idx_open_items_followup_schedule
    on public.open_items (gc_id, type, status, next_due_at);

create index if not exists idx_open_items_followup_quote_id
    on public.open_items (quote_id)
    where quote_id is not null;

update public.open_items
set quote_id = nullif(substring(description from 'Quote ID: ([A-Za-z0-9._:-]+)'), '')
where quote_id is null
  and description like '%Quote ID:%';

update public.open_items
set next_due_at = coalesce(next_due_at, (due_date::timestamp at time zone 'UTC'))
where next_due_at is null
  and due_date is not null;
