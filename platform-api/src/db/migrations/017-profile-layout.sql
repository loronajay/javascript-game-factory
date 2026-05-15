alter table player_profiles
  add column if not exists profile_layout jsonb default null;
