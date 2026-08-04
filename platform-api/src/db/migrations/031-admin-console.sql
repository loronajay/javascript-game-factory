-- Admin console: platform authority, plus the content that authority manages.
--
-- Until now every route authorized the same way — "is the caller the owner of this
-- row?". That is the right rule for player data and stays untouched. This migration
-- introduces the one thing it cannot express: a platform operator who may act on
-- content they do not own. Authority is a column on `accounts`, not a claim baked
-- into a token, so it can be revoked between one request and the next.
--
-- The content tables (bulletins, arcade_events, cabinet_overrides, site_settings)
-- replace hardcoded browser fixtures. Every one of them is allowed to be EMPTY:
-- the frontend falls back to its shipped defaults when a table has no rows, so a
-- cold database renders exactly the site that shipped before this migration.

alter table accounts add column if not exists is_admin boolean not null default false;
alter table accounts add column if not exists suspended_until timestamptz;
alter table accounts add column if not exists suspended_reason text;

-- Partial: admins are a handful of rows in a table of many, and the only query
-- that reads this column in bulk is "list the admins".
create index if not exists accounts_is_admin_idx on accounts (is_admin) where is_admin;

-- Platform-authored announcements. `status`/`audience` mirror the browser contract in
-- js/platform/bulletins/bulletins.mts so a row and a fixture normalize identically.
create table if not exists bulletins (
  id           text        primary key default gen_random_uuid()::text,
  slug         text        not null unique,
  title        text        not null,
  summary      text        not null default '',
  body         text        not null default '',
  status       text        not null default 'draft'
                 check (status in ('draft','published','archived')),
  audience     text        not null default 'public'
                 check (audience in ('public','friends','private')),
  pinned       boolean     not null default false,
  published_at timestamptz,
  created_by   text        not null default 'system',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- The public board reads exactly one shape: published + public, newest first.
create index if not exists bulletins_feed_idx
  on bulletins (status, audience, pinned desc, published_at desc);

-- Named `arcade_events` rather than `events` because `events` is a reserved-ish word in
-- enough tooling to be a recurring papercut, and the slug space is already "arcade".
create table if not exists arcade_events (
  id            text        primary key default gen_random_uuid()::text,
  slug          text        not null unique,
  title         text        not null,
  summary       text        not null default '',
  body          text        not null default '',
  starts_at     timestamptz,
  ends_at       timestamptz,
  related_games jsonb       not null default '[]'::jsonb,
  bulletin_ids  jsonb       not null default '[]'::jsonb,
  status        text        not null default 'scheduled'
                  check (status in ('scheduled','live','completed','cancelled')),
  created_by    text        not null default 'system',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists arcade_events_calendar_idx
  on arcade_events (status, starts_at asc);

-- Per-cabinet grid overrides. Every nullable column means "inherit from the cabinet's
-- own games/<slug>/game.json" — a row with only `hidden` set changes visibility and
-- nothing else. No cabinet is required to have a row here, and deleting a row restores
-- the file-based metadata exactly. This is why admin edits can never break a game.
create table if not exists cabinet_overrides (
  slug         text        primary key,
  hidden       boolean     not null default false,
  featured     boolean,
  sort_order   integer,
  title        text,
  tagline      text,
  status_label text,
  updated_at   timestamptz not null default now(),
  updated_by   text        not null default 'system'
);

-- Free-form keyed configuration (featured cabinet, seasonal programming, board copy).
-- A key with no row is not an error; callers supply their own default.
create table if not exists site_settings (
  key        text        primary key,
  value      jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text        not null default 'system'
);

-- Player-filed reports. `target_owner_player_id` is denormalized at file time so the
-- moderation queue can show "who posted this" without joining across four content
-- tables, and still works after the underlying content is deleted.
create table if not exists content_reports (
  id                     bigserial   primary key,
  target_type            text        not null
                           check (target_type in ('thought','thought_comment','photo','photo_comment','player')),
  target_id              text        not null,
  target_owner_player_id text        not null default '',
  reporter_player_id     text        not null,
  reason                 text        not null default 'other',
  details                text        not null default '',
  status                 text        not null default 'open'
                           check (status in ('open','resolved','dismissed')),
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_by            text
);

-- One OPEN report per reporter per target: re-reporting the same item is a no-op rather
-- than a way to flood the queue. Resolved rows stay as history, hence the partial index.
create unique index if not exists content_reports_dedupe_idx
  on content_reports (target_type, target_id, reporter_player_id)
  where status = 'open';

create index if not exists content_reports_queue_idx
  on content_reports (status, created_at desc);

-- Every admin action that changes state writes here. This is the reason authority is a
-- DB flag rather than a shared password: an action is always attributable to a person.
create table if not exists admin_audit_log (
  id              bigserial   primary key,
  admin_player_id text        not null,
  action          text        not null,
  target_type     text        not null default '',
  target_id       text        not null default '',
  details         jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists admin_audit_log_recent_idx
  on admin_audit_log (created_at desc);
