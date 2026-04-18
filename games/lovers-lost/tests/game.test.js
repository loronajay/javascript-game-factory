// game.test.js — run with: node game.test.js
import {
  createGameState,
  processAction,
  processMissedObstacles,
  classifyAutoResolvedObstacle,
  contactActionForPlayer,
  resolveContactAction,
  spikeHeightAtOffset,
  spikeTouchesPlayer,
  birdTouchesPlayer,
  buildDebugCollisionSnapshot,
  debugEnabledFromSearch,
  debugObstacleTypeFromSearch,
  toggleDebugHotkey,
  startJump,
  tickJumpArc,
  tickFrame,
  advancePhaseState,
  nextActionForSide,
  initGame,
  summarizeObstacleOutcome,
  JUMP_VY,
  JUMP_GRAVITY,
  HARD_CUTOFF_FRAMES,
  END_PHASE_HOLD_FRAMES,
} from '../game.js';

import { createPlayer, distPerFrame, SPEED_FLOOR, STARTING_SPEED, RUN_DISTANCE } from '../scripts/player.js';
import { createObstacle, generateWarmup, WAVE_COUNTS } from '../scripts/obstacles.js';
import { OUTCOMES } from '../scripts/scoring.js';
import { createSounds } from '../scripts/sounds.js';
import { createInput } from '../scripts/input.js';
import {
  createRenderer,
  projectIncomingX,
  projectDyingGoblinX,
  getGoblinFrameMetrics,
  isObstacleOnScreen,
  getDebugOverlayGeometry,
} from '../scripts/renderer.js';

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assertClose(a, b, msg, eps = 0.001) {
  if (Math.abs(a - b) > eps) throw new Error(msg || `expected ${a} ≈ ${b} (diff ${Math.abs(a - b)})`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function playerAt(distance, side) {
  return { ...createPlayer(side || 'boy'), distance };
}

function jumpingPlayerAt(distance, jumpStartDistance, side, overrides) {
  return {
    ...playerAt(distance, side || 'boy'),
    state: 'jumping',
    jumpY: 21,
    jumpVY: 4,
    jumpStartDistance,
    ...(overrides || {}),
  };
}

// ─── createGameState ──────────────────────────────────────────────────────────
console.log('\ncreateGameState');

test('phase starts as menu', () => {
  const s = createGameState('single', 1);
  assertEq(s.phase, 'menu');
});

test('both players start at STARTING_SPEED', () => {
  const s = createGameState('single', 1);
  assertEq(s.boy.speed, STARTING_SPEED);
  assertEq(s.girl.speed, STARTING_SPEED);
});

test('elapsed starts at 0', () => {
  const s = createGameState('single', 1);
  assertEq(s.elapsed, 0);
});

test('mode is stored', () => {
  assertEq(createGameState('local', 1).mode, 'local');
  assertEq(createGameState('single', 1).mode, 'single');
});

test('obstacles generated — warmup + 5 waves', () => {
  const s = createGameState('single', 1);
  const expected = 4 + WAVE_COUNTS.reduce((a, b) => a + b, 0); // 4 + 100 = 104
  assertEq(s.boyObstacles.length, expected);
  assertEq(s.girlObstacles.length, expected);
});

test('obstacles are deterministic with same seed', () => {
  const a = createGameState('single', 42);
  const b = createGameState('single', 42);
  assertEq(a.boyObstacles[10].type, b.boyObstacles[10].type);
  assertEq(a.boyObstacles[10].position, b.boyObstacles[10].position);
});

test('different seeds produce different obstacles', () => {
  const a = createGameState('single', 1);
  const b = createGameState('single', 999);
  // At least one obstacle in waves should differ
  const differ = a.boyObstacles.slice(4).some((obs, i) =>
    obs.type !== b.boyObstacles[i + 4].type || obs.position !== b.boyObstacles[i + 4].position
  );
  assert(differ, 'different seeds should produce different obstacles');
});

test('boy and girl get independent obstacle arrays', () => {
  const s = createGameState('single', 1);
  assert(s.boyObstacles !== s.girlObstacles, 'should be separate arrays');
});

test('debug obstacle filter swaps the course to one obstacle type', () => {
  const s = createGameState('single', 42, { debugObstacleType: 'bird' });
  const expected = 4 + WAVE_COUNTS.reduce((a, b) => a + b, 0);

  assertEq(s.boyObstacles.length, expected);
  assertEq(s.girlObstacles.length, expected);
  assert(s.boyObstacles.every(o => o.type === 'bird'), 'boy course should be birds only');
  assert(s.girlObstacles.every(o => o.type === 'bird'), 'girl course should be birds only');
});

test('debug obstacle filter preserves obstacle positions for timing practice', () => {
  const normal = createGameState('single', 42);
  const filtered = createGameState('single', 42, { debugObstacleType: 'goblin' });

  assertEq(filtered.boyObstacles.length, normal.boyObstacles.length);
  for (let i = 0; i < filtered.boyObstacles.length; i++) {
    assertEq(filtered.boyObstacles[i].position, normal.boyObstacles[i].position);
  }
});

// ─── processAction ────────────────────────────────────────────────────────────
console.log('\nprocessAction');

// At speed=5 distPerFrame=1, so:
//   perfect: |dist - pos| <= 1 (1 frame window)
//   good:    |dist - pos| <= 4 (4 frame window)
//   miss:    |dist - pos| >  4

test('action when no obstacles → no effect', () => {
  const p = playerAt(100);
  const { player, obstacles } = processAction(p, [], 'jump');
  assertEq(player.score, 0);
  assertEq(obstacles.length, 0);
});

test('action far from any obstacle (window not yet open) → no effect', () => {
  const p = playerAt(0);
  const obs = [createObstacle('goblin', 200)];
  const { player, obstacles } = processAction(p, obs, 'attack');
  assertEq(player.score, 0, 'should not grade obstacle that is far ahead');
  assertEq(obstacles.length, 1, 'obstacle should remain');
});

test('bird obstacle requires crouch', () => {
  const p = playerAt(100);
  const obs = [createObstacle('bird', 100)];
  const { player, obstacles } = processAction(p, obs, 'crouch');
  assertEq(player.score, 0, 'raw crouch should not auto-resolve bird timing');
  assertEq(obstacles.length, 1, 'bird should wait for hurtbox-vs-hitbox resolution');
});

test('arrowwall does not resolve from raw input before shield contact', () => {
  const p = playerAt(100);
  const obs = [createObstacle('arrowwall', 100)];
  const { player, obstacles } = processAction(p, obs, 'block');
  assertEq(player.score, 0);
  assertEq(obstacles.length, 1);
});

test('goblin (single-phase) does not resolve from raw input before sword contact', () => {
  const p = playerAt(100);
  const obs = [createObstacle('goblin', 100)];
  const { player, obstacles } = processAction(p, obs, 'attack');
  assertEq(player.score, 0);
  assertEq(obstacles.length, 1);
});

test('spikes do not resolve from raw input before physical contact', () => {
  const p = playerAt(100);
  const obs = [createObstacle('spikes', 100)];
  const { player, obstacles } = processAction(p, obs, 'jump');
  assertEq(player.score, 0);
  assertEq(obstacles.length, 1);
});

// ─── processMissedObstacles ───────────────────────────────────────────────────
console.log('\nsummarizeObstacleOutcome');

test('successful spikes clear lingers and reports good feedback', () => {
  const before = jumpingPlayerAt(118, 102, 'boy', { jumpVY: 5 });
  const frontObs = createObstacle('spikes', 100);
  const result = resolveContactAction(before, [frontObs], { state: 'running', actionTick: 0 });
  const summary = summarizeObstacleOutcome(before, result, frontObs);

  assertEq(summary.feedback, 'good');
  assertEq(summary.effectType, 'spikes');
  assertEq(summary.linger, true);
  assertEq(summary.hit, false);
});

test('successful goblin attack reports a goblin death with perfect feedback', () => {
  const before = playerAt(100, 'boy');
  const frontObs = createObstacle('goblin', 100);
  const result = resolveContactAction(before, [frontObs], { state: 'attack', actionTick: 4 });
  const summary = summarizeObstacleOutcome(before, result, frontObs);

  assertEq(summary.feedback, 'perfect');
  assertEq(summary.effectType, 'goblin');
  assertEq(summary.goblinDeath, true);
});

test('wrong input reports no outcome', () => {
  const before = playerAt(100, 'boy');
  const frontObs = createObstacle('goblin', 100);
  const result = processAction(before, [frontObs], 'jump');
  const summary = summarizeObstacleOutcome(before, result, frontObs);

  assertEq(summary.feedback, null);
  assertEq(summary.hit, false);
  assertEq(summary.linger, false);
});

test('too-early input reports no obstacle outcome', () => {
  const before = playerAt(80, 'boy');
  const frontObs = createObstacle('spikes', 100);
  const result = processAction(before, [frontObs], 'jump');
  const summary = summarizeObstacleOutcome(before, result, frontObs);

  assertEq(summary.feedback, null);
  assertEq(summary.consumed, false);
});

console.log('\nresolveContactAction');

test('jumping player can clear spikes with a perfect jump timing grade', () => {
  const jumping = jumpingPlayerAt(118, 101, 'boy', { jumpVY: 5 });
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(jumping, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.chain, 1);
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'jump');
  assertEq(result.grade, 'perfect');
});

test('jumping too low into spikes counts as a hit', () => {
  const jumping = jumpingPlayerAt(110, 101, 'boy', { jumpY: 19, jumpVY: 3 });
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(jumping, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0, 'low jump should clamp score at 0');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'jump');
});

