-- Google OAuth integration: stores access/refresh tokens and sync state per GC.
-- One row per gc_id. Upserted on reconnect.

create table if not exists google_integrations (
  id                  uuid primary key default gen_random_uuid(),
  gc_id               uuid not null references gc_users(id) on delete cascade,
  access_token        text not null,
  refresh_token       text not null,
  token_expiry        timestamptz,
  scopes              text[] not null default '{}',
  gmail_enabled       boolean not null default false,
  gmail_last_checked  timestamptz,
  gmail_history_id    text,
  calendar_enabled    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(gc_id)
);

create index if not exists google_integrations_gc_id_idx
  on google_integrations(gc_id);
