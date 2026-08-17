-- The two ladders were retuned again: badges stopped being level rewards, the
-- mastery rungs that paid them now pay titles, the player rungs that paid them
-- now pay Emote Vouchers, and mastery gained a room, two trails and an emote.
-- 041 and 042 backfilled the nodes bound before this; they are left exactly as
-- they ran. This backfills the nodes bound since.
--
-- The badges those mastery rungs used to grant are deliberately NOT revoked.
-- An account that earned `badge:laser-focus` at mastery 13 keeps it: the id
-- never moved, so the row stays valid, and taking back a reward already shown
-- to a player to tidy a taxonomy is not a trade worth making.
--
-- Thresholds are the XP needed to *be* that level on each ladder's own curve
-- (player: base 400 step 150; track: base 200 step 100). They are literals here
-- for the reason 041 gives: a migration must keep meaning what it meant on the
-- day it ran, even after services/progression-catalog.mts retunes a curve.

-- Emote Vouchers are inventory, not entitlements, so they are counted rather
-- than granted once. A player already past several rungs is owed one per rung,
-- which is why this sums the qualifying levels instead of inserting a row.
insert into game_inventory_items (player_id, game_slug, item_id, quantity)
select
  profiles.player_id,
  profiles.game_slug,
  'emote-voucher',
  (case when profiles.xp >= 4650 then 1 else 0 end)
    + (case when profiles.xp >= 21750 then 1 else 0 end)
    + (case when profiles.xp >= 39900 then 1 else 0 end)
    + (case when profiles.xp >= 72500 then 1 else 0 end)
from game_xp_profiles profiles
where profiles.game_slug = 'yam-bowling'
  and profiles.xp >= 4650
on conflict (player_id, game_slug, item_id)
  do update set quantity = game_inventory_items.quantity + excluded.quantity,
                updated_at = now();

-- Global mastery cosmetics: earned by reaching the level with any one bowler,
-- so they read the player's best single track.
insert into game_entitlements (player_id, game_slug, entitlement_id, kind, source, source_id)
select
  best.player_id,
  best.game_slug,
  reward.entitlement_id,
  reward.kind,
  'bowler-level',
  'backfill-043'
from (
  select player_id, game_slug, max(xp) as xp
  from game_xp_tracks
  where game_slug = 'yam-bowling'
  group by player_id, game_slug
) as best
join (values
  ('room:fireside-lodge', 'room', 2700),
  ('ball-trail:rose-gold', 'ball-trail', 5400),
  ('title:pocket-hunter', 'title', 9000),
  ('room:desert-vista', 'room', 11900),
  ('emote:game-face', 'emote', 15200),
  ('strike-burst:rose-gold', 'strike-burst', 20900),
  ('title:lane-reader', 'title', 23000),
  ('room:deep-sea-suite', 'room', 32400),
  ('title:shotmaker', 'title', 40500),
  ('ball-trail:eclipse', 'ball-trail', 46400),
  ('strike-burst:eclipse-corona', 'strike-burst', 46400)
) as reward(entitlement_id, kind, min_xp)
  on best.xp >= reward.min_xp
on conflict (player_id, game_slug, entitlement_id) do nothing;
