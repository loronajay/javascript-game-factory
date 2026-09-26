import test from "node:test";
import assert from "node:assert/strict";

import { ARENA_RADIUS, createMatch, resetRound, stepMatch } from "../scripts/match.js";

const pets = [
  { instanceId: "hero", name: "Biscuit", speciesId: "pet.corgi", paletteId: "standard", stats: { speed: 50, strength: 50, size: 1 } },
  { instanceId: "cpu-1", name: "Pepper", speciesId: "pet.duck", paletteId: "standard", stats: { speed: 50, strength: 50, size: 1 } },
];

const petWithStats = (instanceId, stats) => ({
  instanceId,
  name: instanceId,
  speciesId: "pet.corgi",
  paletteId: "standard",
  stats,
});

test("holding a consistent direction builds momentum and turning sharply interrupts it", () => {
  const match = createMatch(pets);
  for (let index = 0; index < 60; index += 1) stepMatch(match, { hero: { x: 1, y: 0 } }, 1 / 60);
  const runner = match.players[0];
  const builtMomentum = runner.momentum;
  assert.ok(builtMomentum > 0.7);
  assert.ok(Math.hypot(runner.vx, runner.vy) > 130);

  stepMatch(match, { hero: { x: -1, y: 0 } }, 1 / 60);
  assert.ok(runner.momentum < builtMomentum);
});

test("canonical pet stats change deterministic match physics", () => {
  const slow = createMatch([
    petWithStats("hero", { speed: 0, strength: 50, size: 0.7 }),
    pets[1],
  ]);
  const fast = createMatch([
    petWithStats("hero", { speed: 100, strength: 50, size: 1.1 }),
    pets[1],
  ]);
  for (let tick = 0; tick < 60; tick += 1) {
    stepMatch(slow, { hero: { x: 1, y: 0 } }, 1 / 60);
    stepMatch(fast, { hero: { x: 1, y: 0 } }, 1 / 60);
  }

  assert.ok(fast.players[0].x > slow.players[0].x + 10, "Speed must create a measurable travel advantage");
  assert.ok(fast.players[0].radius > slow.players[0].radius * 1.5, "Current size must change the collision body");

  const bumpVelocity = (strength) => {
    const match = createMatch([
      petWithStats("hero", { speed: 50, strength, size: 1 }),
      pets[1],
    ]);
    Object.assign(match.players[0], { x: -20, y: 0, vx: 140, facingX: 1, facingY: 0 });
    Object.assign(match.players[1], { x: 20, y: 0, vx: 0, vy: 0 });
    stepMatch(match, { hero: { x: 1, y: 0, bump: true } }, 1 / 60);
    return match.players[1].vx;
  };

  assert.ok(bumpVelocity(100) > bumpVelocity(0) * 1.08, "Strength must create a measurable bump advantage");
});

test("a moving bump produces more knockback than a standing bump", () => {
  const standing = createMatch(pets);
  standing.players[0].x = -20;
  standing.players[0].y = 0;
  standing.players[1].x = 20;
  standing.players[1].y = 0;
  stepMatch(standing, { hero: { x: 1, y: 0, bump: true } }, 1 / 60);
  const standingPush = standing.players[1].vx;
  assert.ok(standing.players[1].impact > 0);

  const running = createMatch(pets);
  running.players[0].x = -20;
  running.players[0].y = 0;
  running.players[0].vx = 180;
  running.players[0].facingX = 1;
  running.players[1].x = 20;
  running.players[1].y = 0;
  stepMatch(running, { hero: { x: 1, y: 0, bump: true } }, 1 / 60);

  assert.ok(running.players[1].vx > standingPush * 1.5);
  assert.ok(running.players[1].vx > 350, "a full-speed bump should launch its target");
  assert.ok(running.players[0].vx < 180, "the attacker should feel a short recoil on impact");
  assert.ok(running.players[0].bumpCooldown > 0);
});

test("one bump cannot apply its launch impulse to the same target twice", () => {
  const match = createMatch(pets);
  const attacker = match.players[0];
  const target = match.players[1];
  attacker.x = -20;
  attacker.y = 0;
  attacker.facingX = 1;
  attacker.facingY = 0;
  target.x = 20;
  target.y = 0;

  stepMatch(match, { hero: { x: 1, y: 0, bump: true } }, 1 / 60);
  const firstLaunch = target.vx;
  attacker.x = -20;
  target.x = 20;
  stepMatch(match, { hero: { x: 1, y: 0 } }, 1 / 60);

  assert.ok(target.vx <= firstLaunch, "contact during the same bump must not stack another launch");
});

test("the last pet on the island wins the round and the first to three wins takes the match", () => {
  const match = createMatch(pets);
  for (let win = 0; win < 3; win += 1) {
    match.players[1].x = ARENA_RADIUS + 80;
    stepMatch(match, {}, 1 / 60);
    assert.equal(match.roundWinnerId, "hero");
    if (win < 2) resetRound(match);
  }

  assert.equal(match.phase, "match-over");
  assert.equal(match.matchWinnerId, "hero");
  assert.equal(match.players[0].wins, 3);
});

test("round resets retain score but restore every pet to the platform", () => {
  const match = createMatch(pets);
  match.players[0].wins = 1;
  match.players[1].eliminated = true;
  resetRound(match);

  assert.equal(match.players[0].wins, 1);
  assert.ok(match.players.every((player) => !player.eliminated && Math.hypot(player.x, player.y) < ARENA_RADIUS));
});

test("eliminated pets continue through a visible fall instead of vanishing", () => {
  const match = createMatch(pets);
  match.players[1].x = ARENA_RADIUS + 80;
  stepMatch(match, {}, 1 / 60);
  const eliminated = match.players[1];
  assert.equal(eliminated.eliminated, true);
  assert.equal(eliminated.fallHeight, 0);

  for (let index = 0; index < 30; index += 1) stepMatch(match, {}, 1 / 60);
  assert.ok(eliminated.fallHeight > 0);
  assert.ok(eliminated.splashAge >= 0);
});
