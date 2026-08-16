-- Level-earned cosmetics became durable entitlements after the two ladders had
-- already been paying them out on the client only, where they could be equipped
-- but never saved. Backfill every account that has already crossed a node so
-- launch order cannot erase a reward, the same job 040 did for vouchers.
--
-- Thresholds are the XP needed to *be* that level on each ladder's own curve
-- (player: base 400 step 150; track: base 200 step 100). They are literals here
-- because a migration must keep meaning what it meant on the day it ran, even
-- after services/progression-catalog.mts retunes a curve.
--
-- The player ladder is scored on the account total in game_xp_profiles; the
-- bowler ladder on the best single track in game_xp_tracks, since every bound
-- mastery reward is a global cosmetic earned by reaching the level with any one
-- bowler.

insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  profiles.player_id,
  profiles.game_slug,
  reward.entitlement_id,
  reward.kind,
  'player-level',
  'backfill-041'
from game_xp_profiles profiles
join (values
  ('ball-trail:lime-shock', 'ball-trail', 400),
  ('strike-burst:gold-star', 'strike-burst', 950),
  ('ball-trail:emerald-glow', 'ball-trail', 2500),
  ('strike-burst:emerald-impact', 'strike-burst', 3500),
  ('ball-trail:mint-frost', 'ball-trail', 5950),
  ('strike-burst:mint-crackle', 'strike-burst', 7400),
  ('ball-trail:cyan-pulse', 'ball-trail', 10750),
  ('strike-burst:cyan-flash', 'strike-burst', 12650),
  ('ball-trail:electric-blue', 'ball-trail', 16900),
  ('strike-burst:electric-blue', 'strike-burst', 19250),
  ('ball-trail:indigo-drive', 'ball-trail', 24400),
  ('strike-burst:indigo-ring', 'strike-burst', 27200),
  ('ball-trail:violet-haze', 'ball-trail', 33250),
  ('strike-burst:violet-bloom', 'strike-burst', 36500),
  ('ball-trail:purple-plasma', 'ball-trail', 43450),
  ('strike-burst:purple-nova', 'strike-burst', 47150),
  ('ball-trail:magenta-pop', 'ball-trail', 55000),
  ('strike-burst:magenta-blast', 'strike-burst', 59150),
  ('ball-trail:hot-pink', 'ball-trail', 63450),
  ('strike-burst:hot-pink-pop', 'strike-burst', 67900)
) as reward(entitlement_id, kind, min_xp)
  on profiles.xp >= reward.min_xp
where profiles.game_slug = 'yam-bowling'
on conflict (player_id, game_slug, entitlement_id) do nothing;

insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  best.player_id,
  best.game_slug,
  reward.entitlement_id,
  reward.kind,
  'bowler-level',
  'backfill-041'
from (
  select player_id, game_slug, max(xp) as xp
  from game_xp_tracks
  where game_slug = 'yam-bowling'
  group by player_id, game_slug
) as best
join (values
  ('ball-trail:red-neon', 'ball-trail', 200),
  ('strike-burst:ember', 'strike-burst', 900),
  ('ball-trail:orange-flare', 'ball-trail', 2000),
  ('ball-trail:sky-blue', 'ball-trail', 6500),
  ('badge:laser-focus', 'badge', 9000),
  ('ball-trail:gold-rush', 'ball-trail', 13500),
  ('title:pin-chaser', 'title', 18900),
  ('badge:precision-bowler', 'badge', 23000),
  ('ball-trail:diamond-white', 'ball-trail', 27500),
  ('badge:lane-legend', 'badge', 40500)
) as reward(entitlement_id, kind, min_xp)
  on best.xp >= reward.min_xp
on conflict (player_id, game_slug, entitlement_id) do nothing;
