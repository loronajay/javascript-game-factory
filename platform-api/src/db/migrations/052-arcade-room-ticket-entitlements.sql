-- Preserve room choices made while the Arcade Room catalog was development-
-- granted. Once ticket ownership is enforced, every non-starter id already in
-- a saved room becomes a durable entitlement before the new server runs.

with saved_ids as (
  select loadout.player_id, decor.value ->> 'itemId' as entitlement_id
  from game_loadouts loadout
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(loadout.garage -> 'decor') = 'array'
      then loadout.garage -> 'decor' else '[]'::jsonb end
  ) as decor(value)
  where loadout.game_slug = 'arcade-room'

  union

  select loadout.player_id, surface.entitlement_id
  from game_loadouts loadout
  cross join lateral (values
    (loadout.garage #>> '{surfaces,floor}'),
    (loadout.garage #>> '{surfaces,wall}'),
    (loadout.garage #>> '{surfaces,ceiling}'),
    (loadout.garage #>> '{surfaces,trim}')
  ) as surface(entitlement_id)
  where loadout.game_slug = 'arcade-room'
), valid_ids as (
  select distinct player_id, entitlement_id
  from saved_ids
  where entitlement_id ~ '^(decor\.[a-z0-9-]+\.[a-z0-9-]+|(floor|wall|ceiling|trim)\.[a-z0-9-]+)$'
    and entitlement_id not in (
      'decor.neon.strip', 'decor.sign.custom-block', 'decor.poster.custom', 'decor.rug.round',
      'decor.light.spot', 'decor.light.tube', 'decor.furniture.bench', 'decor.furniture.stool',
      'decor.furniture.table', 'decor.furniture.beanbag', 'decor.prop.jukebox', 'decor.prop.plant',
      'decor.prop.trash-can', 'decor.wall.clock', 'decor.wall.shelf', 'decor.wall.exit-sign',
      'decor.ceiling.fan', 'floor.showroom-slate', 'wall.paint-midnight', 'ceiling.tile-dark',
      'trim.steel-navy'
    )
)
insert into game_entitlements (
  player_id, game_slug, entitlement_id, kind, source, source_id, quantity
)
select
  player_id, 'arcade-room', entitlement_id, 'catalog-item',
  'migration', 'arcade-room-free-catalog-v1', 1
from valid_ids
on conflict (player_id, game_slug, entitlement_id) do nothing;
