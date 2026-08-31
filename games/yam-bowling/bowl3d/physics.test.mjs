import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { create3dPhysics, auditPinTip, isKnockedPin, TUNING } from './physics.mjs';
import { matchUses3d, localBowlingStyle } from './mode.mjs';
import { LANE_TOP, PIN_COM, SHOT_X_SCALE, DECK_END_Z } from './geometry.mjs';
import * as CANNON from './vendor/cannon-es.mjs';

const require = createRequire(import.meta.url);
const Physics = require('../physics-core.js');
const Balls = require('../ball-core.js').BALLS;
const engine = create3dPhysics(Physics);
const shot = { position: 0, aim: 0, hook: 0, power: .8, ...Balls[0] };
function finish(simulation) {
  for (let i = 0; i < 180 * 9 && !simulation.complete; i++) engine.stepSimulation(simulation, 1 / 180);
  assert.equal(simulation.complete, true, 'every shot has a bounded resolution time');
  return engine.knockedCount(simulation);
}

test('3D is opt-in local exhibition only, regardless of stale setup preferences', () => {
  const session = { setup: { bowlingStyle: '3d' } };
  assert.equal(localBowlingStyle(session), '3d');
  for (const key of ['campaignMatch', 'tournamentMatch', 'tutorialMatch']) {
    assert.equal(localBowlingStyle({ ...session, [key]: true }), 'arcade');
  }
  assert.equal(matchUses3d({ match: { bowlingStyle: '3d', playType: 'cpu' } }), true);
  assert.equal(matchUses3d({ match: { bowlingStyle: '3d', playType: 'hotseat' } }), true);
  assert.equal(matchUses3d({ onlineMatch: true, match: { bowlingStyle: '3d', playType: 'cpu' } }), false);
  assert.equal(matchUses3d({ match: { bowlingStyle: '3d', playType: 'campaign' } }), false);
  assert.equal(localBowlingStyle({ setup: { bowlingStyle: 'unknown' } }), 'arcade');
});

test('a real 3D straight shot hits the rack and reports canonical pin IDs', () => {
  const rack = Physics.createRack();
  const initial = structuredClone(rack);
  const sim = engine.createSimulation(rack, shot);
  const knocked = finish(sim);
  assert.ok(knocked >= 1 && knocked <= 10, `pinfall was ${knocked}`);
  assert.equal(sim.startStanding, 10);
  assert.equal(sim.pins.filter(p => !p.standing).length, knocked);
  assert.deepEqual(rack, initial, 'physics must not mutate the previous rack snapshot');
  assert.deepEqual(sim.pins.map(p => p.id), initial.map(p => p.id));
});

test('soft, extreme-hook, and gutter shots always resolve without stale bodies', () => {
  for (const variant of [{ power: .08 }, { position: .46, aim: .45, hook: 1 }, { position: -.46, aim: -.45, hook: -1 }]) {
    const sim = engine.createSimulation(Physics.createRack(), { ...shot, ...variant });
    const down = finish(sim);
    if (variant.aim) {
      assert.notEqual(sim.ball.gutterSide, 0);
      assert.equal(down, 0, 'a gutter ball cannot bounce onto the rack');
    }
  }
});

test('each roll owns a fresh world and rebuilds only canonical survivors', () => {
  const first = engine.createSimulation(Physics.createRack(), shot);
  finish(first);
  const survivors = engine.clearFallen(first.pins);
  assert.ok(survivors.every(p => p.standing && p.x === p.homeX && p.y === p.homeY));
  const second = engine.createSimulation(survivors, shot);
  assert.notEqual(second.world, first.world);
  assert.deepEqual(second.entries.map(p => p.id), survivors.map(p => p.id));
  assert.equal(second.startStanding, survivors.length);
  assert.ok(second.entries.every(p => !first.entries.some(old => old.body === p.body)));
  assert.equal(second.world.bodies.filter(b => b.mass > 0).length, survivors.length + 1);
});

test('fall evidence stays down even if the pin bounces upright again', () => {
  const sim = engine.createSimulation(Physics.createRack(), shot);
  const pin = sim.entries[0];
  pin.body.quaternion.setFromEuler(Math.PI / 2, 0, 0);
  auditPinTip(pin, 1 / 180);
  pin.body.quaternion.setFromEuler(0, 0, 0);
  auditPinTip(pin, 1 / 180);
  assert.equal(isKnockedPin(pin), true);
});

test('identical inputs give identical fixed-step pinfall and positions', () => {
  const a = engine.createSimulation(Physics.createRack(), shot);
  const b = engine.createSimulation(Physics.createRack(), shot);
  assert.equal(finish(a), finish(b));
  assert.deepEqual(a.pins, b.pins);
});