test('jumping too early over spikes still clears if the physical hitbox clear is clean', () => {
  const jumping = jumpingPlayerAt(118, 88, 'boy', { jumpVY: 5 });
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(jumping, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 100, 'clean spike clears should still resolve from hitbox pass logic');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'jump');
  assertEq(result.grade, 'good');
});

test('spikes passed without an active jump clear as good if the hitbox never touched', () => {
  const player = playerAt(118, 'boy');
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.obstacles.length, 0);
  assertEq(result.grade, 'good');
});

test('running into spikes counts as a hit on contact', () => {
  const player = playerAt(110, 'boy');
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0, 'touching spikes on the ground should clamp score at 0');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'spikes');
});

test('jumping above spikes while still overlapping does not resolve early', () => {
  const jumping = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 21, jumpVY: 4 };
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(jumping, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0);
  assertEq(result.obstacles.length, 1);
  assertEq(result.action, null);
});

test('blocking state clears arrow wall when it reaches the player', () => {
  const player = playerAt(100, 'boy');
  const obs = [createObstacle('arrowwall', 100)];
  const result = resolveContactAction(player, obs, { state: 'block', actionTick: 4 });

  assertEq(result.player.chain, 1);
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'block');
});


test('attacking state clears a goblin when the sword hitbox connects', () => {
  const player = playerAt(100, 'boy');
  const obs = [createObstacle('goblin', 100)];
  const result = resolveContactAction(player, obs, { state: 'attack', actionTick: 4 });

  assertEq(result.player.chain, 1);
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'attack');
});

test('shield hitbox blocks arrows before they touch the player body', () => {
  const player = playerAt(96, 'boy');
  const obs = [createObstacle('arrowwall', 100)];
  const result = resolveContactAction(player, obs, { state: 'block', actionTick: 4 });

  assertEq(result.player.score, 100);
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'block');
});

test('arrows hit the player body when no shield is active', () => {
  const player = playerAt(101, 'boy');
  const obs = [createObstacle('arrowwall', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0, 'body contact with arrows should clamp score at 0');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'arrowwall');
});

test('goblin hits the player body when no sword is active', () => {
  const player = playerAt(108, 'boy');
  const obs = [createObstacle('goblin', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0, 'body contact with a goblin should clamp score at 0');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'goblin');
});

