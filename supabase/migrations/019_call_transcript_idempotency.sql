with ranked_call_ids as (
    select
        id,
        row_number() over (
            partition by gc_id, source, call_id
            order by created_at asc, id asc
        ) as rn
    from public.call_transcripts
    where call_id is not null and call_id <> ''
)
delete from public.call_transcripts
where id in (select id from ranked_call_ids where rn > 1);

with ranked_trace_ids as (
    select
        id,
        row_number() over (
            partition by gc_id, source, trace_id
            order by created_at asc, id asc
        ) as rn
    from public.call_transcripts
    where (call_id is null or call_id = '')
      and trace_id is not null
      and trace_id <> ''
)
delete from public.call_transcripts
where id in (select id from ranked_trace_ids where rn > 1);

create unique index if not exists call_transcripts_gc_source_call_id_uidx
on public.call_transcripts (gc_id, source, call_id)
where call_id is not null and call_id <> '';

create unique index if not exists call_transcripts_gc_source_trace_id_uidx
on public.call_transcripts (gc_id, source, trace_id)
where (call_id is null or call_id = '')
  and trace_id is not null
  and trace_id <> '';
