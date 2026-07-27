-- Highest rating a player has ever held, per game.
--
-- game_ratings.rating is the CURRENT rating and moves both ways. The ladder badges
-- ("reached Gold", "reached Grandmaster") are high-water marks, so they cannot be read
-- off the current rating: a losing streak would silently un-earn a badge the player
-- genuinely achieved, which is exactly what the badge layer's monotonic rule forbids.
--
-- peak_rating only ever rises (see the upserts in db/ratings.mts and db/ranked-match.mts),
-- which makes it a safe fact for an auto-awarded badge to qualify on.
--
-- Backfilled from the current rating: for an existing player that is the best evidence
-- available, and it is generous in the right direction — anyone sitting at or above a
-- tier today earns its badge on their next profile read.

alter table game_ratings
  add column if not exists peak_rating integer;

update game_ratings
   set peak_rating = rating
 where peak_rating is null;
