-- Account-owned game progression and monetization state.
-- Local game saves may cache this data, but release builds should treat these
-- tables as the source of truth for spendable currency and owned entitlements.

create table if not exists game_progress_profiles (
  player_id     text        not null,
  game_slug     text        not null,
  valor_balance int         not null default 0 check (valor_balance >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (player_id, game_slug)
);

create table if not exists game_entitlements (
  player_id      text        not null,
  game_slug      text        not null,
  entitlement_id text        not null,
  kind           text        not null,
  source         text        not null,
  source_id      text        not null default '',
  quantity       int         not null default 1 check (quantity > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (player_id, game_slug, entitlement_id)
);

create index if not exists game_entitlements_lookup_idx
  on game_entitlements (game_slug, entitlement_id);

create table if not exists game_campaign_progress (
  player_id         text        not null,
  game_slug         text        not null,
  mission_id        text        not null,
  stars             int         not null default 0 check (stars >= 0 and stars <= 3),
  completed_at      timestamptz,
  valor_claimed_at  timestamptz,
  reward_claimed_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (player_id, game_slug, mission_id)
);

create table if not exists game_inventory_items (
  player_id  text        not null,
  game_slug  text        not null,
  item_id    text        not null,
  quantity   int         not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_id, game_slug, item_id)
);

create table if not exists game_progress_claims (
  player_id  text        not null,
  game_slug  text        not null,
  claim_id   text        not null,
  kind       text        not null,
  source_id  text        not null default '',
  payload    jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (player_id, game_slug, claim_id)
);
