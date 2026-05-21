-- Per-player, per-game ELO rating record.
-- Default rating 1200 (standard ELO starting point).
create table if not exists game_ratings (
  player_id    text not null,
  game_slug    text not null,
  rating       int  not null default 1200,
  wins         int  not null default 0,
  losses       int  not null default 0,
  draws        int  not null default 0,
  last_match_at timestamptz,
  primary key (player_id, game_slug)
);

-- One record per completed match session, per game.
-- Prevents both players reporting the same match from double-applying ELO.
create table if not exists game_rating_sessions (
  session_id   text        not null,
  game_slug    text        not null,
  processed_at timestamptz not null default now(),
  primary key (session_id, game_slug)
);
