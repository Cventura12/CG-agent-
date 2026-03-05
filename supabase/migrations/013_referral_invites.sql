create table if not exists public.referral_invites (
    id text primary key,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    invite_code text not null unique,
    channel text not null default 'link',
    destination text,
    invitee_name text,
    note text,
    status text not null default 'pending',
    trace_id text,
    created_at timestamptz not null default now(),
    accepted_at timestamptz
);

create index if not exists idx_referral_invites_gc_created
    on public.referral_invites (gc_id, created_at desc);

create index if not exists idx_referral_invites_code
    on public.referral_invites (invite_code);

create table if not exists public.referral_leads (
    id text primary key,
    invite_id text references public.referral_invites(id) on delete set null,
    gc_id uuid not null references public.gc_users(id) on delete cascade,
    invite_code text not null,
    referred_name text,
    referred_contact text,
    source text,
    status text not null default 'new',
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_referral_leads_gc_created
    on public.referral_leads (gc_id, created_at desc);

create index if not exists idx_referral_leads_code
    on public.referral_leads (invite_code);
