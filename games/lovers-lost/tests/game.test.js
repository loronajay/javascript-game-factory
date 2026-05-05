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
  shouldHandleMappedKeyLocally,
  sanitizeOnlineDisplayName,
  isValidOnlineDisplayName,
  buildOnlineIdentity,
  deriveOnlineRunOverrideName,
  formatOnlinePlayerLabel,
  attachOnlineResultIdentities,
  getOnlineLobbyButtonRects,
  getOnlineNameEntryButtonRects,
  getOnlineSideSelectRects,
  buildLaneSnapshot,
  applyLaneSnapshot,
  initGame,
  summarizeObstacleOutcome,
  JUMP_VY,
  JUMP_GRAVITY,
  HARD_CUTOFF_FRAMES,
  END_PHASE_HOLD_FRAMES,
} from '../game.js';
import {
  buildCreateRoomPayload,
  buildFindMatchPayload,
  buildJoinRoomPayload,
  buildProfileMessage,
  buildQueueStatusPayload,
  getCountdownSecondsRemaining,
  hasCountdownStarted,
  parseProfileMessage,
  normalizeQueueCounts,
  parseActionMessage,
  parseSnapshotMessage,
  serializeActionMessage,
  serializeSnapshotMessage,
} from '../scripts/online.js';

import { createPlayer, distPerFrame, SPEED_FLOOR, STARTING_SPEED, RUN_DISTANCE } from '../scripts/player.js';
import { createObstacle, generateWarmup, WAVE_COUNTS } from '../scripts/obstacles.js';
import { OUTCOMES } from '../scripts/scoring.js';
import { createSounds } from '../scripts/sounds.js';
import { createInput } from '../scripts/input.js';
import {
  createRenderer,
  buildHudModel,
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

function createTextCaptureRenderer(options = {}) {
  const texts = [];
  const textCalls = [];
  const drawCalls = [];
  const ctx = new Proxy({
    measureText: (text = '') => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillText(text, x, y) {
      const value = String(text);
      texts.push(value);
      textCalls.push({ text: value, x, y });
    },
    drawImage(...args) {
      if (args.length >= 9) {
        drawCalls.push({ x: args[5], y: args[6], w: args[7], h: args[8] });
      } else if (args.length >= 5) {
        drawCalls.push({ x: args[1], y: args[2], w: args[3], h: args[4] });
      }
    },
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

  const fakeImg = { complete: false, naturalWidth: 16, naturalHeight: 16 };
  const emoteImages = options.emoteImages || {};
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
  }, emoteImages);

  return { renderer, texts, textCalls, drawCalls };
}

function textCallY(textCalls, label) {
  const call = textCalls.find(entry => entry.text === label);
  return call ? call.y : null;
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

test('player reaching RUN_DISTANCE while jumping lands into finished state', () => {
  const s = playingState();
  s.boy = {
    ...s.boy,
    state: 'jumping',
    distance: RUN_DISTANCE - 0.1,
    speed: 5,
    jumpY: 18,
    jumpVY: 3,
    jumpStartDistance: RUN_DISTANCE - 12,
  };
  const next = tickFrame(s);
  assertEq(next.boy.state, 'finished');
  assertEq(next.boy.jumpY, 0);
  assertEq(next.boy.jumpVY, 0);
  assertEq(next.boy.jumpStartDistance, null);
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

test('tickFrame can skip remote-lane simulation in online mode while still advancing the local lane', () => {
  const s = playingState();
  s.mode = 'online';
  s.girl = { ...s.girl, distance: 20 };
  s.girlObstacles = [createObstacle('spikes', 0)];

  const next = tickFrame(s, { simulatedSides: { boy: true, girl: false } });

  assertEq(next.elapsed, s.elapsed + 1, 'shared clock should keep advancing');
  assert(next.boy.distance > s.boy.distance, 'local authoritative lane should keep simulating');
  assertEq(next.girl.distance, s.girl.distance, 'remote lane should not be co-simulated locally');
  assertEq(next.girlObstacles.length, 1, 'remote lane obstacles should wait for snapshots');
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

console.log('\nlane snapshots');

test('buildLaneSnapshot captures the replicated lane state without full obstacle data', () => {
  const player = { ...playerAt(120, 'girl'), speed: 13, score: 450, chain: 2, state: 'jumping', jumpY: 18, jumpVY: 5 };
  const obstacles = [createObstacle('bird', 150), createObstacle('goblin', 220)];
  const resolved = [{ feedback: 'good', effectType: 'bird', hit: false, linger: false, goblinDeath: false }];
  const snapshot = buildLaneSnapshot(player, obstacles, { state: 'attack', actionTick: 7 }, resolved, 42, 3);

  assertEq(snapshot.seq, 3);
  assertEq(snapshot.elapsed, 42);
  assertEq(snapshot.obstacleCount, 2);
  assertEq(snapshot.player.side, 'girl');
  assertEq(snapshot.player.jumpY, 18);
  assertEq(snapshot.anim.state, 'attack');
  assertEq(snapshot.resolved.length, 1);
  assertEq(snapshot.resolved[0].effectType, 'bird');
});

test('applyLaneSnapshot accepts newer snapshots and trims remote obstacles to match authoritative progress', () => {
  const current = {
    player: playerAt(90, 'girl'),
    obstacles: [createObstacle('spikes', 100), createObstacle('bird', 180), createObstacle('goblin', 260)],
    anim: { state: 'running', actionTick: 0 },
  };
  const snapshot = buildLaneSnapshot(
    { ...playerAt(130, 'girl'), score: 100, speed: 11, chain: 1 },
    current.obstacles.slice(1),
    { state: 'crouch', actionTick: 4 },
    [{ feedback: 'good', effectType: 'spikes', hit: false, linger: true, goblinDeath: false }],
    12,
    4
  );

  const applied = applyLaneSnapshot(current, snapshot, 3);

  assertEq(applied.applied, true);
  assertEq(applied.lastSeq, 4);
  assertEq(applied.player.distance, 130);
  assertEq(applied.obstacles.length, 2);
  assertEq(applied.obstacles[0].type, 'bird');
  assertEq(applied.anim.state, 'crouch');
  assertEq(applied.resolved.length, 1);
});

test('applyLaneSnapshot ignores stale snapshots', () => {
  const current = {
    player: playerAt(90, 'boy'),
    obstacles: [createObstacle('spikes', 100), createObstacle('bird', 180)],
    anim: { state: 'running', actionTick: 0 },
  };
  const snapshot = buildLaneSnapshot(
    { ...playerAt(140, 'boy'), score: 300 },
    current.obstacles.slice(1),
    { state: 'attack', actionTick: 3 },
    [],
    18,
    2
  );

  const applied = applyLaneSnapshot(current, snapshot, 5);

  assertEq(applied.applied, false);
  assertEq(applied.lastSeq, 5);
  assertEq(applied.player.distance, 90);
  assertEq(applied.obstacles.length, 2);
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

console.log('\nonline input ownership');

test('sanitizeOnlineDisplayName trims and clamps to 12 characters', () => {
  assertEq(sanitizeOnlineDisplayName('   Star Crossed Runner   '), 'Star Crossed');
  assertEq(sanitizeOnlineDisplayName('  Leo  '), 'Leo');
});

test('isValidOnlineDisplayName rejects empty trimmed values', () => {
  assertEq(isValidOnlineDisplayName('   '), false);
  assertEq(isValidOnlineDisplayName(' Maya '), true);
});

test('buildOnlineIdentity reads the default name from the factory profile and prefers a run override', () => {
  const fromProfile = buildOnlineIdentity({
    version: 1,
    playerId: 'player-1',
    profileName: 'Maya',
    favorites: [],
    friends: [],
    recentPartners: [],
    preferences: {},
  });
  const withOverride = buildOnlineIdentity({
    version: 1,
    playerId: 'player-1',
    profileName: 'Maya',
    favorites: [],
    friends: [],
    recentPartners: [],
    preferences: {},
  }, '  Leo  ');

  assertEq(fromProfile.playerId, 'player-1');
  assertEq(fromProfile.displayName, 'Maya');
  assertEq(withOverride.displayName, 'Leo');
  assertEq(withOverride.profileName, 'Maya');
  assertEq(withOverride.runOverrideName, 'Leo');
});

test('deriveOnlineRunOverrideName keeps the factory profile canonical when the entered name matches it', () => {
  const noOverride = deriveOnlineRunOverrideName({ profileName: 'Maya' }, '  Maya  ');
  const override = deriveOnlineRunOverrideName({ profileName: 'Maya' }, '  Leo  ');

  assertEq(noOverride, '');
  assertEq(override, 'Leo');
});

test('formatOnlinePlayerLabel keeps side identity attached to display names', () => {
  assertEq(formatOnlinePlayerLabel('boy', { displayName: 'Leo' }), 'Leo (Boy)');
  assertEq(formatOnlinePlayerLabel('girl', null), 'Girl');
});

test('attachOnlineResultIdentities maps local and remote online names onto the correct sides', () => {
  const summary = attachOnlineResultIdentities(
    { outcome: 'reunion', boyFinished: true, girlFinished: true, boyScore: 500, girlScore: 400, totalScore: 900, elapsedFrames: 100 },
    'girl',
    { displayName: 'Maya' },
    'boy',
    { displayName: 'Leo' }
  );

  assertEq(summary.boyIdentity.displayName, 'Leo');
  assertEq(summary.girlIdentity.displayName, 'Maya');
});

test('online mode only accepts local physical keys for the assigned side', () => {
  assertEq(shouldHandleMappedKeyLocally('single', 'boy', 'boy'), true);
  assertEq(shouldHandleMappedKeyLocally('single', 'boy', 'girl'), true);
  assertEq(shouldHandleMappedKeyLocally('online', 'boy', 'boy'), true);
  assertEq(shouldHandleMappedKeyLocally('online', 'boy', 'girl'), false);
  assertEq(shouldHandleMappedKeyLocally('online', 'girl', 'girl'), true);
  assertEq(shouldHandleMappedKeyLocally('online', 'girl', 'boy'), false);
});

test('online lobby button hitboxes match the shifted renderer layout', () => {
  const sideSelect = getOnlineSideSelectRects();
  assertEq(sideSelect.boy.x, 240);
  assertEq(sideSelect.girl.y, 130);

  const nameEntry = getOnlineNameEntryButtonRects();
  assertEq(nameEntry.continue.y, 336);

  const main = getOnlineLobbyButtonRects('main');
  assertEq(main.findMatch.y, 272);
  assertEq(main.playFriend.y, 348);

  const friendOptions = getOnlineLobbyButtonRects('friend_options');
  assertEq(friendOptions.create.y, 282);
  assertEq(friendOptions.join.y, 354);

  const join = getOnlineLobbyButtonRects('join');
  assertEq(join.joinSubmit.y, 314);
  assertEq(join.cancel.y, 390);

  const create = getOnlineLobbyButtonRects('create');
  assertEq(create.cancel.y, 390);

  const searching = getOnlineLobbyButtonRects('searching');
  assertEq(searching.cancel.y, 350);
});

console.log('\nonline action protocol');

test('serializeActionMessage includes release phase for held remote inputs', () => {
  assertEq(serializeActionMessage('crouch', 'release'), JSON.stringify({ action: 'crouch', phase: 'release' }));
});

test('parseActionMessage keeps backward compatibility with legacy plain action strings', () => {
  const parsed = parseActionMessage('jump');
  assertEq(parsed.action, 'jump');
  assertEq(parsed.phase, 'press');
});

test('parseActionMessage reads structured press and release messages', () => {
  const press = parseActionMessage(JSON.stringify({ action: 'block', phase: 'press' }));
  const release = parseActionMessage(JSON.stringify({ action: 'crouch', phase: 'release' }));

  assertEq(press.action, 'block');
  assertEq(press.phase, 'press');
  assertEq(release.action, 'crouch');
  assertEq(release.phase, 'release');
});

test('serializeSnapshotMessage and parseSnapshotMessage round-trip authoritative lane snapshots', () => {
  const snapshot = buildLaneSnapshot(
    { ...playerAt(150, 'boy'), score: 600, speed: 14, state: 'finished' },
    [createObstacle('goblin', 200)],
    { state: 'running', actionTick: 0 },
    [{ feedback: 'perfect', effectType: 'goblin', hit: false, linger: false, goblinDeath: true }],
    77,
    9
  );

  const encoded = serializeSnapshotMessage(snapshot);
  const parsed = parseSnapshotMessage(encoded);

  assertEq(parsed.seq, 9);
  assertEq(parsed.player.distance, 150);
  assertEq(parsed.obstacleCount, 1);
  assertEq(parsed.resolved[0].goblinDeath, true);
});

test('buildFindMatchPayload includes the selected side for side-aware queueing', () => {
  const payload = buildFindMatchPayload('girl', 'lovers-lost', { playerId: 'player-1', displayName: 'Maya' });

  assertEq(payload.type, 'find_match');
  assertEq(payload.gameId, 'lovers-lost');
  assertEq(payload.side, 'girl');
  assertEq(payload.playerId, 'player-1');
  assertEq(payload.displayName, 'Maya');
});

test('buildCreateRoomPayload includes the selected side for server-owned countdown setup', () => {
  const payload = buildCreateRoomPayload('boy', { playerId: 'player-2', displayName: 'Leo' });

  assertEq(payload.type, 'create_room');
  assertEq(payload.side, 'boy');
  assertEq(payload.playerId, 'player-2');
  assertEq(payload.displayName, 'Leo');
});

test('buildJoinRoomPayload normalizes the room code and includes the selected side', () => {
  const payload = buildJoinRoomPayload('girl', 'ab12c', { playerId: 'player-3', displayName: 'Maya' });

  assertEq(payload.type, 'join_room');
  assertEq(payload.side, 'girl');
  assertEq(payload.roomCode, 'AB12C');
  assertEq(payload.playerId, 'player-3');
  assertEq(payload.displayName, 'Maya');
});

test('buildProfileMessage and parseProfileMessage round-trip online display names and canonical ids', () => {
  const encoded = buildProfileMessage({ playerId: 'player-4', displayName: 'Leo' }, 'boy');
  const parsed = parseProfileMessage(encoded);

  assertEq(parsed.playerId, 'player-4');
  assertEq(parsed.displayName, 'Leo');
  assertEq(parsed.side, 'boy');
});

test('buildQueueStatusPayload requests live side counts for one game', () => {
  const payload = buildQueueStatusPayload('lovers-lost');

  assertEq(payload.type, 'queue_status');
  assertEq(payload.gameId, 'lovers-lost');
});

test('getCountdownSecondsRemaining counts down against server-adjusted time', () => {
  assertEq(getCountdownSecondsRemaining(5000, 300, 1000), 4);
  assertEq(getCountdownSecondsRemaining(5000, 300, 1699), 4);
  assertEq(getCountdownSecondsRemaining(5000, 300, 1701), 3);
  assertEq(getCountdownSecondsRemaining(5000, 300, 4699), 1);
});

test('hasCountdownStarted flips only when the adjusted clock reaches startAt', () => {
  assertEq(hasCountdownStarted(5000, 300, 4699), false);
  assertEq(hasCountdownStarted(5000, 300, 4700), true);
});

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
    createRadialGradient: () => ({ addColorStop() {} }),
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
    addEventListener() {},
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
    'images/emojis/heart.png',
    'images/emojis/middle-finger.png',
    'images/emojis/smile.png',
    'images/emojis/crying.png',
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
    createRadialGradient: () => ({ addColorStop() {} }),
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
    addEventListener() {},
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

console.log('\nrenderer online ux');

test('renderer shows a dedicated online name entry step with validation copy', () => {
  const { renderer, texts } = createTextCaptureRenderer();

  renderer.renderOnlineNameEntry('girl', 'Maya', 'NAME REQUIRED', { continue: false });

  assert(texts.includes('CHOOSE YOUR NAME'), 'expected name-entry title');
  assert(texts.includes('NAME REQUIRED'), 'expected inline validation message');
  assert(texts.includes('CONTINUE'), 'expected continue button');
});

test('buildHudModel formats richer lane stats for the gameplay HUD', () => {
  const model = buildHudModel(
    { ...playerAt(1280, 'boy'), score: 420, speed: 17.4, chain: 3 },
    { ...playerAt(900, 'girl'), score: 75, speed: 5, chain: 0 },
    71,
    { online: true }
  );

  assertEq(model.clock.label, 'TIME LEFT');
  assertEq(model.clock.timeStr, '0:19');
  assertEq(model.clock.urgent, true);
  assertEq(model.clock.online, true);

  assertEq(model.boy.scoreText, '00420');
  assertEq(model.boy.speedText, '17.4');
  assertEq(model.boy.chainText, 'x3');
  assertEq(model.boy.chainTier, 'surging');
  assert(model.boy.speedFill > 0 && model.boy.speedFill < 1, 'expected mid-run speed fill to stay normalized');
  assertEq(model.girl.chainTier, 'idle');
  assertEq(model.girl.progressText, '17%');
});

test('renderer explains side lock during online side select', () => {
  const { renderer, texts, textCalls } = createTextCaptureRenderer();

  renderer.renderOnlineSideSelect(false, false, 'boy');

  assert(texts.includes('ONLINE MATCHMAKING'), 'expected online matchmaking label on side select');
  assert(texts.includes('YOUR SIDE STAYS LOCKED FOR THE MATCH'), 'expected side-lock guidance on side select');
  assert(textCallY(textCalls, 'ONLINE MATCHMAKING') <= 34, 'expected the top badge to sit clearly above the title');
  assert(textCallY(textCalls, 'CHOOSE YOUR SIDE') >= 88, 'expected the title to keep its original visual weight');
});

test('renderer labels public matchmaking state in the online lobby', () => {
  const { renderer, texts, textCalls, drawCalls } = createTextCaptureRenderer();

  renderer.renderOnlineLobby('boy', 'searching', '', '', 0, {
    findMatch: false,
    playFriend: false,
    cancel: false,
    create: false,
    join: false,
    joinSubmit: false,
  }, { boy: 2, girl: 5 }, { displayName: 'Leo' }, null);

  assert(texts.includes('PUBLIC MATCHMAKING'), 'expected public matchmaking label in searching state');
  assert(texts.includes('SIDE LOCKED: BOY'), 'expected locked-side label in searching state');
  assert(texts.includes('YOU: Leo (Boy)'), 'expected local identity line in the lobby');
  assert(texts.includes('WAITING FOR GIRL PLAYER'), 'expected partner-side wait cue in searching state');
  assert(texts.includes('5 girls in the yard'), 'expected live partner-side queue copy in searching state');
  assert(textCallY(textCalls, 'SEARCHING FOR A PARTNER') >= 270, 'expected searching copy to sit well below the status stack');
  assert(drawCalls.some(call => call.y === 186), 'expected online lobby sprite to sit slightly lower');
});

test('renderer confirms the synced online start when a match is found', () => {
  const { renderer, texts } = createTextCaptureRenderer();

  renderer.renderOnlineCountdown('girl', 'boy', 3, { displayName: 'Maya' }, { displayName: 'Leo' });

  assert(texts.includes('MATCH FOUND'), 'expected match-found heading');
  assert(texts.includes('SERVER COUNTDOWN SYNCED'), 'expected synced countdown trust cue');
  assert(texts.includes('YOU: Maya (Girl)'), 'expected local player name on countdown');
  assert(texts.includes('PARTNER: Leo (Boy)'), 'expected remote display name on countdown');
});

test('renderer shows a persistent online badge during gameplay', () => {
  const { renderer, texts } = createTextCaptureRenderer();

  renderer.renderPlay(
    { ...playerAt(120, 'boy'), score: 420, speed: 17.4, chain: 3 },
    { ...playerAt(118, 'girl'), score: 75, speed: 6.2, chain: 0 },
    [],
    [],
    [],
    [],
    12,
    null,
    { online: true }
  );

  assert(texts.includes('ONLINE'), 'expected online badge during gameplay');
  assert(texts.includes('TIME LEFT'), 'expected framed clock label during gameplay');
  assert(texts.includes('SCORE'), 'expected score label in the richer HUD');
  assert(texts.includes('SPEED'), 'expected speed label in the richer HUD');
  assert(texts.includes('CHAIN'), 'expected chain label in the richer HUD');
});

test('renderer can draw an emote bubble for the addressed side during gameplay', () => {
  const emoteImg = { complete: true, naturalWidth: 32, naturalHeight: 32 };
  const { renderer, drawCalls } = createTextCaptureRenderer({
    emoteImages: { heart: emoteImg },
  });

  renderer.addEmote('boy', 'heart');
  renderer.renderPlay(
    { ...playerAt(120, 'boy'), score: 420, speed: 17.4, chain: 3 },
    { ...playerAt(118, 'girl'), score: 75, speed: 6.2, chain: 0 },
    [],
    [],
    [],
    [],
    12,
    null,
    { online: true }
  );

  assert(drawCalls.some(call => call.w === 56 && call.h === 56), 'expected emote sprite to render inside the bubble');
});

test('renderer surfaces disconnect notes on result screens', () => {
  const runSummary = {
    outcome: 'partial',
    boyFinished: true,
    girlFinished: false,
    boyScore: 900,
    girlScore: 0,
    totalScore: 900,
    elapsedFrames: 360,
    disconnectNote: true,
    boyIdentity: { displayName: 'Leo' },
    girlIdentity: { displayName: 'Maya' },
  };

  const gameOverCapture = createTextCaptureRenderer();
  gameOverCapture.renderer.renderGameOver(playerAt(120, 'boy'), playerAt(100, 'girl'), runSummary);
  assert(gameOverCapture.texts.includes('Your partner disconnected.'), 'expected disconnect note on the hold/result screen');

  const scoreCapture = createTextCaptureRenderer();
  scoreCapture.renderer.renderScore(playerAt(120, 'boy'), playerAt(100, 'girl'), runSummary);
  assert(scoreCapture.texts.includes('Your partner disconnected.'), 'expected disconnect note on the score screen');
  assert(scoreCapture.texts.some(text => text.includes('Leo (Boy)')), 'expected named result labels on the score screen');
});

test('renderer keeps join and create prompts below the lobby status stack', () => {
  const joinCapture = createTextCaptureRenderer();
  joinCapture.renderer.renderOnlineLobby('girl', 'join', '', '', 0, {
    findMatch: false,
    playFriend: false,
    cancel: false,
    create: false,
    join: false,
    joinSubmit: false,
  }, null, { displayName: 'Maya' }, null);
  assert(textCallY(joinCapture.textCalls, "ENTER YOUR FRIEND'S ROOM CODE:") >= 205, 'expected join prompt to clear the top status block');

  const createCapture = createTextCaptureRenderer();
  createCapture.renderer.renderOnlineLobby('girl', 'create', 'UUFAX', '', 0, {
    findMatch: false,
    playFriend: false,
    cancel: false,
    create: false,
    join: false,
    joinSubmit: false,
  }, null, { displayName: 'Maya' }, { displayName: 'Leo' });
  assert(textCallY(createCapture.textCalls, 'Share this code with your friend:') >= 195, 'expected room-code prompt to clear the top status block');
  assert(createCapture.texts.includes('PARTNER: Leo (Boy)'), 'expected partner identity in private-room flow');
});

console.log('\nonline queue counts');

test('normalizeQueueCounts accepts direct side counts from the server payload', () => {
  const counts = normalizeQueueCounts({ boyWaiting: 1, girlWaiting: 4 });

  assertEq(counts.boy, 1);
  assertEq(counts.girl, 4);
});

test('normalizeQueueCounts accepts nested queueCounts payloads', () => {
  const counts = normalizeQueueCounts({ queueCounts: { boy: 3, girl: 2 } });

  assertEq(counts.boy, 3);
  assertEq(counts.girl, 2);
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
