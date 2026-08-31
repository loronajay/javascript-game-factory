import assert from 'node:assert/strict';
import { MAPS } from '../scripts/maps.js';
import { createWorldMap } from '../scripts/map.js';
import { buildMapLayout, gridToWorld, worldToGrid, getSpawnYaw } from '../scripts/map-3d.js';

for (const def of MAPS) {
  const map = createWorldMap(def.raw);
  const before = JSON.stringify(map);
  const layout = buildMapLayout(map, def.world3d);
  assert.deepEqual(layout, buildMapLayout(map, def.world3d), 'dressing is deterministic');
  assert.equal(layout.walls.length, def.raw.join('').split('#').length - 1);
  assert.equal(layout.floors.length + layout.walls.length, map.width * map.height);
  assert.equal(layout.doors.length, map.doors.length);
  assert.equal(layout.goals.length, 25);
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const world = gridToWorld(map, x + 0.5, y + 0.5);
    assert.deepEqual(worldToGrid(map, world.x, world.z), { x, y });
  }
  for (const start of [map.start, map.start2]) {
    const yaw = getSpawnYaw(map, start);
    const x = start.x - Math.round(Math.sin(yaw));
    const y = start.y - Math.round(Math.cos(yaw));
    assert.notEqual(map.tiles[y][x], '#', 'spawn faces a corridor');
  }
  assert.equal(JSON.stringify(map), before, 'layout never mutates gameplay');
}
assert.throws(() => createWorldMap([]), /grid/i);
assert.throws(() => createWorldMap(['###', '#S', '###']), /rectangular/i);
assert.throws(() => createWorldMap(['###', '#?#', '###']), /symbol/i);
assert.throws(() => createWorldMap(['S..', '...']), /border|enclosed/i);
console.log('Illuminauts 3D map tests passed.');
