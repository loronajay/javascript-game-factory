-- Server-backed ranked identity (Phase 1 of the ranked feature plan).
--
-- Retires the game-local "ranked name" hack: name/title + avatar now live on the
-- server keyed on (player_id, game_slug) so other players can read them after a
-- match. localStorage becomes a read cache/offline fallback only, never the source
-- of truth. Ratings/records stay in game_ratings (018); brokered matches stay in
-- ranked_matches (021). This table only owns cosmetic ranked identity.
--
-- Determinism note: title/avatar are cosmetic and derived. They must never enter
-- the online state hash or authoritative battle state — they are synced in-band
-- exactly like nicknames.

create table if not exists ranked_profiles (
  player_id    text        not null,
  game_slug    text        not null,
  title        text,                    -- ranked-specific tagline / commander line
  avatar_unit  text,                    -- unit type id, e.g. 'necromancer'; null = default
  avatar_skin  text,                    -- optional skin id; null = base portrait
  updated_at   timestamptz not null default now(),
  primary key (player_id, game_slug)
);