test('a pocket line carries the rack', () => {
  // Before the deck was tuned, no line anywhere on the lane struck: pins were
  // launched in a fifth of their proper weight, sailed between their
  // neighbours and left a best of seven. A strike has to be reachable.
  // Aim is now the Arcade line slope rather than a speed-dependent launch
  // velocity. Approach from the left and place the new line in the pocket.
  const pocket = { ...shot, position: 0, aim: .42, hook: 1, power: 1 };
  pocket.position = .4 / SHOT_X_SCALE - Physics.trajectoryX(Physics.RACK_FRONT_Z, pocket);
  assert.ok(Math.abs(pocket.position) <= .46);
  const sim = engine.createSimulation(Physics.createRack(), pocket);
  assert.equal(finish(sim), 10);
});

test('a struck pin neither balloons nor stops dead', () => {
  // The tuning contract in one measurement. Real gravity floated a struck pin
  // three units up and fourteen down the lane; a literal geometric scale
  // factor stopped it in a third of a second, because Cannon bills friction
  // once per contact and the pin is eight spheres.
  const sim = engine.createSimulation(Physics.createRack(), shot);
  sim.world.removeBody(sim.body);
  const pin = sim.entries[0];
  for (const other of sim.entries.slice(1)) sim.world.removeBody(other.body);
  pin.body.allowSleep = false;
  pin.body.velocity.set(0, 1.2, -15);
  pin.body.angularVelocity.set(-9, 0, 0);
  const startZ = pin.body.position.z;
  let peak = 0;
  for (let i = 0; i < 180 * 2.5; i++) {
    sim.world.step(1 / 180);
    peak = Math.max(peak, pin.body.position.y - (LANE_TOP + PIN_COM));
  }
  const travel = startZ - pin.body.position.z;
  assert.ok(travel > 3.5 && travel < 9, `a struck pin carried ${travel.toFixed(1)} units`);
  assert.ok(peak < 1.2, `a struck pin rose ${peak.toFixed(2)} units`);
  assert.ok(pin.body.velocity.length() < .6, 'a struck pin comes to rest inside the roll');
});

function soloPin() {
  // One pin alone on the deck, so nothing but the lane is acting on it.
  const sim = engine.createSimulation(Physics.createRack(), shot);
  sim.world.removeBody(sim.body);
  const pin = sim.entries[0];
  for (const other of sim.entries.slice(1)) sim.world.removeBody(other.body);
  pin.body.allowSleep = false;
  return { sim, pin };
}

test('a pushed pin skids before it topples', () => {
  // The deck used to hold a pin's base with about a hundred times the friction
  // its own weight can generate, because Cannon caps friction per contact as an
  // impulse and a standing pin rests on four of them: a pin arrived at 6
  // units/s and lost 41% of it in five milliseconds, pivoting on the spot. A
  // struck pin has to be knocked out of the rack, not tipped over in place.
  const { sim, pin } = soloPin();
  pin.body.velocity.set(0, 0, -6);
  const startZ = pin.body.position.z;
  const up = new CANNON.Vec3(), Y = new CANNON.Vec3(0, 1, 0);
  let keptSpeed = 0, tippedAt = null;
  for (let i = 0; i < 180 * 3; i++) {
    sim.world.step(1 / 180);
    if (i === 9) keptSpeed = -pin.body.velocity.z / 6;
    pin.body.quaternion.vmult(Y, up);
    if (tippedAt === null && up.y < .72) tippedAt = i / 180;
  }
  assert.ok(keptSpeed > .85, `a pin kept ${(keptSpeed * 100).toFixed(0)}% of its speed off the first contact`);
  assert.ok(tippedAt > .25, `a pin went over after ${tippedAt}s`);
  assert.ok(startZ - pin.body.position.z > 2.5, `a pushed pin carried ${(startZ - pin.body.position.z).toFixed(1)} units`);
});

test('the rack cannot anchor the ball', () => {
  // The same friction cap sank a third of the ball's momentum into the lane
  // through the head pin's base, which is what read as a ball lighter than the
  // pins. A 4.4:1 mass ratio drives through a rack.
  const sim = engine.createSimulation(Physics.createRack(), shot);
  let atRack = null, slowest = Infinity;
  for (let i = 0; i < 180 * 9 && !sim.complete; i++) {
    engine.stepSimulation(sim, 1 / 180);
    if (atRack === null && sim.pins.some(p => p.contacted)) atRack = sim.body.velocity.length();
    if (atRack !== null && sim.body.position.z > DECK_END_Z) slowest = Math.min(slowest, sim.body.velocity.length());
  }
  assert.ok(slowest / atRack > .7, `the ball kept ${(slowest / atRack * 100).toFixed(0)}% of its speed through the rack`);
});

test('a pin is billed for its own silhouette, not its bounding box', () => {
  const { pin } = soloPin();
  // Cannon reads a compound body's inertia off the world AABB, which for eight
  // spheres on a stick is a solid block a quarter too stubborn to rotate.
  const boxed = new CANNON.Body({ mass: TUNING.PIN_MASS, shape: new CANNON.Box(new CANNON.Vec3(.285, .89, .285)) });
  assert.ok(pin.body.inertia.x < boxed.inertia.x * .9);
  assert.ok(pin.body.inertia.y < pin.body.inertia.x, 'a pin spins about its own axis far more freely than it topples');
});
