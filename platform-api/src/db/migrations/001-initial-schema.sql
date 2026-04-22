create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists players (
  player_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists player_profiles (
  player_id text primary key references players(player_id) on delete cascade,
  profile_name text not null default '',
  real_name text not null default '',
  bio text not null default '',
  tagline text not null default '',
  avatar_asset_id text not null default '',
  background_image_url text not null default '',
  presence text not null default 'offline',
  favorite_game_slug text not null default '',
  ladder_placements jsonb not null default '[]'::jsonb,
  friends_preview jsonb not null default '[]'::jsonb,
  main_squeeze jsonb,
  badge_ids jsonb not null default '[]'::jsonb,
  favorites jsonb not null default '[]'::jsonb,
  friends jsonb not null default '[]'::jsonb,
  recent_partners jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  featured_games jsonb not null default '[]'::jsonb,
  recent_activity jsonb not null default '[]'::jsonb,
  thought_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists player_metrics (
  player_id text primary key references players(player_id) on delete cascade,
  profile_view_count integer not null default 0,
  thought_post_count integer not null default 0,
  activity_item_count integer not null default 0,
  received_reaction_count integer not null default 0,
  received_comment_count integer not null default 0,
  received_share_count integer not null default 0,
  most_played_game_slug text not null default '',
  most_played_with_player_id text not null default '',
  friend_count integer not null default 0,
  friend_points jsonb not null default '{}'::jsonb,
  total_play_session_count integer not null default 0,
  total_play_time_minutes integer not null default 0,
  unique_games_played_count integer not null default 0,
  event_participation_count integer not null default 0,
  top_three_finish_count integer not null default 0,
  mutual_friend_count integer not null default 0,
  shared_game_count integer not null default 0,
  shared_session_count integer not null default 0,
  shared_event_count integer not null default 0,
  results_screen_profile_open_count integer not null default 0,
  results_screen_add_friend_click_count integer not null default 0,
  chat_profile_open_count integer not null default 0,
  friend_request_sent_count integer not null default 0,
  friend_request_accepted_count integer not null default 0,
  thought_impression_count integer not null default 0,
  profile_open_source_breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists player_relationships (
  player_id text primary key references players(player_id) on delete cascade,
  main_squeeze_mode text not null default 'manual',
  main_squeeze_player_id text not null default '',
  friend_rail_mode text not null default 'auto',
  manual_friend_slot_player_ids jsonb not null default '[]'::jsonb,
  most_played_with_player_id text not null default '',
  last_played_with_player_id text not null default '',
  recently_played_with_player_ids jsonb not null default '[]'::jsonb,
  friend_player_ids jsonb not null default '[]'::jsonb,
  friend_points_by_player_id jsonb not null default '{}'::jsonb,
  mutual_friend_count_by_player_id jsonb not null default '{}'::jsonb,
  shared_game_count_by_player_id jsonb not null default '{}'::jsonb,
  shared_session_count_by_player_id jsonb not null default '{}'::jsonb,
  shared_event_count_by_player_id jsonb not null default '{}'::jsonb,
  last_shared_session_at_by_player_id jsonb not null default '{}'::jsonb,
  last_shared_event_at_by_player_id jsonb not null default '{}'::jsonb,
  last_interaction_at_by_player_id jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists relationship_ledger_entries (
  ledger_key text primary key,
  ledger_type text not null,
  pair_key text not null default '',
  subject_key text not null default '',
  value_count integer not null default 0,
  occurred_at text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists activity_items (
  id text primary key,
  actor_player_id text not null default '',
  game_slug text not null default '',
  visibility text not null default 'public',
  title text not null default '',
  summary text not null default '',
  created_at text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_row_at timestamptz not null default now()
);

create table if not exists thought_posts (
  id text primary key,
  author_player_id text not null default '',
  body text not null default '',
  visibility text not null default 'public',
  created_at text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_row_at timestamptz not null default now()
);
