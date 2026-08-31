import assert from 'node:assert/strict';
import { MAPS } from '../scripts/maps.js';
import { createWorldMap } from '../scripts/map.js';
import { validateTraversal } from '../scripts/map-validation.js';
for (const def of MAPS) {
  const map = createWorldMap(def.raw);
  for (const start of [map.start, map.start2]) for (const mode of ['sprint', 'sweep']) {
    assert.equal(validateTraversal(map, start, mode).solvable, true, `${def.id} ${JSON.stringify(start)} ${mode}`);
  }
}
const blocked = { width: 5, height: 3, tiles: ['#####', '#...#', '#####'].map(r=>r.split('')),
  doors: [{x:2,y:1}], pickups: [{x:3,y:1,type:'chip'}], goals:[{x:3,y:1}] };
assert.equal(validateTraversal(blocked,{x:1,y:1}).solvable,false, 'a key behind its own door cannot be used');
blocked.pickups[0].x = 1;
assert.equal(validateTraversal(blocked,{x:1,y:1}).solvable,true);
console.log('All six maps are solvable from both starts in Sprint and Sweep.');
