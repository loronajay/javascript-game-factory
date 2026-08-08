-- Per-game, per-board personal bests: one row per player per leaderboard board,
-- holding their best run and the input log that produced it.
--
-- This is the *second* rating source on the platform. The first is game_ratings
-- (018), which is head-to-head ELO; this one is a solo score board, where a run
-- is measured against a number rather than against an opponent. Both feed the
-- same ladder registry (services/ladder-catalog) — see the `source` field there.
-- Keeping them in separate tables is deliberate: an ELO row is a running total
-- that moves both ways, a record row is a high-water mark that only improves,
-- and squeezing both into one table would mean one of the two lying about what
-- its number means.
--
-- Generic on game_slug on purpose, exactly like game_loadouts (035): this is not
-- a speed-demon table. Any cabinet with a time or score board registers boards
-- in services/leaderboard-catalog and reuses this.
--
-- ONE ROW PER (player, game, board) — the player's *best*, not their history.
-- A leaderboard asks "who is fastest", which needs one row per player; keeping
-- every attempt would make the board query a group-by over an unbounded table
-- for no gain. If a run history is ever wanted it is a separate append-only
-- table, not a relaxation of this primary key.
--
-- DIRECTION IS NOT STORED HERE. Whether a bigger `value` is better depends on
-- the board (a distance race wants the lowest time, a time attack the greatest
-- distance) and lives in the catalog, which is also what upserts read to decide
-- whether an incoming run beats the stored one. A direction column would be a
-- second copy of that fact, free to drift from the one the code branches on.

create table if not exists game_run_records (
  player_id    text        not null,
  game_slug    text        not null,
  board_id     text        not null,
  -- The measured result, in the board's own unit: milliseconds for a timed
  -- board, centimetres for a distance board. Integer so ordering is exact —
  -- a leaderboard tiebreak on a float is a coin toss between two equal runs.
  value        bigint      not null,
  -- Display metadata for the board row. Denormalized on purpose: a board query
  -- must not need a join per row to say what car someone drove.
  model_id     text,
  track_id     text,
  -- The run's canonical input log (sim/input-log.js), as submitted. This is what
  -- makes the record verifiable *later*: the sim is deterministic, so replaying
  -- the log reproduces the value or proves it was invented. Stored compressed as
  -- jsonb rather than parsed into rows because nothing queries inside it.
  input_log    jsonb,
  -- False until a replay pass has reproduced `value` from `input_log`. Rows land
  -- unverified: the submission path bounds-checks plausibility but does not yet
  -- replay, so this is the honest state of the evidence rather than a default
  -- nobody maintains. A board may show or filter on it; see db/run-records.mts.
  verified     boolean     not null default false,
  -- Set when a replay pass ran, whatever its verdict. Distinguishes "not yet
  -- checked" from "checked and rejected" — without it a failed verification is
  -- indistinguishable from a fresh row and would be re-checked forever.
  verified_at  timestamptz,
  recorded_at  timestamptz not null default now(),
  primary key (player_id, game_slug, board_id)
);

-- The board query ranks every record within one (game_slug, board_id). The
-- primary key leads on player_id, which does not serve that scan, so a top-N
-- read would sort the whole table per request — the same reasoning as
-- game_ratings_ladder_idx (025).
--
-- Two indexes because the two board directions want opposite orders and an
-- index scan cannot run backwards through a mixed one. Both carry player_id as
-- a final tiebreak so the ordering is total and `rank()` is stable between a
-- board row and the same player's profile placement.
create index if not exists game_run_records_board_asc
  on game_run_records (game_slug, board_id, value asc, recorded_at asc, player_id asc);

create index if not exists game_run_records_board_desc
  on game_run_records (game_slug, board_id, value desc, recorded_at asc, player_id asc);

-- Supports the "verify the oldest unverified runs" sweep a later replay pass
-- will want, without scanning verified rows.
create index if not exists game_run_records_unverified
  on game_run_records (game_slug, recorded_at asc)
  where verified = false;
