import assert from 'node:assert/strict';
import { createGameState } from '../scripts/state.js';
import { MAPS } from '../scripts/maps.js';
import { updateAliens, getAlienPose, getLaserGatePhase, getTurretPhase, isHazardAt } from '../scripts/hazards.js';
import { applyHazardDamage } from '../scripts/player-damage.js';
import { consumeSoundEvents } from '../scripts/audio.js';

const cycle = { cycleMs: 1000, warningMs: 200, activeMs: 300, offsetMs: 0 };
for (const phase of [getLaserGatePhase, getTurretPhase]) {
  assert.equal(phase(cycle, 0), 'warning'); assert.equal(phase(cycle, 199), 'warning');
  assert.equal(phase(cycle, 200), 'active'); assert.equal(phase(cycle, 499), 'active');
  assert.equal(phase(cycle, 500), 'cooldown'); assert.equal(phase(cycle, 1000), 'warning');
}
const alien = { route: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }], index: 0, stepMs: 500, lastStepAt: 0 };
assert.deepEqual(getAlienPose(alien, 250), { px: 3, py: 2.5, yaw: -Math.PI / 2 });
const a = { aliens: [structuredClone(alien)] }, b = { aliens: [structuredClone(alien)] };
for (let t = 0; t <= 2750; t += 50) updateAliens(a, t);
updateAliens(b, 2750); assert.equal(a.aliens[0].index, b.aliens[0].index);
const hazards = { aliens: [alien], laserGates: [], turrets: [] };
assert.equal(isHazardAt(hazards, 2, 2, 250, { px: 3.05, py: 2.5 }), true, 'collision follows rendered patrol pose');
assert.equal(isHazardAt(hazards, 2, 2, 250, { px: 2.1, py: 2.5 }), false);
for (const map of MAPS) {
  const state = createGameState(MAPS.indexOf(map));
  assert.equal(state.rules.hazardsEnabled, true);
  assert.ok(state.hazards.aliens.length > 0 || map.hazards.aliens.length === 0);
  assert.notEqual(state.hazards.aliens, map.hazards.aliens);
  assert.ok(state.hazards.turrets.every(t => Array.isArray(t.beamTiles)));
  for (const alien of state.hazards.aliens) alien.route.forEach((p, i) => {
    assert.notEqual(state.map.tiles[p.y][p.x], '#');
    const next = alien.route[(i + 1) % alien.route.length];
    assert.ok(Math.abs(p.x - next.x) + Math.abs(p.y - next.y) <= 1, 'no teleport across broken route');
  });
}
const state = createGameState();
state.hazards = { aliens: [], laserGates: [{ ...cycle, tiles: [{ x: state.player.tx, y: state.player.ty }] }], turrets: [] };
state.player.chips = 2; state.map.doors[0].open = true; state.player.powerUntil = 30000;
applyHazardDamage(state, 250); assert.equal(state.player.hearts, 2);
assert.deepEqual(consumeSoundEvents(state).map(e => e.cue), ['grunt', 'hit']);
applyHazardDamage(state, 260); assert.equal(state.player.hearts, 2);
applyHazardDamage(state, 2250); assert.equal(state.player.hearts, 1);
state.player.px += 0.1; applyHazardDamage(state, 4250);
assert.equal(state.player.hearts, 3); assert.equal(state.player.px, state.player.spawnTx + 0.5);
assert.equal(state.player.powerUntil, 0); assert.equal(state.player.chips, 2); assert.equal(state.map.doors[0].open, true);
assert.equal(state.player.pitch, 0); assert.ok(state.online.outbox.some(e => e.type === 'player_died'));
console.log('Illuminauts 3D hazards and respawn tests passed.');
