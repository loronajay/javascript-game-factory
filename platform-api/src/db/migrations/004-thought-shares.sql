create table if not exists thought_post_shares (
  original_thought_id text not null references thought_posts(id) on delete cascade,
  player_id text not null default '',
  shared_thought_id text not null references thought_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (original_thought_id, player_id)
);

create unique index if not exists thought_post_shares_shared_thought_id_unique
  on thought_post_shares (shared_thought_id);

create index if not exists thought_post_shares_player_id_idx
  on thought_post_shares (player_id);
