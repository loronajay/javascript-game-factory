-- Races at Windrush Downs (services/farm-race-policy.mts, db/farm-races.mts;
-- planning-docs/FARM_RIDING_PLAN.md).
--
-- One row per race, from the moment it is posted at the race board to the day
-- it is settled or taken down. The columns are what the server needs to find a
-- race and move it on (its status and its clock); `state` is the race as the
-- policy describes it: its entrants with the horse each rides (as the API
-- computed it), the bets, the verified result and what was paid.
--
-- `farm_race_ledger` is every ticket a race took from or paid to a player, so
-- the daily limits are one indexed sum.

create table if not exists farm_races (
  id             text        primary key,
  poster_id      text        not null,
  course_id      text        not null,
  stake          integer     not null default 0,
  max_riders     integer     not null,
  status         text        not null,
  state          jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  gate_closes_at timestamptz,
  starts_at      timestamptz,
  deadline_at    timestamptz,
  settled_at     timestamptz
);

create index if not exists farm_races_live on farm_races (status, created_at desc) where status in ('open', 'closing', 'running');
create index if not exists farm_races_recent on farm_races (created_at desc);

create table if not exists farm_race_ledger (
  race_id    text        not null,
  player_id  text        not null,
  kind       text        not null,
  amount     integer     not null,
  created_at timestamptz not null default now()
);

create index if not exists farm_race_ledger_by_player on farm_race_ledger (player_id, created_at);
