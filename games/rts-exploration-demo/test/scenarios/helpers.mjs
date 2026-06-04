import { GameMap } from '../../src/map.js';
import { UnitManager } from '../../src/units.js';
import { TILE } from '../../src/map.js';

export function createWorld() {
  const map = new GameMap();
  const units = new UnitManager(map);
  return { map, units };
}

export function advance(units, ticks = 180, dt = 1 / 60) {
  for (let i = 0; i < ticks; i++) units.update(dt, i * dt);
}

export function result(ok, fields = {}) {
  const payload = { ok, ...fields };
  console.log(JSON.stringify(payload, null, 2));
  if (!ok) process.exitCode = 1;
}

export function reservationCounts(units) {
  return {
    staticAttackSlots: countMapEntries(units.attackSlotReservations),
    mobileEngagementSlots: countMapEntries(units.mobileEngagementReservations),
    routeReservations: units.routeReservations?.size ?? 0,
  };
}

function countMapEntries(map) {
  let total = 0;
  for (const value of map.values()) total += value.size ?? 0;
  return total;
}


export function createNarrowChokeWorld() {
  const map = new GameMap(28, 14);
  map.tiles.fill(TILE.WALL);
  map.destructibles.clear();
  map.resourceNodes = [];
  for (let y = 3; y <= 10; y++) {
    for (let x = 2; x <= 8; x++) map.set(x, y, TILE.FLOOR);
    for (let x = 19; x <= 25; x++) map.set(x, y, TILE.FLOOR);
  }
  for (let x = 8; x <= 19; x++) map.set(x, 6, TILE.FLOOR);

  const units = new UnitManager(map);
  units.units = [];
  units.selectedIds.clear();
  units.attackSlotReservations.clear();
  units.mobileEngagementReservations.clear();
  units.routeReservations.clear();
  units.nextId = 1;
  units.chokeMap.rebuild();

  const starts = [
    map.tileCenter(3, 4), map.tileCenter(3, 6), map.tileCenter(3, 8),
    map.tileCenter(5, 4), map.tileCenter(5, 6), map.tileCenter(5, 8),
  ];
  const grunts = starts.map((p) => units.spawnUnit('grunt', 1, p.x, p.y));
  const target = map.tileCenter(23, 6);
  return { map, units, grunts, target };
}
