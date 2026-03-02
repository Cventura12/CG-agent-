-- Day 26 queue approval metrics.
-- Run these manually in Supabase SQL Editor.

-- 1) Raw approval-status counts
select approval_status, count(*)
from public.draft_queue
where approval_status is not null
group by approval_status
order by approval_status;

-- 2) Per-contractor, per-day counts
select
    gc_id,
    date(coalesce(approval_recorded_at, actioned_at)) as day,
    approval_status,
    count(*) as draft_count
from public.draft_queue
where approval_status is not null
group by gc_id, date(coalesce(approval_recorded_at, actioned_at)), approval_status
order by day desc, gc_id, approval_status;

-- 3) Current approval-without-edit rate (target: 70%+)
with decisions as (
    select
        count(*) filter (where approval_status = 'approved_without_edit') as approved_without_edit,
        count(*) filter (
            where approval_status in ('approved_without_edit', 'approved_with_edit', 'discarded')
        ) as total_decisions
    from public.draft_queue
)
select
    approved_without_edit,
    total_decisions,
    case
        when total_decisions = 0 then null
        else round((approved_without_edit::numeric / total_decisions::numeric) * 100, 1)
    end as approval_without_edit_rate_pct
from decisions;

-- 4) If below 50%, inspect what needed edits before approval
select
    gc_id,
    title,
    type,
    content,
    actioned_at,
    approval_status
from public.draft_queue
where approval_status = 'approved_with_edit'
order by actioned_at desc
limit 50;