test('wrong active state at contact causes a hit', () => {
  const player = playerAt(108, 'boy');
  const obs = [createObstacle('goblin', 100)];
  const result = resolveContactAction(player, obs, { state: 'block', actionTick: 4 });

  assertEq(result.player.score, 0, 'wrong active action should clamp score at 0');
  assertEq(result.obstacles.length, 0);
});

test('no active contact action leaves the obstacle untouched', () => {
  const player = playerAt(100, 'boy');
  const obs = [createObstacle('bird', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0);
  assertEq(result.obstacles.length, 1);
  assertEq(result.action, null);
});

test('contactActionForPlayer maps jump and combat states to obstacle actions', () => {
  assertEq(contactActionForPlayer({ ...playerAt(0, 'boy'), state: 'jumping' }, { state: 'running', actionTick: 0 }), 'jump');
  assertEq(contactActionForPlayer(playerAt(0, 'boy'), { state: 'crouch', actionTick: 3 }), 'crouch');
  assertEq(contactActionForPlayer(playerAt(0, 'boy'), { state: 'attack', actionTick: 3 }), 'attack');
  assertEq(contactActionForPlayer(playerAt(0, 'boy'), { state: 'block', actionTick: 3 }), 'block');
  assertEq(contactActionForPlayer(playerAt(0, 'boy'), { state: 'running', actionTick: 0 }), null);
});

test('contactActionForPlayer keeps crouch active while the player state is crouching', () => {
  const player = { ...playerAt(0, 'boy'), state: 'crouching' };
  assertEq(contactActionForPlayer(player, { state: 'hit', actionTick: 3 }), 'crouch');
});

test('spikeHeightAtOffset follows the visible three-tip profile', () => {
  assertEq(spikeHeightAtOffset(-1), 0);
  assertEq(spikeHeightAtOffset(0), 0);
  assertEq(spikeHeightAtOffset(6), 20);
  assertEq(spikeHeightAtOffset(12), 0);
  assertEq(spikeHeightAtOffset(18), 20);
  assertEq(spikeHeightAtOffset(24), 0);
  assertEq(spikeHeightAtOffset(30), 20);
  assertEq(spikeHeightAtOffset(36), 0);
  assertEq(spikeHeightAtOffset(40), 0);
});

test('spikeTouchesPlayer is false when the player hurtbox is visibly above the spikes', () => {
  const player = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 21 };
  assertEq(spikeTouchesPlayer(player, createObstacle('spikes', 100)), false);
});

test('spikeTouchesPlayer is true when the player hurtbox intersects the spikes', () => {
  const player = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 6 };
  assertEq(spikeTouchesPlayer(player, createObstacle('spikes', 100)), true);
});

test('spikeTouchesPlayer ignores spike bounding-box overlap when the silhouettes do not touch', () => {
  const player = { ...playerAt(116, 'boy'), state: 'jumping', jumpY: 18, jumpVY: 3 };
  assertEq(spikeTouchesPlayer(player, createObstacle('spikes', 100)), false);
});

test('birdTouchesPlayer is true when the standing hurtbox intersects the bird hitbox', () => {
  const player = playerAt(102, 'boy');
  assertEq(birdTouchesPlayer(player, createObstacle('bird', 100), { state: 'running', actionTick: 0 }), true);
});

test('birdTouchesPlayer is false when the crouch hurtbox clears the bird hitbox', () => {
  const player = playerAt(102, 'boy');
  assertEq(birdTouchesPlayer(player, createObstacle('bird', 100), { state: 'crouch', actionTick: 4 }), false);
});

test('birdTouchesPlayer keeps using the crouch hurtbox while the player state is crouching', () => {
  const player = { ...playerAt(102, 'boy'), state: 'crouching' };
  assertEq(birdTouchesPlayer(player, createObstacle('bird', 100), { state: 'hit', actionTick: 4 }), false);
});

test('resolveContactAction does not punish a visible spike clear before the spikes are fully behind', () => {
  const jumping = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 21, jumpVY: 3 };
  const obs = [createObstacle('spikes', 100)];
  const result = resolveContactAction(jumping, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0);
  assertEq(result.obstacles.length, 1);
  assertEq(result.action, null);
});

test('standing into a bird counts as a hit on contact', () => {
  const player = playerAt(102, 'boy');
  const obs = [createObstacle('bird', 100)];
  const result = resolveContactAction(player, obs, { state: 'running', actionTick: 0 });

  assertEq(result.player.score, 0, 'touching the bird should clamp score at 0');
  assertEq(result.obstacles.length, 0);
  assertEq(result.action, 'bird');
});

test('crouching under a bird does not resolve early while it is still in front of the player', () => {
  const player = playerAt(102, 'boy');
  const obs = [createObstacle('bird', 100)];
  const result = resolveContactAction(player, obs, { state: 'crouch', actionTick: 4 });

  assertEq(result.player.score, 0);
  assertEq(result.obstacles.length, 1);
  assertEq(result.action, null);
});

test('bird clears once it is fully behind the player without hurtbox contact', () => {
  const player = { ...playerAt(112, 'boy'), state: 'jumping', jumpY: 28, jumpVY: 0 };
  const obs = [createObstacle('bird', 100)];
  const result = resolveContactAction(player, obs, { state: 'crouch', actionTick: 8 });

  assertEq(result.player.score, 100);
  assertEq(result.obstacles.length, 0);
  assertEq(result.grade, 'good');
});

test('buildDebugCollisionSnapshot exposes spike and player columns for overlays', () => {
  const player = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 21 };
  const snapshot = buildDebugCollisionSnapshot(player, [createObstacle('spikes', 100)], { state: 'running', actionTick: 0 });

  assertEq(snapshot.enabled, true);
  assertEq(snapshot.obstacleType, 'spikes');
  assert(snapshot.spikeColumns.length > 0, 'should include spike silhouette columns');
  assert(snapshot.playerColumns.length > 0, 'should include player silhouette columns');
  assertEq(typeof snapshot.overlapHeight, 'number');
});

