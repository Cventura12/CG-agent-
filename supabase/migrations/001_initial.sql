-- Arbor Agent initial schema migration.
-- Defines persistence tables, RLS policies, indexes, and demo seed data.

create extension if not exists pgcrypto;

create table if not exists public.gc_users (
    id uuid primary key default gen_random_uuid(),
    clerk_user_id text unique,
    phone_number text not null unique,
    name text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.jobs (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    name text not null,
    type text not null,
    status text not null default 'active',
    address text not null,
    contract_value integer not null,
    contract_type text not null,
    est_completion date,
    notes text not null default '',
    last_updated timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table if not exists public.open_items (
    id text primary key,
    job_id text not null references public.jobs(id) on delete cascade,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    type text not null,
    description text not null,
    owner text not null,
    status text not null default 'open',
    days_silent integer not null default 0,
    due_date date,
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

create table if not exists public.draft_queue (
    id text primary key,
    job_id text not null references public.jobs(id) on delete cascade,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    type text not null,
    title text not null,
    content text not null,
    why text not null,
    status text not null default 'queued',
    created_at timestamptz not null default now(),
    actioned_at timestamptz
);

create table if not exists public.update_log (
    id text primary key,
    job_id text,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    input_type text not null,
    raw_input text not null,
    parsed_changes jsonb not null default '{}'::jsonb,
    drafts_created jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists public.briefing_log (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    phone_number text not null,
    briefing_text text not null,
    delivery_channel text not null default 'whatsapp',
    delivery_status text not null default 'pending',
    twilio_sid text,
    error_message text,
    created_at timestamptz not null default now()
);

comment on table public.gc_users is 'General contractor user accounts mapped to inbound phone numbers.';
comment on column public.gc_users.id is 'Primary key UUID for the GC account.';
comment on column public.gc_users.clerk_user_id is 'External Clerk user ID mapped to this GC profile.';
comment on column public.gc_users.phone_number is 'Unique phone number used for Twilio sender mapping.';
comment on column public.gc_users.name is 'Display name of the GC account owner.';
comment on column public.gc_users.created_at is 'Timestamp when the GC account was created.';

comment on table public.jobs is 'Active and historical jobs owned by each GC account.';
comment on column public.jobs.id is 'Text primary key for job records.';
comment on column public.jobs.gc_id is 'Owner GC account ID (FK to gc_users).' ;
comment on column public.jobs.name is 'Project name shown to the GC.';
comment on column public.jobs.type is 'Job category such as Commercial TI or Ground-Up.';
comment on column public.jobs.status is 'Lifecycle status: active, on-hold, or complete.';
comment on column public.jobs.address is 'Primary jobsite address.';
comment on column public.jobs.contract_value is 'Signed contract value in whole currency units.';
comment on column public.jobs.contract_type is 'Contract structure such as Lump Sum, Cost-Plus, or T&M.';
comment on column public.jobs.est_completion is 'Estimated completion date for the job.';
comment on column public.jobs.notes is 'Running notes appended by the execution loop.';
comment on column public.jobs.last_updated is 'Timestamp of most recent agent-driven update.';
comment on column public.jobs.created_at is 'Timestamp when the job row was created.';

comment on table public.open_items is 'Outstanding execution items for each job.';
comment on column public.open_items.id is 'Text primary key for open items.';
comment on column public.open_items.job_id is 'Parent job ID (FK to jobs).' ;
comment on column public.open_items.gc_id is 'Owner GC account ID (FK to gc_users).' ;
comment on column public.open_items.type is 'Open item category (RFI, CO, follow-up, etc.).';
comment on column public.open_items.description is 'Natural-language description of required action.';
comment on column public.open_items.owner is 'Responsible party for resolving the open item.';
comment on column public.open_items.status is 'Resolution status: open, in-progress, resolved, or overdue.';
comment on column public.open_items.days_silent is 'Days since last meaningful update for this item.';
comment on column public.open_items.due_date is 'Target date for resolution.';
comment on column public.open_items.created_at is 'Timestamp when the open item was created.';
comment on column public.open_items.resolved_at is 'Timestamp when the item was marked resolved.';

comment on table public.draft_queue is 'Agent-generated communication drafts awaiting GC action.';
comment on column public.draft_queue.id is 'Text primary key for queued draft entries.';
comment on column public.draft_queue.job_id is 'Parent job ID (FK to jobs).' ;
comment on column public.draft_queue.gc_id is 'Owner GC account ID (FK to gc_users).' ;
comment on column public.draft_queue.type is 'Draft category (CO, RFI, sub-message, etc.).';
comment on column public.draft_queue.title is 'Short queue display title for the draft.';
comment on column public.draft_queue.content is 'Full ready-to-send draft body text.';
comment on column public.draft_queue.why is 'One-line explanation for why the draft was created.';
comment on column public.draft_queue.status is 'Queue lifecycle status (queued, approved, edited, discarded).';
comment on column public.draft_queue.created_at is 'Timestamp when the draft was generated.';
comment on column public.draft_queue.actioned_at is 'Timestamp when the GC acted on the draft.';

comment on table public.update_log is 'Immutable record of inbound updates and parsed graph outputs.';
comment on column public.update_log.id is 'Text primary key for update log entries.';
comment on column public.update_log.job_id is 'Optional related job ID if update maps to a single job.';
comment on column public.update_log.gc_id is 'Owner GC account ID (FK to gc_users).' ;
comment on column public.update_log.input_type is 'Inbound channel type (voice, whatsapp, chat, etc.).';
comment on column public.update_log.raw_input is 'Original unmodified inbound message content.';
comment on column public.update_log.parsed_changes is 'JSON payload of structured changes from parse_update.';
comment on column public.update_log.drafts_created is 'JSON array of created draft IDs for this update.';
comment on column public.update_log.created_at is 'Timestamp when the update was received.';

comment on table public.briefing_log is 'Durable log for generated briefings and outbound delivery outcomes.';
comment on column public.briefing_log.id is 'Text primary key for briefing log entries.';
comment on column public.briefing_log.gc_id is 'Owner GC account ID (FK to gc_users).' ;
comment on column public.briefing_log.phone_number is 'Target destination phone used for briefing delivery.';
comment on column public.briefing_log.briefing_text is 'Full generated briefing payload.';
comment on column public.briefing_log.delivery_channel is 'Outbound channel used for delivery (e.g., whatsapp).';
comment on column public.briefing_log.delivery_status is 'Delivery state (pending, sent, failed).';
comment on column public.briefing_log.twilio_sid is 'Twilio message SID when delivery succeeds.';
comment on column public.briefing_log.error_message is 'Captured send error detail when delivery fails.';
comment on column public.briefing_log.created_at is 'Timestamp when the briefing log row was written.';

alter table public.gc_users enable row level security;
alter table public.jobs enable row level security;
alter table public.open_items enable row level security;
alter table public.draft_queue enable row level security;
alter table public.update_log enable row level security;
alter table public.briefing_log enable row level security;

create policy gc_users_owner_only
on public.gc_users
for all
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy jobs_gc_scope
on public.jobs
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create policy open_items_gc_scope
on public.open_items
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create policy draft_queue_gc_scope
on public.draft_queue
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create policy update_log_gc_scope
on public.update_log
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create policy briefing_log_gc_scope
on public.briefing_log
for all
to authenticated
using (gc_id = auth.uid())
with check (gc_id = auth.uid());

create index if not exists idx_jobs_gc_status
    on public.jobs (gc_id, status);

create index if not exists idx_gc_users_clerk_user_id
    on public.gc_users (clerk_user_id);

create index if not exists idx_open_items_job_status
    on public.open_items (job_id, status);

create index if not exists idx_draft_queue_gc_status
    on public.draft_queue (gc_id, status);

create index if not exists idx_briefing_log_gc_created
    on public.briefing_log (gc_id, created_at);

insert into public.gc_users (id, phone_number, name)
values (
    '00000000-0000-0000-0000-000000000001',
    '+15005550006',
    'Demo GC Owner'
)
on conflict (phone_number)
do update set
    name = excluded.name;

insert into public.jobs (
    id,
    gc_id,
    name,
    type,
    status,
    address,
    contract_value,
    contract_type,
    est_completion,
    notes
)
values
    (
        'job-001',
        '00000000-0000-0000-0000-000000000001',
        'Riverside Medical TI',
        'Commercial TI',
        'active',
        '1250 E Riverside Dr, Austin, TX',
        850000,
        'Lump Sum',
        '2026-07-31',
        'Demo job seeded for execution loop testing.'
    ),
    (
        'job-002',
        '00000000-0000-0000-0000-000000000001',
        'Lakeview Retail Buildout',
        'Retail Tenant Improvement',
        'active',
        '4200 South Lamar Blvd, Austin, TX',
        460000,
        'Cost Plus',
        '2026-06-15',
        'Demo job seeded for execution loop testing.'
    ),
    (
        'job-003',
        '00000000-0000-0000-0000-000000000001',
        'Westfield Office Renovation',
        'Office Renovation',
        'active',
        '8700 Burnet Rd, Austin, TX',
        1200000,
        'Lump Sum',
        '2026-09-30',
        'Demo job seeded for execution loop testing.'
    ),
    (
        'job-004',
        '00000000-0000-0000-0000-000000000001',
        'North Creek Warehouse Fit-Out',
        'Industrial Fit-Out',
        'active',
        '10101 N Interstate Hwy 35, Austin, TX',
        980000,
        'T&M',
        '2026-10-20',
        'Demo job seeded for execution loop testing.'
    )
on conflict (id)
do update set
    gc_id = excluded.gc_id,
    name = excluded.name,
    type = excluded.type,
    status = excluded.status,
    address = excluded.address,
    contract_value = excluded.contract_value,
    contract_type = excluded.contract_type,
    est_completion = excluded.est_completion,
    notes = excluded.notes,
    last_updated = now();
