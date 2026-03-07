create index if not exists idx_call_transcripts_gc_source_call
    on public.call_transcripts (gc_id, source, call_id)
    where call_id is not null;

create index if not exists idx_call_transcripts_gc_source_trace
    on public.call_transcripts (gc_id, source, trace_id)
    where trace_id is not null;
