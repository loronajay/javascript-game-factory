-- Fishing at the Cove (planning-docs/FARM_FISHING_PLAN.md,
-- services/farm-fish-catalog.mts, db/farm-fishing.mts).
--
-- An ANGLER row is a player's tackle box and Fishing record: the rods owned,
-- lures by count, the tub of worms, and the XP and lifetime counts. It lives
-- beside the farm, not in the farm document, so a cast never has to carry or
-- lock a whole farm, and it is server-owned outright: only a cast, a landing
-- or a tackle purchase changes it.
--
-- A CAST row is a line in the water: the bite the server rolled for it (the
-- species, where it ranks among its kind, its colour), when it bites, and
-- how it ended. One open cast per player at a time.
--
-- A FISH row is one specimen, forever: its exact weight and length, how it
-- was landed, its colour, where it was caught and where it is now (in the
-- creel, sold, released...). Two Koi are two rows. A fish caught from a
-- shadow names that shadow, and a player catches each shadow once.

create table if not exists farm_anglers (
  player_id   text        primary key,
  tackle      jsonb       not null,
  fishing     jsonb       not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists farm_fish_casts (
  cast_id     text             not null,
  player_id   text             not null,
  zone        text             not null,
  shadow_id   text,
  species_id  text             not null,
  rank        double precision not null,
  variant     text             not null,
  bait        text             not null,
  rod_id      text             not null,
  strength    double precision not null,
  bite_at     timestamptz      not null,
  expires_at  timestamptz      not null,
  status      text             not null default 'open',
  created_at  timestamptz      not null default now(),
  settled_at  timestamptz,
  primary key (player_id, cast_id)
);

create index if not exists farm_fish_casts_recent on farm_fish_casts (player_id, created_at desc);
create unique index if not exists farm_fish_casts_one_open on farm_fish_casts (player_id) where status = 'open';

create table if not exists farm_fish (
  fish_id     text        primary key,
  player_id   text        not null,
  species_id  text        not null,
  weight_g    integer     not null check (weight_g > 0),
  length_mm   integer     not null check (length_mm > 0),
  size_class  text        not null,
  grade       text        not null,
  variant     text        not null default 'normal',
  zone        text        not null,
  shadow_id   text,
  cast_id     text        not null,
  state       text        not null default 'creel',
  locked      boolean     not null default false,
  caught_at   timestamptz not null default now(),
  settled_at  timestamptz
);

create index if not exists farm_fish_player_state on farm_fish (player_id, state, caught_at desc);
create unique index if not exists farm_fish_player_shadow on farm_fish (player_id, shadow_id) where shadow_id is not null;
create index if not exists farm_fish_species_weight on farm_fish (species_id, weight_g desc);
create index if not exists farm_fish_caught on farm_fish (caught_at desc);
