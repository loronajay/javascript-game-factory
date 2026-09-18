-- Platform achievements: the player's cross-game trophy collection.
--
-- Generic on game_slug like game_loadouts (035) and game_run_records (036):
-- this is not a Lovers Lost table. A game registers its achievement
-- definitions in services/achievement-catalog and its detector beside them;
-- nothing about a game's rules is stored here. The row is the fact that
-- an account owns an achievement and when it was earned — the platform's
-- half of the split. The game's half (what a run was) is never stored, only
-- the verdict.
--
-- Definitions are deliberately NOT a table. They are code (a catalog module),
-- so a definition change ships with the detector that decides it and a
-- tampered client cannot invent a new id — the insert path refuses ids the
-- catalog does not know.
--
-- ONE ROW PER (player, game, achievement). Unlocking is idempotent by
-- construction: a second unlock is `on conflict do nothing`, so no retry,
-- double-submit or replayed request can make a second row, and the API only
-- reports an achievement as "newly unlocked" when its insert returned a row.

create table if not exists player_achievements (
  player_id      text        not null,
  game_slug      text        not null,
  achievement_id text        not null,
  unlocked_at    timestamptz not null default now(),
  -- The run that earned it, when a run did (a cumulative/meta achievement
  -- earned by owning others still records the run that completed the set).
  -- Display metadata only; never joined for logic.
  run_id         text,
  primary key (player_id, game_slug, achievement_id)
);

-- Profile read: everything a player owns for one game, and per-game counts.
create index if not exists player_achievements_by_player
  on player_achievements (player_id, game_slug, unlocked_at desc);

-- A submitted run, keyed by the id the game minted once for that run.
--
-- This is what makes a RETRY idempotent at the response level, not just the
-- row level: the unique key already stops duplicate ownership rows, but a
-- client that retried a timed-out request would otherwise hear "nothing new"
-- the second time and never show the unlock. Storing the verdict per run_id
-- lets the API answer the retry with the original unlock list.
--
-- Deliberately NOT the run telemetry itself: only the outcome. The run summary
-- is attacker-controlled input and storing it would make this a claims log
-- rather than a dedupe table.
create table if not exists game_achievement_runs (
  player_id    text        not null,
  game_slug    text        not null,
  run_id       text        not null,
  -- Achievement ids this submission unlocked (empty array when none).
  unlocked_ids jsonb       not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (player_id, game_slug, run_id)
);