test('buildDebugCollisionSnapshot still exposes player silhouette with no obstacle in front', () => {
  const player = { ...playerAt(110, 'boy'), state: 'running', jumpY: 0 };
  const snapshot = buildDebugCollisionSnapshot(player, [], { state: 'running', actionTick: 0 });

  assertEq(snapshot.enabled, true);
  assertEq(snapshot.obstacleType, 'none');
  assert(snapshot.playerColumns.length > 0, 'player silhouette should still be visible in debug mode');
  assertEq(snapshot.spikeColumns, undefined);
});

test('buildDebugCollisionSnapshot flags non-spike obstacles during the perfect window', () => {
  const player = { ...playerAt(100, 'boy'), state: 'running', jumpY: 0 };
  const snapshot = buildDebugCollisionSnapshot(player, [createObstacle('bird', 101)], { state: 'crouch', actionTick: 4 });

  assertEq(snapshot.timingGrade, 'perfect');
  assertEq(snapshot.perfectWindowActive, true);
});

test('buildDebugCollisionSnapshot shows spike perfect timing windows too', () => {
  const player = { ...playerAt(100, 'boy'), state: 'jumping', jumpY: 21 };
  const snapshot = buildDebugCollisionSnapshot(player, [createObstacle('spikes', 100)], { state: 'running', actionTick: 0 });

  assertEq(snapshot.timingGrade, 'perfect');
  assertEq(snapshot.perfectWindowActive, true);
});

test('debugEnabledFromSearch turns on hitbox debug only for explicit debug params', () => {
  assertEq(debugEnabledFromSearch(''), false);
  assertEq(debugEnabledFromSearch('?foo=1'), false);
  assertEq(debugEnabledFromSearch('?debug=0'), false);
  assertEq(debugEnabledFromSearch('?debug=1'), true);
  assertEq(debugEnabledFromSearch('?debug=true'), true);
});

test('debugObstacleTypeFromSearch parses supported practice obstacle filters', () => {
  assertEq(debugObstacleTypeFromSearch('?debugObstacle=spikes'), 'spikes');
  assertEq(debugObstacleTypeFromSearch('?debugObstacle=birds'), 'bird');
  assertEq(debugObstacleTypeFromSearch('?debugObstacle=arrows'), 'arrowwall');
  assertEq(debugObstacleTypeFromSearch('?practice=goblins'), 'goblin');
});

test('debugObstacleTypeFromSearch ignores unsupported obstacle filters', () => {
  assertEq(debugObstacleTypeFromSearch(''), null);
  assertEq(debugObstacleTypeFromSearch('?debugObstacle=lasers'), null);
});

test('toggleDebugHotkey only flips debug mode for F3', () => {
  let result = toggleDebugHotkey(false, 'w');
  assertEq(result.handled, false);
  assertEq(result.enabled, false);

  result = toggleDebugHotkey(false, 'F3');
  assertEq(result.handled, true);
  assertEq(result.enabled, true);

  result = toggleDebugHotkey(true, 'F3');
  assertEq(result.handled, true);
  assertEq(result.enabled, false);
});

console.log('\nprocessMissedObstacles');

test('no obstacles → unchanged', () => {
  const p = playerAt(200);
  const { player, obstacles } = processMissedObstacles(p, []);
  assertEq(player.score, 0);
  assertEq(obstacles.length, 0);
});

test('obstacle window not yet expired → unchanged', () => {
  const p = playerAt(50);
  const obs = [createObstacle('spikes', 100)]; // ahead
  const { player, obstacles } = processMissedObstacles(p, obs);
  assertEq(player.score, 0);
  assertEq(obstacles.length, 1);
});

test('expired obstacle → miss applied, obstacle removed', () => {
  // At speed 5, distPerFrame=1, good window=4 frames
  // windowExpired when playerDistance > obsPosition + 4
  const p = playerAt(110);
  const obs = [createObstacle('arrowwall', 100)];
  const { player, obstacles } = processMissedObstacles(p, obs);
  assertEq(player.score, 0, 'miss should clamp score at 0');
  assertEq(obstacles.length, 0);
});

test('multiple expired obstacles → all removed, all miss', () => {
  const p = playerAt(200);
  const obs = [
    createObstacle('arrowwall', 100),
    createObstacle('goblin', 110),
  ];
  const { player, obstacles } = processMissedObstacles(p, obs);
  assertEq(obstacles.length, 0);
  assertEq(player.score, 0, 'multiple misses should still clamp score at 0');
});

test('one expired, one upcoming → only expired removed', () => {
  const p = playerAt(110);
  const obs = [
    createObstacle('arrowwall', 100),  // expired
    createObstacle('bird', 200),    // upcoming
  ];
  const { player, obstacles } = processMissedObstacles(p, obs);
  assertEq(obstacles.length, 1);
  assertEq(obstacles[0].type, 'bird');
});

test('processMissedObstacles awards a perfect for a fully passed spike jump with perfect timing', () => {
  const p = jumpingPlayerAt(118, 101);
  const obs = [createObstacle('spikes', 100)];
  const { player, obstacles } = processMissedObstacles(p, obs);

  assertEq(player.chain, 1);
  assertEq(obstacles.length, 0);
});

test('processMissedObstacles clears passed spikes as good if the hitbox never touched', () => {
  const p = playerAt(118, 'boy');
  const obs = [createObstacle('spikes', 100)];
  const { player, obstacles, resolved } = processMissedObstacles(p, obs);

  assertEq(obstacles.length, 0);
  assertEq(resolved[0]?.grade, 'good');
});

test('processMissedObstacles clears a fully passed bird while crouching', () => {
  const p = { ...playerAt(112, 'boy'), state: 'crouching' };
  const obs = [createObstacle('bird', 100)];
  const { player, obstacles, resolved } = processMissedObstacles(p, obs);

  assertEq(player.score, 100, 'ducking under a fully passed bird should clear');
  assertEq(obstacles.length, 0);
  assertEq(resolved[0]?.grade, 'good');
});

test('processMissedObstacles does not miss a crouched bird just because its timing window expired before it moved behind', () => {
  const p = { ...playerAt(106, 'boy'), state: 'crouching' };
  const obs = [createObstacle('bird', 100)];
  const { player, obstacles, resolved } = processMissedObstacles(p, obs);

  assertEq(player.score, 0, 'a clean crouch should not fail before the bird is actually behind the player');
  assertEq(obstacles.length, 1, 'bird should stay active until contact or full pass');
  assertEq(resolved.length, 0);
});

