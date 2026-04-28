create table if not exists player_photos (
  id text primary key,
  player_id text not null references players(player_id) on delete cascade,
  asset_id text not null default '',
  image_url text not null default '',
  caption text not null default '',
  visibility text not null default 'public',
  created_at timestamptz not null default now()
);

create index if not exists player_photos_player_id_idx on player_photos(player_id);
