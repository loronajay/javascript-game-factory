create table if not exists thought_post_comments (
  id text primary key,
  thought_id text not null references thought_posts (id) on delete cascade,
  author_player_id text not null,
  author_display_name text not null default '',
  text text not null default '',
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists idx_thought_post_comments_thought_id_created_at
  on thought_post_comments (thought_id, created_at asc);
