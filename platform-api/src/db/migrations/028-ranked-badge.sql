-- The badge a player has chosen to display.
--
-- It lives on ranked_profiles beside title/avatar because it is the same kind of thing:
-- the cosmetic identity that renders on a nameplate. What a player has EARNED still
-- lives entirely in the badge layer (derived from game_entitlements, or awarded into
-- game_player_badges); this column only records which of those they picked, and the
-- write path validates the pick against the earned set before storing it.

alter table ranked_profiles
  add column if not exists badge_id text;
