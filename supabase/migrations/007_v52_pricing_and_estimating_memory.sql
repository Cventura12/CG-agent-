-- GC Agent v5.2 additive estimating persistence.
-- Adds explicit contractor price_list and estimating_memory tables
-- without replacing the existing contractor_profile / job_memory design.

create table if not exists public.price_list (
    id text primary key,
    contractor_id uuid not null references public.gc_users(id) on delete cascade,
    item_key text not null,
    unit_cost numeric(12,2) not null default 0,
    unit text not null default 'unit',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_price_list_contractor_item_key
    on public.price_list (contractor_id, item_key);

create table if not exists public.estimating_memory (
    id text primary key,
    contractor_id uuid not null references public.gc_users(id) on delete cascade,
    job_id text references public.jobs(id) on delete set null,
    trade_type text not null,
    job_type text not null,
    material_type text not null default '',
    avg_waste_factor numeric(8,4) not null default 0,
    labor_hours_per_unit numeric(10,4) not null default 0,
    avg_markup numeric(10,4) not null default 0,
    scope_language_examples jsonb not null default '[]'::jsonb,
    confidence_score numeric(8,4) not null default 0,
    sample_count integer not null default 0,
    source_memory_id text,
    created_at timestamptz not null default now(),
    last_updated timestamptz not null default now()
);

create unique index if not exists idx_estimating_memory_rollup_key
    on public.estimating_memory (contractor_id, trade_type, job_type, material_type);

create index if not exists idx_estimating_memory_confidence
    on public.estimating_memory (contractor_id, confidence_score desc, last_updated desc);

comment on table public.price_list is 'Editable contractor-specific material and labor unit pricing.';
comment on column public.price_list.item_key is 'Normalized pricing key consumed by calculate_materials.';
comment on column public.price_list.unit_cost is 'Current contractor-approved unit cost for the given key.';
comment on table public.estimating_memory is 'Contractor-specific rollup memory used to refine future estimates.';
comment on column public.estimating_memory.avg_waste_factor is 'Observed average waste factor for this contractor and job pattern.';
comment on column public.estimating_memory.labor_hours_per_unit is 'Observed labor effort per unit for this contractor and job pattern.';
comment on column public.estimating_memory.avg_markup is 'Observed markup multiplier for this contractor and job pattern.';
comment on column public.estimating_memory.scope_language_examples is 'Approved reusable scope wording examples.';
comment on column public.estimating_memory.confidence_score is 'Confidence rises as the contractor approves more comparable quotes.';
comment on column public.estimating_memory.sample_count is 'Number of approved quotes folded into this rollup row.';

alter table public.price_list enable row level security;
alter table public.estimating_memory enable row level security;

create policy price_list_gc_scope
on public.price_list
for all
to authenticated
using (contractor_id = auth.uid())
with check (contractor_id = auth.uid());

create policy estimating_memory_gc_scope
on public.estimating_memory
for all
to authenticated
using (contractor_id = auth.uid())
with check (contractor_id = auth.uid());
