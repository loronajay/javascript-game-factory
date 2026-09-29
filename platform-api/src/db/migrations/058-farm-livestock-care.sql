-- Livestock care (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 2).
--
-- 057 creates these columns on a fresh database; this adds them to one that
-- ran 057 before they existed. `care` is the animal's hunger and the goods it
-- is working up to as of the last checkpoint; `end_cause` and `ended_minute`
-- say how and when (farm minute) a gone animal left.

alter table farm_livestock add column if not exists care jsonb not null default '{}'::jsonb;
alter table farm_livestock add column if not exists end_cause text;
alter table farm_livestock add column if not exists ended_minute double precision;
