-- Per-game driver profiles: the name, face and pinned cars a player has set up
-- inside one cabinet.
--
-- A sibling of game_loadouts (035) rather than a column on it, and the split is
-- deliberate. That table answers "what car is this player driving"; this answers
-- "who is this player, in this cabinet". They are written by different screens
-- at different times, they are read by different surfaces — a lobby wants the
-- car, a VS card wants the face — and folding them together would make the
-- loadout table's name a lie the first time anything else stored a name in it.
--
-- **This is a cabinet alias, never an account.** Canonical identity belongs to
-- the factory shell (`accounts` / `player_profiles`): this row is the three
-- letters a player puts on an arcade machine, defaulted from their factory
-- profile name and editable without touching it. Nothing here may be treated as
-- authentication, and nothing that writes here may write back to the shell's
-- profile.
--
-- The document is jsonb for game_loadouts' reason: a profile has no independent
-- parts. It is always read and written whole, nothing joins to a favourite car,
-- and its shape is validated server-side by the cabinet's catalog before it
-- lands, so the column holds sanitized data rather than whatever a client
-- posted.
--
-- Generic on game_slug on purpose. This is not a speed-demon table: any cabinet
-- wanting a server-backed driver identity registers a catalog and reuses it.
--
-- Unlike a garage there is nothing private in here — a name, a face and five
-- favourite cars are a boast, the same argument the run records make — so the
-- read side is public and the write side is self-only.

create table if not exists game_driver_profiles (
  player_id   text        not null,
  game_slug   text        not null,
  profile     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (player_id, game_slug)
);

-- Reads by player are the primary key. This supports the other direction — "who
-- has a driver set up in this cabinet" — which a roster or a recently-active
-- surface would want.
create index if not exists game_driver_profiles_by_game
  on game_driver_profiles (game_slug, updated_at desc);
