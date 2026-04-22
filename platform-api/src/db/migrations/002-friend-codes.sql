alter table player_profiles
  add column if not exists friend_code text not null default '';

create unique index if not exists player_profiles_friend_code_unique
  on player_profiles (friend_code)
  where friend_code <> '';
