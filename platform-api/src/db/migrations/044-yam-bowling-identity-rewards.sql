-- The remaining label-only ladder rungs now bind to identity cosmetics that
-- reuse shipped art or CSS: four player titles, a profile icon, two victory
-- poses, three player-card treatments and two entrances. Earlier migrations
-- remain immutable; this one catches existing accounts up to the new catalog.
--
-- Thresholds are literal XP totals for the player curve (base 400, step 150)
-- and bowler curve (base 200, step 100), so this migration retains its meaning
-- if either curve is retuned later.

insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  profiles.player_id,
  profiles.game_slug,
  reward.entitlement_id,
  reward.kind,
  'player-level',
  'backfill-044'
from game_xp_profiles profiles
join (values
  ('title:lane-regular', 'title', 1650),
  ('title:house-favourite', 'title', 14700),
  ('title:lane-veteran', 'title', 30150),
  ('title:yam-legend', 'title', 72500)
) as reward(entitlement_id, kind, min_xp)
  on profiles.xp >= reward.min_xp
where profiles.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;

-- Entrances are global rewards. Reaching their rung with any bowler grants the
-- one account-wide entitlement, so the backfill reads the best mastery track.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  best.player_id,
  best.game_slug,
  reward.entitlement_id,
  reward.kind,
  'bowler-level',
  'backfill-044'
from (
  select player_id, game_slug, max(xp) as xp
  from game_xp_tracks
  where game_slug = 'yam-bowling'
  group by player_id, game_slug
) as best
join (values
  ('entrance:spotlight', 'entrance', 10400),
  ('entrance:champion', 'entrance', 35000)
) as reward(entitlement_id, kind, min_xp)
  on best.xp >= reward.min_xp
on conflict (player_id, game_slug, entitlement_id) do nothing;

-- These rewards belong to the bowler whose track crossed the rung. Mint one
-- entitlement per qualifying track, substituting that track into the id.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  tracks.player_id,
  tracks.game_slug,
  replace(reward.entitlement_id, '{track}', tracks.track_id),
  reward.kind,
  'bowler-level',
  'backfill-044'
from game_xp_tracks tracks
join (values
  ('profile-icon:{track}:canon', 'profile-icon', 500),
  ('victory-pose:{track}:spotlight', 'victory-pose', 1400),
  ('player-card:{track}:rivalry', 'player-card', 4400),
  ('player-card:{track}:signature', 'player-card', 7700),
  ('victory-pose:{track}:champion', 'victory-pose', 17000),
  ('player-card:{track}:elite', 'player-card', 29900)
) as reward(entitlement_id, kind, min_xp)
  on tracks.xp >= reward.min_xp
where tracks.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;
