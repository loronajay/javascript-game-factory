import { GameMap } from './src/map.js';
import { UnitManager } from './src/units.js';

const map = new GameMap();
const units = new UnitManager(map);
const grunts = units.units.filter(u => u.team === 1 && u.type === 'grunt').slice(0, 4);
const target = units.units.find(u => u.team === 2 && u.type === 'scout');
if (grunts.length < 3 || !target) throw new Error('missing smoke units');
const ok = units.attackUnitsUnit(grunts.map(u => u.id), target, 1);
if (!ok) throw new Error('attack command failed');
for (let i = 0; i < 180; i++) units.update(1/60, i/60);
const attacking = grunts.filter(u => u.attackTarget?.id === target.id);
const slots = grunts.map(u => u.mobileEngagementSlot?.index).filter(v => Number.isFinite(v));
console.log(JSON.stringify({
  attacking: attacking.length,
  states: grunts.map(u => u.state),
  slots,
  uniqueSlots: new Set(slots).size,
  debugSlots: grunts.map(u => u.debug.engagementSlot?.index ?? null),
  hp: target.hp
}, null, 2));
