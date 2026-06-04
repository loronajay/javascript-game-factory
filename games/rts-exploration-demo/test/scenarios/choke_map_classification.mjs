import { createNarrowChokeWorld, result } from './helpers.mjs';

const { map, units } = createNarrowChokeWorld();
const corridor = [];
for (let x = 9; x <= 18; x++) corridor.push(units.chokeMap.getTileInfo(x, 6));
const room = units.chokeMap.getTileInfo(4, 6);
const chokeCount = corridor.filter((cell) => cell.isChoke).length;

result(chokeCount >= 6 && room.columns >= 2, {
  scenario: 'choke_map_classification',
  chokeCount,
  corridorColumns: corridor.map((cell) => cell.columns),
  roomColumns: room.columns,
  mapSize: [map.width, map.height],
});
