import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIGHTER_ARCHETYPES } from '../src/characters/archetypes.js';
import {
  createFighter,
  getFighterActionLock,
  tickFighterState,
} from '../src/engine/fighter-state.js';
import {
  bubblesOverlap,
  getActiveHitbubbles,
  getHurtbubbles,
  resolveCombat,
} from '../src/engine/combat.js';
import { createInputBuffer, normalizeInputFrame } from '../src/engine/input-buffer.js';
import { createTrainingMatch } from '../src/scenes/training-match.js';

test('falcon archetype exposes platform fighter movement and attack tuning', () => {
  const falcon = FIGHTER_ARCHETYPES.falcon;

  assert.equal(falcon.displayName, 'Captain Falcon');
  assert.equal(falcon.maxJumps, 2);
  assert.equal(falcon.runSpeed, 5.05);
  assert.equal(falcon.dashInitialSpeed, 2.45);
  assert.equal(falcon.hurtbubbles.length, 9);
  assert.equal(falcon.attacks.neutral.id, 'gentleman-jab');
  assert.equal(falcon.attacks.forward.id, 'raptor-lunge');
});

test('fighter can spend exactly one airborne double jump before landing', () => {
  const fighter = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: -40 },
  });
  fighter.grounded = false;
  fighter.jumpsUsed = 1;
  fighter.velocity.y = 5;
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ jump: true }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'airborne');
  assert.equal(fighter.jumpsUsed, 2);
  assert.equal(fighter.velocity.y, fighter.archetype.doubleJumpVelocity);

  input.push(normalizeInputFrame({ jump: false }));
  input.push(normalizeInputFrame({ jump: true }));
  tickFighterState(fighter, input);

  assert.equal(fighter.jumpsUsed, 2);
  assert.equal(fighter.velocity.y, fighter.archetype.doubleJumpVelocity);
});

test('attack state locks out movement during startup, active, and recovery frames', () => {
  const fighter = createFighter({ id: 'p1', archetype: FIGHTER_ARCHETYPES.falcon });
  const input = createInputBuffer();

  input.push(normalizeInputFrame({ attack: true }));
  tickFighterState(fighter, input);

  assert.equal(fighter.state.name, 'attack_neutral');
  assert.equal(getFighterActionLock(fighter), true);
  assert.deepEqual(getActiveHitbubbles(fighter), []);

  for (let i = 0; i < fighter.archetype.attacks.neutral.startup; i += 1) {
    input.push(normalizeInputFrame({}));
    tickFighterState(fighter, input);
  }

  assert.equal(getActiveHitbubbles(fighter).length, 2);

  const total = fighter.archetype.attacks.neutral.totalFrames;
  while (fighter.attack && fighter.attack.frame < total) {
    input.push(normalizeInputFrame({}));
    tickFighterState(fighter, input);
  }

  assert.equal(fighter.attack, null);
  assert.equal(getFighterActionLock(fighter), false);
});

test('hurtbubbles and active hitbubbles use named world-space circles', () => {
  const attacker = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 10, y: 0 },
    facing: 1,
  });
  const defender = createFighter({
    id: 'p2',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 42, y: 0 },
    facing: -1,
  });
  attacker.attack = {
    name: 'neutral',
    definition: attacker.archetype.attacks.neutral,
    frame: attacker.archetype.attacks.neutral.startup,
    hitVictims: new Set(),
  };

  const hitbubbles = getActiveHitbubbles(attacker);
  const hurtbubbles = getHurtbubbles(defender);

  assert.equal(hitbubbles[0].ownerId, 'p1');
  assert.equal(hitbubbles.every(bubble => Number.isFinite(bubble.radius) && bubble.radius > 0), true);
  assert.deepEqual(hurtbubbles.map(bubble => bubble.id), [
    'head',
    'chest',
    'hips',
    'front-arm',
    'back-arm',
    'front-thigh',
    'back-thigh',
    'front-foot',
    'back-foot',
  ]);
  assert.equal(hurtbubbles.some(hurtbubble => bubblesOverlap(hitbubbles[0], hurtbubble)), true);
});

test('crouch compacts hurtbubbles to match the lowered fighter pose', () => {
  const defender = createFighter({
    id: 'p2',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: 0 },
    facing: 1,
  });

  const standing = getHurtbubbles(defender);
  defender.state.name = 'crouch';
  const crouching = getHurtbubbles(defender);
  const standingHead = standing.find(bubble => bubble.id === 'head');
  const crouchingHead = crouching.find(bubble => bubble.id === 'head');
  const standingFoot = standing.find(bubble => bubble.id === 'front-foot');
  const crouchingFoot = crouching.find(bubble => bubble.id === 'front-foot');

  assert.equal(crouchingHead.y > standingHead.y, true);
  assert.equal(crouchingHead.ry < standingHead.ry, true);
  assert.equal(Math.abs(crouchingFoot.y - standingFoot.y) < 4, true);

  const highStandingPoke = {
    x: standingHead.x,
    y: standingHead.y,
    radius: 7,
  };

  assert.equal(standing.some(hurtbubble => bubblesOverlap(highStandingPoke, hurtbubble)), true);
  assert.equal(crouching.some(hurtbubble => bubblesOverlap(highStandingPoke, hurtbubble)), false);
});

test('combat resolution applies damage, knockback, hitstun, and one hit per attack swing', () => {
  const attacker = createFighter({
    id: 'p1',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 0, y: 0 },
    facing: 1,
  });
  const defender = createFighter({
    id: 'p2',
    archetype: FIGHTER_ARCHETYPES.falcon,
    position: { x: 28, y: 0 },
    facing: -1,
  });
  attacker.attack = {
    name: 'neutral',
    definition: attacker.archetype.attacks.neutral,
    frame: attacker.archetype.attacks.neutral.startup,
    hitVictims: new Set(),
  };

  const first = resolveCombat([attacker, defender]);

  assert.equal(first.length, 1);
  assert.equal(defender.damage, attacker.archetype.attacks.neutral.hitbubbles[0].damage);
  assert.equal(defender.hitstunFrames > 0, true);
  assert.equal(defender.velocity.x > 0, true);
  assert.equal(defender.velocity.y < 0, true);

  const second = resolveCombat([attacker, defender]);
  assert.deepEqual(second, []);
});

test('training match advances attacks into combat collisions', () => {
  const match = createTrainingMatch({
    p1Archetype: FIGHTER_ARCHETYPES.falcon,
    p2Archetype: FIGHTER_ARCHETYPES.falcon,
  });
  match.fighters.p1.position.x = -18;
  match.fighters.p2.position.x = 22;

  match.input.p1.push(normalizeInputFrame({ attack: true }));
  match.input.p2.push(normalizeInputFrame({}));

  for (let i = 0; i < 6; i += 1) {
    match.tick();
  }

  assert.equal(match.lastHits.length, 1);
  assert.equal(match.fighters.p2.damage > 0, true);
});

test('training match preserves recent active hitbubbles for human-readable debug rendering', () => {
  const match = createTrainingMatch({
    p1Archetype: FIGHTER_ARCHETYPES.falcon,
    p2Archetype: FIGHTER_ARCHETYPES.falcon,
  });

  match.input.p1.push(normalizeInputFrame({ attack: true }));
  match.input.p2.push(normalizeInputFrame({}));

  for (let i = 0; i < 6; i += 1) {
    match.tick();
  }

  assert.equal(match.debugHitbubbles.length > 0, true);

  for (let i = 0; i < 12; i += 1) {
    match.tick();
  }

  assert.equal(match.debugHitbubbles.length, 0);
});
