alter table player_photos
  add column if not exists reaction_totals jsonb not null default '{}'::jsonb,
  add column if not exists comment_count integer not null default 0;

create table if not exists photo_reactions (
  photo_id text not null references player_photos(id) on delete cascade,
  player_id text not null default '',
  reaction_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (photo_id, player_id)
);

create index if not exists photo_reactions_photo_id_idx
  on photo_reactions (photo_id);

create index if not exists photo_reactions_player_id_idx
  on photo_reactions (player_id);

create table if not exists photo_comments (
  id text primary key,
  photo_id text not null references player_photos(id) on delete cascade,
  author_player_id text not null,
  author_display_name text not null default '',
  text text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists idx_photo_comments_photo_id_created_at
  on photo_comments (photo_id, created_at asc);