test('processMissedObstacles clears a fully passed bird whenever there was no contact', () => {
  const p = playerAt(112, 'boy');
  const obs = [createObstacle('bird', 100)];
  const { player, obstacles, resolved } = processMissedObstacles(p, obs);

  assertEq(player.score, 100, 'fully passing a bird without contact should clear');
  assertEq(obstacles.length, 0);
  assertEq(resolved[0]?.grade, 'good');
});

test('classifyAutoResolvedObstacle reports a passed spike using its timing grade', () => {
  const before = jumpingPlayerAt(118, 101, 'boy');
  const result = processMissedObstacles(before, [createObstacle('spikes', 100)]);
  const outcome = classifyAutoResolvedObstacle(before, result.player, createObstacle('spikes', 100), result.resolved[0]?.grade);

  assertEq(outcome.feedback, 'perfect');
  assertEq(outcome.hit, false);
  assertEq(outcome.linger, true);
});

test('attack goblin past its window is consumed as miss, not stuck in queue', () => {
  // Regression: processMissedObstacles previously broke unconditionally on attack goblins,
  // causing the queue to permanently stall if the goblin slipped past without contact.
  const obs_position = 100;
  const p = playerAt(obs_position + 10); // player is 10 units past the goblin (window.late = 3, so expired)
  const goblin = createObstacle('goblin', obs_position); // single-phase (attack)
  const trailing = createObstacle('spikes', obs_position + 60);
  const { player, obstacles } = processMissedObstacles(p, [goblin, trailing]);
  // Goblin must be consumed (queue unstuck), spike must remain
  assertEq(obstacles.length, 1, 'goblin should be consumed');
  assertEq(obstacles[0].type, 'spikes', 'trailing obstacle unblocked');
  assertEq(player.score, 0, 'miss penalty should clamp score at 0');
});

test('attack goblin window not yet expired is not consumed by processMissedObstacles', () => {
  // Still inside the timing window — contact resolution must handle it
  const p = playerAt(90); // far from goblin at 100, window not open yet
  const goblin = createObstacle('goblin', 100);
  const { obstacles } = processMissedObstacles(p, [goblin]);
  assertEq(obstacles.length, 1, 'goblin should remain in queue while window open');
});

// ─── startJump / tickJumpArc ──────────────────────────────────────────────────

console.log('\njump physics');

test('JUMP_VY and JUMP_GRAVITY are positive numbers', () => {
  assert(JUMP_VY > 0, 'JUMP_VY should be positive');
  assert(JUMP_GRAVITY > 0, 'JUMP_GRAVITY should be positive');
});

test('startJump from running → state=jumping, jumpY=0, jumpVY=JUMP_VY', () => {
  const p = createPlayer('boy');
  const jumped = startJump(p);
  assertEq(jumped.state, 'jumping');
  assertEq(jumped.jumpY, 0);
  assertEq(jumped.jumpVY, JUMP_VY);
  assertEq(jumped.jumpStartDistance, 0);
});

test('startJump from jumping → no change', () => {
  const p = { ...createPlayer('boy'), state: 'jumping', jumpY: 30, jumpVY: 4 };
  const result = startJump(p);
  assertEq(result.jumpY, 30, 'should not restart jump mid-air');
  assertEq(result.jumpVY, 4);
});

test('startJump from crouching → no change', () => {
  const p = { ...createPlayer('boy'), state: 'crouching' };
  const result = startJump(p);
  assertEq(result.state, 'crouching', 'cannot jump while crouching');
});

test('held crouch overrides all other inputs for a side', () => {
  const inp = createInput();
  inp.keydown('s');
  inp.keydown('d');
  inp.keydown('w');

  assertEq(nextActionForSide(inp, 'boy'), 'crouch');
});

test('pressed attack wins when crouch is not being held', () => {
  const inp = createInput();
  inp.keydown('d');

  assertEq(nextActionForSide(inp, 'boy'), 'attack');
});

test('tickJumpArc on non-jumping player → no change', () => {
  const p = createPlayer('boy');
  const result = tickJumpArc(p);
  assert(result.jumpY === undefined || result.jumpY === 0, 'should not change a grounded player');
  assertEq(result.state, 'running');
});

test('tickJumpArc raises jumpY on first tick', () => {
  const p = startJump(createPlayer('boy'));
  const result = tickJumpArc(p);
  assert(result.jumpY > 0, `jumpY should be > 0 after first tick, got ${result.jumpY}`);
});

test('jumpY peaks then falls', () => {
  let p = startJump(createPlayer('boy'));
  let prevY = 0;
  let peaked = false;
  for (let i = 0; i < 200; i++) {
    p = tickJumpArc(p);
    if (p.state !== 'jumping') break;
    if (p.jumpY < prevY) { peaked = true; break; }
    prevY = p.jumpY;
  }
  assert(peaked, 'jumpY should peak and start falling');
});

test('jump arc lands — state returns to running', () => {
  let p = startJump(createPlayer('boy'));
  let landed = false;
  for (let i = 0; i < 200; i++) {
    p = tickJumpArc(p);
    if (p.state === 'running') { landed = true; break; }
  }
  assert(landed, 'player should land and return to running');
  assertEq(p.jumpY, 0);
  assertEq(p.jumpStartDistance, null);
});

// ─── tickFrame ────────────────────────────────────────────────────────────────
console.log('\ntickFrame');

function playingState(seed) {
  const s = createGameState('single', seed || 1);
  return { ...s, phase: 'playing' };
}

test('tickFrame advances elapsed by 1', () => {
  const s = playingState();
  assertEq(tickFrame(s).elapsed, 1);
});

test('tickFrame advances player distances', () => {
  const s = playingState();
  const next = tickFrame(s);
  assert(next.boy.distance > 0, 'boy distance should increase');
  assert(next.girl.distance > 0, 'girl distance should increase');
});

