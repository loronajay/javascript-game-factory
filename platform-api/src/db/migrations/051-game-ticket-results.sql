-- Deduplicated cabinet results settled through POST /games/:slug/results.
-- One row per (player, game, result id) holds the ticket verdict, so a retry
-- replays the stored verdict instead of re-evaluating against changed rules.
-- The ledger's own (player_id, transaction_key) uniqueness is the second fence.
--
-- duration_ms and submitted_at feed the settlement's time-budget fence: a new
-- result may not claim more play time than has passed since the player's
-- previous one (see db/game-results).

create table if not exists game_ticket_results (
  player_id        text        not null references players(player_id) on delete cascade,
  game_slug        text        not null,
  result_id        text        not null,
  result           jsonb       not null default '{}'::jsonb,
  duration_ms      int         not null default 0 check (duration_ms >= 0),
  ticket_awarded   int         not null default 0 check (ticket_awarded >= 0),
  ticket_breakdown jsonb       not null default '{}'::jsonb,
  submitted_at     timestamptz not null default now(),
  primary key (player_id, game_slug, result_id)
);

create index if not exists game_ticket_results_player_recent
  on game_ticket_results (player_id, submitted_at desc);
