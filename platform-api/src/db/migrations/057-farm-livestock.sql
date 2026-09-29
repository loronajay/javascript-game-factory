-- Livestock on the farm (planning-docs/FARM_LIVESTOCK_PLAN.md,
-- services/farm-livestock-catalog.mts, db/farm-livestock.mts).
--
-- One row per animal, forever: its species, its coat, and the four stats the
-- server rolled for it (Yield, Quality, Growth, Hardiness) — the stats decide
-- what its goods, its meat and its young are worth, so they are never in the
-- client-saved farm document. `born_minute` is the farm-clock minute it was
-- born at (its age is farm time), `home_id` the stall, barn floor or pen it
-- lives in (null while it waits for one), and `state` where it is now: alive
-- on the farm, or gone (sold to the butcher, dead, traded away) with the row
-- kept as its record.

create table if not exists farm_livestock (
  animal_id    text             primary key,
  player_id    text             not null,
  species_id   text             not null,
  name         text             not null,
  gender       text             not null,
  coat_id      text             not null,
  stats        jsonb            not null,
  born_minute  double precision not null default 0,
  home_id      text,
  state        text             not null default 'alive',
  parents      jsonb,
  origin       text             not null default 'dealer',
  created_at   timestamptz      not null default now(),
  updated_at   timestamptz      not null default now()
);

create index if not exists farm_livestock_player_state on farm_livestock (player_id, state, created_at);