test('tickFrame does not change distances when phase is not playing', () => {
  const s = createGameState('single', 1); // phase = 'menu'
  const next = tickFrame(s);
  assertEq(next.boy.distance, 0);
  assertEq(next.girl.distance, 0);
});

test('finished player distance does not advance', () => {
  const s = playingState();
  s.boy = { ...s.boy, state: 'finished', distance: RUN_DISTANCE };
  const next = tickFrame(s);
  assertEq(next.boy.distance, RUN_DISTANCE);
});

test('player reaching RUN_DISTANCE gets state=finished', () => {
  const s = playingState();
  s.boy = { ...s.boy, distance: RUN_DISTANCE - 0.1, speed: 5 };
  const next = tickFrame(s);
  assertEq(next.boy.state, 'finished');
});

test('both finished → phase=reunion', () => {
  const s = playingState();
  s.boy  = { ...s.boy,  state: 'finished', distance: RUN_DISTANCE };
  s.girl = { ...s.girl, state: 'finished', distance: RUN_DISTANCE };
  s.boyObstacles  = [];
  s.girlObstacles = [];
  const next = tickFrame(s);
  assertEq(next.phase, 'reunion');
  assertEq(next.phaseFrames, 0);
  assertEq(next.runSummary.outcome, OUTCOMES.REUNION);
});

test('hard cutoff reached → phase=gameover', () => {
  const s = playingState();
  s.elapsed = HARD_CUTOFF_FRAMES - 1;
  s.boyObstacles  = [];
  s.girlObstacles = [];
  const next = tickFrame(s);
  assertEq(next.phase, 'gameover');
});

test('hard cutoff with one finished runner stores partial outcome', () => {
  const s = playingState();
  s.elapsed = HARD_CUTOFF_FRAMES - 1;
  s.boy = { ...s.boy, state: 'finished', distance: RUN_DISTANCE, score: 9000 };
  s.girl = { ...s.girl, distance: 1200, score: 7000 };
  const next = tickFrame(s);
  assertEq(next.phase, 'gameover');
  assertEq(next.phaseFrames, 0);
  assertEq(next.runSummary.outcome, OUTCOMES.PARTIAL);
  assertEq(next.runSummary.totalScore, 9000);
});

test('hard cutoff with neither finished stores game over outcome', () => {
  const s = playingState();
  s.elapsed = HARD_CUTOFF_FRAMES - 1;
  s.boy = { ...s.boy, distance: 2000, score: 5000 };
  s.girl = { ...s.girl, distance: 2100, score: 6000 };
  const next = tickFrame(s);
  assertEq(next.phase, 'gameover');
  assertEq(next.runSummary.outcome, OUTCOMES.GAME_OVER);
  assertEq(next.runSummary.totalScore, 0);
});

test('HARD_CUTOFF_FRAMES is 90 × 60', () => {
  assertEq(HARD_CUTOFF_FRAMES, 90 * 60);
});

test('tickFrame removes missed obstacles during play', () => {
  const s = playingState();
  // Player needs distance > obsPosition + distPerFrame(speed)*4 for window to expire.
  // At speed 5, distPerFrame=1, good window=4. Set player at 20, obstacle at 0.
  s.boy = { ...s.boy, distance: 20 };
  s.boyObstacles = [createObstacle('spikes', 0)];
  const next = tickFrame(s);
  assertEq(next.boyObstacles.length, 0, 'expired obstacle should be cleared');
});

// --- advancePhaseState -------------------------------------------------------
console.log('\nadvancePhaseState');

test('advancePhaseState leaves menu unchanged', () => {
  const s = createGameState('single', 1);
  const next = advancePhaseState(s);
  assertEq(next.phase, 'menu');
});

test('reunion advances to score screen after hold duration', () => {
  let s = playingState();
  s.boy = { ...s.boy, state: 'finished', distance: RUN_DISTANCE, score: 4000 };
  s.girl = { ...s.girl, state: 'finished', distance: RUN_DISTANCE, score: 5000 };
  s = tickFrame(s);
  for (let i = 0; i < END_PHASE_HOLD_FRAMES; i++) {
    s = advancePhaseState(s);
  }
  assertEq(s.phase, 'score_screen');
  assertEq(s.runSummary.outcome, OUTCOMES.REUNION);
  assertEq(s.runSummary.totalScore, 9000);
});

test('gameover advances to score screen after hold duration', () => {
  let s = playingState();
  s.elapsed = HARD_CUTOFF_FRAMES - 1;
  s.boy = { ...s.boy, state: 'finished', distance: RUN_DISTANCE, score: 7000 };
  s = tickFrame(s);
  for (let i = 0; i < END_PHASE_HOLD_FRAMES; i++) {
    s = advancePhaseState(s);
  }
  assertEq(s.phase, 'score_screen');
  assertEq(s.runSummary.outcome, OUTCOMES.PARTIAL);
  assertEq(s.runSummary.totalScore, 7000);
});

// --- renderer projection math -------------------------------------------------
console.log('\nrenderer projection math');

test('boy-side obstacles stay to the right of the contact point until impact', () => {
  const contactX = 162;
  const width = 72;

  assertEq(projectIncomingX(contactX, 0, 'right', width), contactX);
  assert(projectIncomingX(contactX, 10, 'right', width) > contactX);
});

test('girl-side obstacles stay to the left of the contact point until impact', () => {
  const contactX = 318;
  const width = 72;

  assertEq(projectIncomingX(contactX, 0, 'left', width), contactX - width);
  assert(projectIncomingX(contactX, 10, 'left', width) + width < contactX);
});

test('faster approach projections stay on the same incoming side', () => {
  const boyContactX = 162;
  const girlContactX = 318;
  const width = 60;

  const boyBody = projectIncomingX(boyContactX, 10, 'right', width, 1);
  const boyFireball = projectIncomingX(boyContactX, 10, 'right', width, 2);
  assert(boyFireball > boyBody, 'boy-side faster projectile should stay farther right');

  const girlBody = projectIncomingX(girlContactX, 10, 'left', width, 1);
  const girlFireball = projectIncomingX(girlContactX, 10, 'left', width, 2);
  assert(girlFireball < girlBody, 'girl-side faster projectile should stay farther left');
});

