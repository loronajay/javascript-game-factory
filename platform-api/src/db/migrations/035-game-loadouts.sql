-- Per-game cosmetic loadouts: the car a player has built, and the configs they
-- have saved for it.
--
-- Modelled on ranked_profiles (022) rather than on game_entitlements (019),
-- because this is *configuration*, not ownership. Entitlements answer "what may
-- this player use"; this answers "what have they set up". Keeping them apart is
-- what lets the roster be free today and earnable later without touching a row
-- of saved paint.
--
-- The garage document is jsonb rather than a table of presets. A preset has no
-- independent identity — nothing joins to one, nothing queries across them, and
-- it is always read and written whole as one player's garage. Normalising it
-- would buy nothing and cost a join on every read. Its shape is validated
-- server-side by services/speed-demon-catalog before it ever lands here, so the
-- column holds sanitized data rather than whatever a client posted.
--
-- Generic on game_slug on purpose: this is not a speed-demon table. Any cabinet
-- wanting server-backed cosmetics gets a catalog module and reuses this.
--
-- Determinism note: a loadout is cosmetic and must never enter an online state
-- hash or authoritative race state. It is synced in-band exactly like a nickname.

create table if not exists game_loadouts (
  player_id   text        not null,
  game_slug   text        not null,
  garage      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (player_id, game_slug)
);

-- Opponents read a loadout by player during a match, so the lookup is by the
-- primary key and needs no extra index. This one supports the "who has set up a
-- car for this game" direction, which the ladder/profile surfaces will want.
create index if not exists game_loadouts_by_game
  on game_loadouts (game_slug, updated_at desc);
