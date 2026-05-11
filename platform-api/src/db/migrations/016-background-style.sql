alter table player_profiles
  add column if not exists background_style text not null default 'blend';
