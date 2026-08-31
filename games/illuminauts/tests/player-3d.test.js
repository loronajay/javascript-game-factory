import assert from 'node:assert/strict';
import { createGameState } from '../scripts/state.js';
import { updatePlayer } from '../scripts/player.js';
import { getFirstPersonIntent, applyLookInput } from '../scripts/input-3d.js';

function fixture() {
  const state = createGameState();
  state.map = { width: 9, height: 7, tiles: [
    '#########', '#.......#', '#.......#', '#.......#', '#.......#', '#.......#', '#########',
  ].map(r => r.split('')), pickups: [], doors: [], goals: [] };
  Object.assign(state.player, { px: 3.5, py: 3.5, tx: 3, ty: 3, yaw: 0, pitch: 0 });
  state.input = { held: new Set(), justPressed: new Set(), lookX: 0, lookY: 0 };
  state.hazards = { aliens: [], laserGates: [], turrets: [] };
  return state;
}
function tick(state, n = 60) { for (let i = 0; i < n; i++) updatePlayer(state, (i + 1) * 1000 / 60, 1000 / 60); }
const state = fixture();
assert.equal(state.rules.hazardsEnabled, true);
assert.deepEqual(state.hazards, { aliens: [], laserGates: [], turrets: [] });
state.input.held.add('KeyW');
tick(state);
assert.ok(state.player.py < 2.1 && state.player.py > 1.8);
assert.equal(state.player.px, 3.5);
const east = fixture(); east.player.yaw = -Math.PI / 2; east.input.held.add('KeyW'); tick(east);
assert.ok(east.player.px > 4.9 && east.player.px < 5.1);
assert.ok(Math.abs(east.player.py - 3.5) < 1e-9);
const intent = getFirstPersonIntent({ held: new Set(['KeyW', 'KeyD']) }, 0);
assert.ok(Math.abs(Math.hypot(intent.dx, intent.dy) - 1) < 1e-9);
assert.equal(getFirstPersonIntent({ held: new Set(), justPressed: new Set(['KeyW']) }, 0).dy, -1, 'short taps survive until a simulation tick');
const look = fixture(); look.input.lookX = 100; look.input.lookY = 100000; applyLookInput(look.player, look.input, 1 / 60);
assert.ok(look.player.yaw < 0 && Math.abs(look.player.pitch) <= 1.18);
assert.equal(look.input.lookX, 0);
const wall = fixture(); wall.map.tiles[3][4] = '#'; wall.input.held.add('KeyD'); tick(wall, 300);
assert.ok(wall.player.px < 3.86, 'body cannot clip through a wall');
const corner = fixture(); corner.map.tiles[2][4] = '#'; corner.input.held = new Set(['KeyW', 'KeyD']); tick(corner, 20);
assert.ok(!(corner.player.px > 4 && corner.player.py < 3), 'cannot cut through corners');
const door = fixture(); door.map.doors.push({ id: 'door', x: 4, y: 3, open: false }); door.input.held.add('KeyD'); tick(door, 60);
assert.equal(door.map.doors[0].open, false);
door.player.chips = 1; tick(door, 30);
assert.equal(door.map.doors[0].open, true); assert.equal(door.player.chips, 0);
assert.equal(door.online.outbox.filter(e => e.type === 'door_opened').length, 1);
const pickup = fixture(); pickup.map.pickups = [{ id: 'chip', x: 3, y: 3, type: 'chip', active: true }, { id: 'power', x: 3, y: 3, type: 'powerCell', active: true }]; tick(pickup, 2);
assert.equal(pickup.player.chips, 1); assert.ok(pickup.player.powerUntil > 15000);
const sweep = fixture(); sweep.solo.mode = 'sweep'; sweep.solo.beaconLocked = true; sweep.solo.dataCoreTotal = 1;
sweep.map.goals = [{ x: 3, y: 3 }]; tick(sweep, 1); assert.equal(sweep.player.won, false);
sweep.map.pickups = [{ id: 'core', x: 3, y: 3, type: 'dataCore', active: true }]; tick(sweep, 1);
assert.equal(sweep.solo.beaconLocked, false); assert.equal(sweep.player.won, true);
const sprint = fixture(); sprint.input.held = new Set(['KeyW', 'ShiftLeft']); tick(sprint, 20);
assert.ok(sprint.player.stamina < 100); const stamina = sprint.player.stamina; sprint.input.held.clear(); tick(sprint, 20); assert.ok(sprint.player.stamina > stamina);
const blockedSprint = fixture(); blockedSprint.player.px = 7.84; blockedSprint.input.held = new Set(['KeyD', 'ShiftLeft']); tick(blockedSprint, 60); assert.equal(blockedSprint.player.stamina, 100);
const won = fixture(); won.player.won = true; won.input.held.add('KeyW'); tick(won); assert.equal(won.player.py, 3.5);
const a = fixture(), b = fixture(); a.input.held.add('KeyW'); b.input.held.add('KeyW');
tick(a, 60); for (let i = 0; i < 120; i++) updatePlayer(b, (i + 1) * 1000 / 120, 1000 / 120);
assert.ok(Math.abs(a.player.py - b.player.py) < 1e-9, 'speed is independent of tick subdivision');
console.log('Illuminauts first-person movement tests passed.');
