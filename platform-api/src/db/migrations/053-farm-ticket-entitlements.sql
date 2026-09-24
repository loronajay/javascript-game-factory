-- Preserve Farm choices made while every catalog row was development-granted.
-- Paid ground/decor already present in a saved farm becomes durable ownership
-- before entitlement-aware loadout normalization is enabled.

with saved_ids as (
  select loadout.player_id, decor.value ->> 'itemId' as entitlement_id
  from game_loadouts loadout
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(loadout.garage -> 'decor') = 'array'
      then loadout.garage -> 'decor' else '[]'::jsonb end
  ) as decor(value)
  where loadout.game_slug = 'farm'

  union

  select loadout.player_id, loadout.garage ->> 'ground' as entitlement_id
  from game_loadouts loadout
  where loadout.game_slug = 'farm'
), valid_ids as (
  select distinct player_id, entitlement_id
  from saved_ids
  where entitlement_id ~ '^(decor\.[a-z0-9-]+\.[a-z0-9-]+|ground\.[a-z0-9-]+)$'
    and entitlement_id not in (
      'ground.meadow', 'decor.fence.post-rail', 'decor.fence.gate',
      'decor.building.barn', 'decor.plant.oak', 'decor.plant.soil-patch',
      'decor.prop.hay-bale', 'decor.prop.trough', 'decor.prop.doghouse',
      'decor.prop.tennis-ball', 'decor.prop.rope-toy', 'decor.prop.bone',
      'decor.prop.pet-tombstone'
    )
)
insert into game_entitlements (
  player_id, game_slug, entitlement_id, kind, source, source_id, quantity
)
select
  player_id, 'farm', entitlement_id, 'catalog-item',
  'migration', 'farm-free-catalog-v1', 1
from valid_ids
on conflict (player_id, game_slug, entitlement_id) do nothing;

