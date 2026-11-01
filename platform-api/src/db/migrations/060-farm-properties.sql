-- Existing animals remain on the farm where their owner currently lives.
alter table farm_livestock add column if not exists property_id text;
update farm_livestock l set property_id = coalesce(
  (select g.garage->>'lot' from game_loadouts g where g.player_id = l.player_id and g.game_slug = 'farm'),
  'meadow'
) where property_id is null;
alter table farm_livestock alter column property_id set default 'meadow';
alter table farm_livestock alter column property_id set not null;
create index if not exists farm_livestock_property on farm_livestock (player_id, property_id, state);
