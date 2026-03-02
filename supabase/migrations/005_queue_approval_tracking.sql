-- Day 26 queue approval tracking.
-- Adds approval tracking fields so approval quality can be measured per contractor per day.

alter table public.draft_queue
    add column if not exists was_edited boolean not null default false;

alter table public.draft_queue
    add column if not exists approval_status text;

alter table public.draft_queue
    add column if not exists approval_recorded_at timestamptz;

comment on column public.draft_queue.was_edited is 'True once a draft has been edited before final approval/discard.';
comment on column public.draft_queue.approval_status is 'Final queue outcome: approved_without_edit, approved_with_edit, or discarded.';
comment on column public.draft_queue.approval_recorded_at is 'Timestamp when approval_status was written.';

update public.draft_queue
set was_edited = true
where status = 'edited';

update public.draft_queue
set approval_status = 'discarded',
    approval_recorded_at = coalesce(approval_recorded_at, actioned_at, now())
where status = 'discarded'
  and approval_status is null;

update public.draft_queue
set approval_status = 'approved_without_edit',
    approval_recorded_at = coalesce(approval_recorded_at, actioned_at, now())
where status = 'approved'
  and approval_status is null;

create index if not exists idx_draft_queue_gc_approval_status
    on public.draft_queue (gc_id, approval_status, approval_recorded_at desc);

create index if not exists idx_draft_queue_was_edited
    on public.draft_queue (was_edited);
