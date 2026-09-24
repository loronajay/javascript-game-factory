-- Persist the settlement verdict beside the deduplicated achievement run.
-- Existing runs default to zero and therefore cannot be replayed after this
-- migration to retroactively mint repeatable or achievement tickets.

alter table game_achievement_runs
  add column if not exists ticket_awarded int not null default 0 check (ticket_awarded >= 0),
  add column if not exists ticket_breakdown jsonb not null default '{}'::jsonb;
