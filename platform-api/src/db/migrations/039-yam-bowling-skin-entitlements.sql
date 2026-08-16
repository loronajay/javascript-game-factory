-- Canon is Yam Bowling's only starter skin. Preserve an exact non-Canon skin
-- only when an older server garage already had it selected before this catalog
-- boundary tightened. This is a one-time authoritative grant from server-owned
-- state; no client claim or blanket catalog grandfathering is involved.

with valid_bowlers(slug) as (
  values
    ('daisy-monroe'), ('nia-brooks'), ('tessa-quinn'), ('zuri-banks'), ('amara-reed'),
    ('claire-rowan'), ('lumi-vega'), ('cassy-cruz'), ('fiona-vale'), ('nyx-calder'),
    ('skye-bennett'), ('carmen-blaze'), ('piper-hart'), ('reina-sato'), ('imani-cole'),
    ('sabrina-wilde'), ('aaliyah-storm'), ('mina-park'), ('scarlett-voss'), ('sage-holloway'),
    ('hazel-ward'), ('roxy-chen'), ('naomi-okafor'), ('echo-sterling'), ('kevya-desai'),
    ('lillie-chen'), ('marisol-cruz'), ('rei-nakamura'), ('simone-carter'), ('talia-dodson')
), saved_skin_selections as (
  select
    loadout.player_id,
    bowler.key as bowler_slug,
    split_part(bowler.value ->> 'skin', ':', 3) as skin_id
  from game_loadouts loadout
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(loadout.garage -> 'bowlers') = 'object' then loadout.garage -> 'bowlers'
      else '{}'::jsonb
    end
  ) as bowler(key, value)
  where loadout.game_slug = 'yam-bowling'
    and bowler.value ->> 'skin' = 'skin:' || bowler.key || ':' || split_part(bowler.value ->> 'skin', ':', 3)

  union

  select
    loadout.player_id,
    loadout.garage #>> '{featured,bowlerSlug}' as bowler_slug,
    loadout.garage #>> '{featured,skinId}' as skin_id
  from game_loadouts loadout
  where loadout.game_slug = 'yam-bowling'
), migration_grants as (
  select distinct selection.player_id, selection.bowler_slug, selection.skin_id
  from saved_skin_selections selection
  join valid_bowlers on valid_bowlers.slug = selection.bowler_slug
  where selection.skin_id in ('swimsuit', 'maid')
)
insert into game_entitlements (
  player_id,
  game_slug,
  entitlement_id,
  kind,
  source,
  source_id,
  quantity
)
select
  player_id,
  'yam-bowling',
  'skin:' || bowler_slug || ':' || skin_id,
  'skin',
  'migration',
  'yam-bowling-equipped-skin-v1',
  1
from migration_grants
on conflict (player_id, game_slug, entitlement_id) do nothing;
