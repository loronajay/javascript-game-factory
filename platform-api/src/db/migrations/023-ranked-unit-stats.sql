-- Ranked per-unit stats + match history (Phase 2 of the ranked feature plan).
--
-- Per-unit records are credited only when BOTH members' final-board reports are
-- present and agree (see ranked-unit-stats.mjs), mirroring the ELO dual-attestation.
-- ELO resolution is unchanged; unit-stat crediting is a side effect of the existing
-- resolve path only. Squads + each side's per-unit report are stored on the match row
-- for history display and agreement verification.

create table if not exists ranked_unit_stats (
  player_id  text not null,
  game_slug  text not null,
  unit_type  text not null,
  games      int  not null default 0,
  wins       int  not null default 0,
  kills      int  not null default 0,
  survivals  int  not null default 0,   -- unit alive at match end
  primary key (player_id, game_slug, unit_type)
);

alter table ranked_matches add column if not exists squad_a       jsonb;
alter table ranked_matches add column if not exists squad_b       jsonb;
alter table ranked_matches add column if not exists unit_report_a jsonb;
alter table ranked_matches add column if not exists unit_report_b jsonb;
