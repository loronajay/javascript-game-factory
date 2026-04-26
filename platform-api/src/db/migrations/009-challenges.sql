create table if not exists challenges (
  id text primary key,
  from_player_id text not null,
  to_player_id text not null,
  from_display_name text not null default '',
  game_slug text not null,
  game_title text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_challenges_to
  on challenges (to_player_id, created_at desc);

create index if not exists idx_challenges_from
  on challenges (from_player_id, created_at desc);
