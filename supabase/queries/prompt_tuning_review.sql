-- Day 27 prompt iteration review.
-- Pull approved-with-edit quotes and inspect what contractors changed.

select
    gc_id,
    job_id,
    title,
    type,
    original_content,
    content as final_content,
    approval_recorded_at
from public.draft_queue
where approval_status = 'approved_with_edit'
order by approval_recorded_at desc
limit 100;

-- Pattern view: where are edits happening most often?
select
    type,
    count(*) as edited_approvals
from public.draft_queue
where approval_status = 'approved_with_edit'
group by type
order by edited_approvals desc, type;
