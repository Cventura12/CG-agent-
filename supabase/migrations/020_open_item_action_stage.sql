alter table public.open_items
    add column if not exists action_stage text;

create index if not exists idx_open_items_action_stage
    on public.open_items (gc_id, job_id, action_stage)
    where action_stage is not null;

update public.open_items
set action_stage = 'drafted'
where action_stage is null
  and status = 'in-progress'
  and trace_id like 'open-item-action:%';

update public.open_items
set action_stage = 'completed'
where action_stage is null
  and status = 'resolved'
  and trace_id like 'open-item-action:%';
