alter table player_profiles
  add column if not exists profile_music_playlist jsonb not null default '[]'::jsonb;