test('goblin idle frame metrics use the tight visible sprite bounds', () => {
  const m0 = getGoblinFrameMetrics(false, 0);
  const m1 = getGoblinFrameMetrics(false, 1);

  assertEq(m0.srcInset, 0);
  assertEq(m0.srcWidth, 27);
  assertEq(m1.srcInset, 26);
  assertEq(m1.srcWidth, 25);
});

test('goblin attack frame metrics strip the padded empty space', () => {
  const m1 = getGoblinFrameMetrics(true, 1);
  const m2 = getGoblinFrameMetrics(true, 2);

  assertEq(m1.srcInset, 38);
  assertEq(m1.srcWidth, 22);
  assertEq(m2.srcInset, 74);
  assertEq(m2.srcWidth, 10);
});

test('trail culling waits until the obstacle is actually off-screen', () => {
  assertEq(isObstacleOnScreen(-20, 36), true);
  assertEq(isObstacleOnScreen(-40, 36), false);
  assertEq(isObstacleOnScreen(500, 36), false);
});

test('debug overlay geometry anchors the boy hurtbox and spike hitbox to gameplay space', () => {
  const player = { ...playerAt(110, 'boy'), state: 'jumping', jumpY: 18 };
  const obstacles = [createObstacle('spikes', 120)];
  const snapshot = buildDebugCollisionSnapshot(player, obstacles, { state: 'running', actionTick: 0 });
  const geometry = getDebugOverlayGeometry('boy', player, obstacles, snapshot, 0);

  assert(geometry.playerBounds.left >= 120, `expected player hurtbox near the runner, got ${geometry.playerBounds.left}`);
  assert(geometry.obstacleBoxes.length > 0, 'expected an obstacle hitbox for spikes');
  assert(geometry.obstacleBoxes[0].left > geometry.playerBounds.left, 'boy-side spikes should be in front of the player');
});

test('debug overlay geometry anchors the girl hurtbox and front obstacle to gameplay space', () => {
  const player = { ...playerAt(90, 'girl'), state: 'running', jumpY: 0 };
  const obstacles = [createObstacle('bird', 100)];
  const snapshot = buildDebugCollisionSnapshot(player, obstacles, { state: 'running', actionTick: 0 });
  const geometry = getDebugOverlayGeometry('girl', player, obstacles, snapshot, 0);

  assert(geometry.playerBounds.left >= 300, `expected girl hurtbox near the runner, got ${geometry.playerBounds.left}`);
  assert(geometry.obstacleBoxes.length > 0, 'expected a front obstacle hitbox for the bird');
  assert(geometry.obstacleBoxes[0].right < geometry.playerBounds.right, 'girl-side bird should approach from the left');
});

test('debug overlay geometry exposes a dedicated shield box for arrow blocks', () => {
  const player = { ...playerAt(96, 'boy'), state: 'running', jumpY: 0 };
  const obstacles = [createObstacle('arrowwall', 100)];
  const snapshot = buildDebugCollisionSnapshot(player, obstacles, { state: 'block', actionTick: 4 });
  const geometry = getDebugOverlayGeometry('boy', player, obstacles, snapshot, 0);

  assert(geometry.shieldBox, 'expected shield box while blocking');
  assert(geometry.obstacleBoxes.length > 0, 'expected arrow hitbox');
  assert(geometry.shieldCollisionBox, 'expected arrows to intersect the shield');
  assert(!geometry.collisionBox, 'shield should catch the arrows before the body hurtbox');
});

test('debug overlay geometry exposes a dedicated sword box for goblin attacks', () => {
  const player = { ...playerAt(100, 'boy'), state: 'running', jumpY: 0 };
  const obstacles = [createObstacle('goblin', 100)];
  const snapshot = buildDebugCollisionSnapshot(player, obstacles, { state: 'attack', actionTick: 4 });
  const geometry = getDebugOverlayGeometry('boy', player, obstacles, snapshot, 0);

  assert(geometry.swordBox, 'expected sword box while attacking');
  assert(geometry.obstacleBoxes.length > 0, 'expected goblin hitbox');
  assert(geometry.swordCollisionBox, 'expected sword to intersect the goblin');
  assert(!geometry.collisionBox, 'sword should reach the goblin before the body hurtbox');
});

test('boy-side dying goblin stays in world space and gets passed on the left', () => {
  const beforePass = projectDyingGoblinX(100, 90, 'right', 0);
  const afterPass = projectDyingGoblinX(100, 110, 'right', 0);
  assert(afterPass < beforePass, 'boy should run past a dead goblin instead of dragging it forward');
});

test('girl-side dying goblin stays in world space and gets passed on the right', () => {
  const beforePass = projectDyingGoblinX(100, 90, 'left', 0);
  const afterPass = projectDyingGoblinX(100, 110, 'left', 0);
  assert(afterPass > beforePass, 'girl should run past a dead goblin instead of dragging it forward');
});

// --- initGame ----------------------------------------------------------------
console.log('\ninitGame');

