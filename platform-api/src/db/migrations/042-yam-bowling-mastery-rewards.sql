-- The mastery ladder gained bindings for the nodes that needed no new art:
-- three surplus bursts, one new trail, and the two per-bowler titles that make
-- levels 29 and 30 mean something. 041 backfilled the nodes bound before them;
-- this backfills the nodes bound since. 041 is left exactly as it ran.
--
-- Thresholds are the XP needed to *be* that level on each ladder's own curve,
-- as literals, for the reason 041 gives: a migration must keep meaning what it
-- meant on the day it ran even after a curve is retuned.

insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  profiles.player_id,
  profiles.game_slug,
  'strike-burst:lime-pop',
  'strike-burst',
  'player-level',
  'backfill-042'
from game_xp_profiles profiles
where profiles.game_slug = 'yam-bowling'
  and profiles.xp >= 72500
on conflict (player_id, game_slug, entitlement_id) do nothing;

-- Global mastery cosmetics: earned by reaching the level with any one bowler,
-- so they read the player's best single track.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  best.player_id,
  best.game_slug,
  reward.entitlement_id,
  reward.kind,
  'bowler-level',
  'backfill-042'
from (
  select player_id, game_slug, max(xp) as xp
  from game_xp_tracks
  where game_slug = 'yam-bowling'
  group by player_id, game_slug
) as best
join (values
  ('strike-burst:red-supernova', 'strike-burst', 3500),
  ('strike-burst:sky-shatter', 'strike-burst', 25200),
  ('strike-burst:diamond-spark', 'strike-burst', 27500),
  ('ball-trail:perfect-line', 'ball-trail', 37700)
) as reward(entitlement_id, kind, min_xp)
  on best.xp >= reward.min_xp
on conflict (player_id, game_slug, entitlement_id) do nothing;

-- The two titles belong to the bowler who earned them, so unlike everything
-- above they are per-track: one row per qualifying track, not per player.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  tracks.player_id,
  tracks.game_slug,
  replace(reward.entitlement_id, '{track}', tracks.track_id),
  reward.kind,
  'bowler-level',
  'backfill-042'
from game_xp_tracks tracks
join (values
  ('title:{track}:nameplate', 'title', 43400),
  ('title:{track}:master', 'title', 46400)
) as reward(entitlement_id, kind, min_xp)
  on tracks.xp >= reward.min_xp
where tracks.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;
