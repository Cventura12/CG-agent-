-- Day 27 prompt-tuning source fields.
-- Preserves pre-edit draft text so approved_with_edit reviews can compare original vs final wording.

alter table public.draft_queue
    add column if not exists original_content text;

comment on column public.draft_queue.original_content is 'Pre-edit draft content preserved for review when a contractor edits before approval.';

update public.draft_queue
set original_content = content
where was_edited = true
  and original_content is null;
