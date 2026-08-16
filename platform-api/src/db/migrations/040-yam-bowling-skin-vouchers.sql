-- Player ladder vouchers shipped after XP progression. Backfill accounts that
-- had already crossed either milestone so launch order cannot erase a reward.
-- 9,000 XP is level 10; 51,000 XP is level 25 on the Yam player curve.

insert into game_inventory_items (player_id, game_slug, item_id, quantity)
select
  player_id,
  game_slug,
  'skin-voucher',
  case when xp >= 51000 then 2 else 1 end
from game_xp_profiles
where game_slug = 'yam-bowling'
  and xp >= 9000
on conflict (player_id, game_slug, item_id) do update
  set quantity = greatest(game_inventory_items.quantity, excluded.quantity),
      updated_at = now();
