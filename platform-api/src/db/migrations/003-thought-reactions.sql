alter table thought_posts
  add column if not exists author_display_name text not null default '',
  add column if not exists subject text not null default '',
  add column if not exists text text not null default '',
  add column if not exists comment_count integer not null default 0,
  add column if not exists share_count integer not null default 0,
  add column if not exists reaction_totals jsonb not null default '{}'::jsonb,
  add column if not exists repost_of_id text not null default '',
  add column if not exists edited_at text not null default '';

update thought_posts
set text = body
where text = ''
  and body <> '';

create table if not exists thought_post_reactions (
  thought_id text not null references thought_posts(id) on delete cascade,
  player_id text not null default '',
  reaction_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (thought_id, player_id)
);

create index if not exists thought_post_reactions_thought_id_idx
  on thought_post_reactions (thought_id);

create index if not exists thought_post_reactions_player_id_idx
  on thought_post_reactions (player_id);