test('initGame boots one browser frame and preloads gameplay sprites', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalImage = globalThis.Image;
  const originalRaf = globalThis.requestAnimationFrame;

  const loadedSrcs = [];
  const listeners = {};
  let rafCalls = 0;

  const ctx = new Proxy({
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  const canvas = {
    width: 0,
    height: 0,
    getContext() { return ctx; },
  };

  class FakeImage {
    constructor() {
      this.complete = false;
      this.naturalWidth = 16;
      this.naturalHeight = 16;
      this._src = '';
      this._onload = null;
    }

    set src(value) {
      this._src = value;
      loadedSrcs.push(value);
    }

    get src() {
      return this._src;
    }

    set onload(fn) {
      this._onload = fn;
      if (this._src && typeof fn === 'function') {
        this.complete = true;
        fn();
      }
    }

    get onload() {
      return this._onload;
    }

    set onerror(fn) {
      this._onerror = fn;
    }
  }

  globalThis.document = {
    getElementById(id) {
      if (id !== 'gameCanvas') throw new Error(`unexpected element lookup: ${id}`);
      return canvas;
    },
  };
  globalThis.window = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  globalThis.Image = FakeImage;
  globalThis.requestAnimationFrame = () => {
    rafCalls++;
    return 1;
  };

  try {
    initGame();
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.Image = originalImage;
    globalThis.requestAnimationFrame = originalRaf;
  }

  assertEq(canvas.width, 960, 'renderer should size the canvas');
  assertEq(canvas.height, 540, 'renderer should size the canvas');
  assertEq(typeof listeners.keydown, 'function', 'keydown listener should be registered');
  assertEq(typeof listeners.keyup, 'function', 'keyup listener should be registered');
  assertEq(rafCalls, 1, 'initGame should render and schedule the next frame');

  const expectedSprites = [
    'images/boy.png',
    'images/girl.png',
    'images/SHORT SWORD.png',
    'images/red1.png',
    'images/red2.png',
    'images/red3.png',
    'images/goblin-idle.png',
    'images/goblin-attack.png',
    'images/goblin-take-hit.png',
    'images/goblin-death.png',
    'images/arrows.png',
  ];

  for (const src of expectedSprites) {
    assert(loadedSrcs.includes(src), `expected sprite to be loaded: ${src}`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────
test('initGame prevents default browser scrolling for mapped control keys', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalImage = globalThis.Image;
  const originalRaf = globalThis.requestAnimationFrame;

  const listeners = {};
  const ctx = new Proxy({
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  const canvas = {
    width: 0,
    height: 0,
    getContext() { return ctx; },
  };

  class FakeImage {
    constructor() {
      this.complete = false;
      this.naturalWidth = 16;
      this.naturalHeight = 16;
      this._src = '';
      this._onload = null;
    }

    set src(value) {
      this._src = value;
    }

    get src() {
      return this._src;
    }

    set onload(fn) {
      this._onload = fn;
      if (this._src && typeof fn === 'function') {
        this.complete = true;
        fn();
      }
    }

    get onload() {
      return this._onload;
    }

    set onerror(fn) {
      this._onerror = fn;
    }
  }

  globalThis.document = {
    getElementById(id) {
      if (id !== 'gameCanvas') throw new Error(`unexpected element lookup: ${id}`);
      return canvas;
    },
  };
  globalThis.window = {
    location: { search: '' },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  globalThis.Image = FakeImage;
  globalThis.requestAnimationFrame = () => 1;

  try {
    initGame();
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.Image = originalImage;
    globalThis.requestAnimationFrame = originalRaf;
  }

  let preventedArrowDown = false;
  listeners.keydown({
    key: 'ArrowDown',
    preventDefault() {
      preventedArrowDown = true;
    },
  });

  let preventedW = false;
  listeners.keydown({
    key: 'w',
    preventDefault() {
      preventedW = true;
    },
  });

  let preventedEnter = false;
  listeners.keydown({
    key: 'Enter',
    preventDefault() {
      preventedEnter = true;
    },
  });

  assertEq(preventedArrowDown, true, 'arrow controls should not scroll the page');
  assertEq(preventedW, true, 'mapped game controls should keep focus inside the game');
  assertEq(preventedEnter, false, 'unmapped keys should keep their default browser behavior');
});

test('renderer can clear finished-side obstacle visuals without affecting the other side', () => {
  const ctx = new Proxy({
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop() {} }),
  }, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });

  const canvas = {
    width: 0,
    height: 0,
    getContext() { return ctx; },
  };

  const fakeImg = { complete: false, naturalWidth: 0, naturalHeight: 0 };
  const renderer = createRenderer(canvas, {
    boy: fakeImg,
    girl: fakeImg,
    sword: fakeImg,
    birds: [fakeImg, fakeImg, fakeImg],
    goblinIdle: fakeImg,
    goblinAttack: fakeImg,
    goblinTakeHit: fakeImg,
    goblinDeath: fakeImg,
    arrows: fakeImg,
  });

  renderer.addTrailObstacle('boy', createObstacle('bird', 100));
  renderer.addDyingGoblin('boy', createObstacle('goblin', 100), 0);
  renderer.addOutcomeEffect('boy', 'hit', 'bird');
  renderer.addTrailObstacle('girl', createObstacle('bird', 100));

  renderer.clearSideObstacleVisuals('boy');
});

console.log('\nsounds');

test('createSounds can stop active run-end music without touching other sounds', () => {
  const originalAudio = globalThis.Audio;
  const played = [];

  class FakeAudio {
    constructor(src = '') {
      this.src = src;
      this.preload = '';
    }

    cloneNode() {
      return {
        src: this.src,
        currentTime: 4,
        pauseCalls: 0,
        play() {
          played.push(this);
          return Promise.resolve();
        },
        pause() {
          this.pauseCalls++;
        },
      };
    }
  }

  globalThis.Audio = FakeAudio;

  try {
    const sounds = createSounds();
    sounds.play('run-success');
    sounds.play('jump');
    sounds.play('run-failed');

    sounds.stop('run-success');
    sounds.stop('run-failed');

    const success = played.find(audio => audio.src.endsWith('run-success.wav'));
    const fail = played.find(audio => audio.src.endsWith('run-failed.wav'));
    const jump = played.find(audio => audio.src.endsWith('jump.wav'));

    assert(success, 'expected run-success instance to exist');
    assert(fail, 'expected run-failed instance to exist');
    assert(jump, 'expected jump instance to exist');

    assertEq(success.pauseCalls, 1, 'run-success should pause when stopped');
    assertEq(success.currentTime, 0, 'run-success should rewind when stopped');
    assertEq(fail.pauseCalls, 1, 'run-failed should pause when stopped');
    assertEq(fail.currentTime, 0, 'run-failed should rewind when stopped');
    assertEq(jump.pauseCalls, 0, 'non-run sounds should remain untouched');
    assertEq(jump.currentTime, 4, 'non-run sounds should keep their playback position');
  } finally {
    globalThis.Audio = originalAudio;
  }
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
