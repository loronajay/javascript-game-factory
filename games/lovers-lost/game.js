import {
  createPlayer, advanceDistance, isFinished,
  applyPerfect, applyGood, applyMiss,
  checkAssist, deactivateAssistIfRecovered,
  RUN_DISTANCE, STARTING_SPEED,
} from './scripts/player.js';

import {
  createObstacle, generateWarmup, generateWave,
  requiredInput,
  gradeInput, windowExpired, makeRng,
  WAVE_COUNTS,
} from './scripts/obstacles.js';
import { evaluateRun } from './scripts/scoring.js';
import { createRenderer, getDebugOverlayGeometry } from './scripts/renderer.js';
import { createInput, keyToAction } from './scripts/input.js';
import { createSounds } from './scripts/sounds.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const HARD_CUTOFF_FRAMES = 90 * 60;  // 5400 frames
const END_PHASE_HOLD_FRAMES = 480;   // 8 seconds: 5s walk + 3s heart (reunion) or brief hold (gameover)
const JUMP_VY            = 8;        // pixels/frame initial upward velocity
const JUMP_GRAVITY       = 0.5;      // pixels/frame² downward acceleration

// ─── createGameState ──────────────────────────────────────────────────────────
const SPIKE_WIDTH_PX = 36;
const SPIKE_TRI_WIDTH_PX = 12;
const SPIKE_HEIGHT_PX = 20;
const BOY_CONTACT_REL_PX = 42;
const GIRL_CONTACT_REL_PX = 6;
const SPIKE_RESOLVE_ACTION = 'spikes';
const BIRD_RESOLVE_ACTION = 'bird';
const ARROWWALL_RESOLVE_ACTION = 'arrowwall';
const GOBLIN_RESOLVE_ACTION = 'goblin';
const PLAYER_BOX_TOP_PX = 6;
const PLAYER_BOX_BOTTOM_PX = 47;
const GIRL_VISIBLE_LEFT_PX = 6;
const GIRL_VISIBLE_RIGHT_PX = 35;
const CROUCH_Y_OFFSET_PX = 24;
const CROUCH_SCALE = 0.5;
const JUMP_BOTTOM_PROFILE = [
  null, null, null, null,
  8, 15, 15, 15, 15, 15, 15, 13, 12, 9,
  null, null,
];
const PLAYER_VISIBLE_LEFT_PX = 12;
const PLAYER_VISIBLE_RIGHT_PX = 41;
const PLAYER_RENDER_Y = 412;
const DEBUG_OBSTACLE_ALIASES = {
  spike: 'spikes',
  spikes: 'spikes',
  bird: 'bird',
  birds: 'bird',
  arrow: 'arrowwall',
  arrows: 'arrowwall',
  arrowwall: 'arrowwall',
  arrowwalls: 'arrowwall',
  goblin: 'goblin',
  goblins: 'goblin',
};
const DEBUG_OBSTACLE_LABELS = {
  spikes: 'spikes',
  bird: 'birds',
  arrowwall: 'arrows',
  goblin: 'goblins',
};

function normalizeDebugObstacleType(value) {
  if (typeof value !== 'string') return null;
  return DEBUG_OBSTACLE_ALIASES[value.trim().toLowerCase()] || null;
}

function obstacleCourseForDebug(obstacles, debugObstacleType) {
  const onlyType = normalizeDebugObstacleType(debugObstacleType);
  if (!onlyType) return obstacles;
  return obstacles.map(obstacle => createObstacle(onlyType, obstacle.position));
}

function debugObstacleTypeFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const value = params.get('debugObstacle') || params.get('practice') || params.get('practiceObstacle');
  return normalizeDebugObstacleType(value);
}

function createGameState(mode, seed, options) {
  const rng = makeRng(seed != null ? seed : (Date.now() >>> 0));
  const warmup = generateWarmup(0);
  const waves  = [];
  let prevLast = warmup[warmup.length - 1] || null;
  for (let w = 1; w <= WAVE_COUNTS.length; w++) {
    const waveObs = generateWave(w, rng, prevLast);
    waves.push(...waveObs);
    prevLast = waveObs[waveObs.length - 1] || prevLast;
  }
  const debugObstacleType = normalizeDebugObstacleType(options && options.debugObstacleType);
  const allObstacles = obstacleCourseForDebug([...warmup, ...waves], debugObstacleType);

  return {
    phase:          'menu',
    mode:           mode || 'single',
    elapsed:        0,
    boy:            { ...createPlayer('boy'),  speed: STARTING_SPEED },
    girl:           { ...createPlayer('girl'), speed: STARTING_SPEED },
    boyObstacles:   allObstacles.map(o => ({ ...o })),
    girlObstacles:  allObstacles.map(o => ({ ...o })),
    boyBoosts:      [],
    girlBoosts:     [],
    phaseFrames:    0,
    runSummary:     null,
    seed:           seed != null ? seed : 0,
    debugObstacleType,
  };
}

// ─── processAction ────────────────────────────────────────────────────────────
// Called when a player presses an action button.
// Checks if the action hits the front obstacle while it overlaps the contact window.
// Returns { player, obstacles } — both potentially updated.
function processAction(player, obstacles, action) {
  if (obstacles.length === 0) return { player, obstacles };

  const obs      = obstacles[0];
  if (obs.type === 'spikes' || obs.type === 'bird' || obs.type === 'arrowwall' || obs.type === 'goblin') {
    return { player, obstacles };
  }
  const required = requiredInput(obs);
  const grade    = gradeInput(obs, player.distance);

  // Action too early (obstacle far ahead, window not open yet)
  // windowExpired returns false when player hasn't reached the window.
  // We detect "before window" when distance < obsPosition - goodWindow.
  // gradeInput returns 'miss' both before and after the window.
  // Use windowExpired to distinguish: if window hasn't expired it's still upcoming.
  if (grade === 'miss' && !windowExpired(obs, player.distance)) {
    // Player is too early — ignore, don't consume obstacle
    return { player, obstacles };
  }

  // Within window or past window — consume the obstacle
  let newPlayer;
  if (action !== required) {
    // Wrong action = miss
    newPlayer = applyMiss(player);
    return { player: newPlayer, obstacles: obstacles.slice(1), grade: 'miss' };
  }

  // Correct action
  if (grade === 'perfect') newPlayer = applyPerfect(player);
  else if (grade === 'good') newPlayer = applyGood(player);
  else newPlayer = applyMiss(player); // correct but past good window



  return { player: newPlayer, obstacles: obstacles.slice(1), grade };
}

function applyGradeOutcome(player, grade) {
  if (grade === 'perfect') return applyPerfect(player);
  if (grade === 'good') return applyGood(player);
  return applyMiss(player);
}

function spikeTimingGrade(player, obstacle) {
  if (player.jumpStartDistance == null) return 'miss';
  return gradeInput(obstacle, player.jumpStartDistance);
}

function spikeClearGrade(player, obstacle) {
  const grade = spikeTimingGrade(player, obstacle);
  if (grade === 'perfect') return 'perfect';
  return 'good';
}

function animStateForPlayerState(player) {
  if (player && player.state === 'crouching') {
    return { state: 'crouch', actionTick: 0 };
  }
  return { state: 'running', actionTick: 0 };
}

// ─── processMissedObstacles ───────────────────────────────────────────────────
// Each frame: check if the front obstacle's window has expired without input.
// Applies miss for each expired obstacle and removes them.
function processMissedObstacles(player, obstacles) {
  let p   = player;
  let obs = obstacles;
  const resolved = [];
  while (obs.length > 0) {
    const frontObstacle = obs[0];

    if (frontObstacle.type === 'spikes') {
      if (spikeTouchesPlayer(p, frontObstacle)) {
        const before = p;
        p = applyMiss(p);
        resolved.push({
          obstacle: frontObstacle,
          grade: 'miss',
          ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss'),
        });
        obs = obs.slice(1);
        continue;
      }

      if (spikeFullyBehindPlayer(p, frontObstacle)) {
        const before = p;
        const grade = spikeClearGrade(p, frontObstacle);
        p = grade === 'miss' ? applyMiss(p) : applyGradeOutcome(p, grade);
        resolved.push({
          obstacle: frontObstacle,
          grade,
          ...classifyAutoResolvedObstacle(before, p, frontObstacle, grade),
        });
        obs = obs.slice(1);
        continue;
      }

      break;
    }

    if (frontObstacle.type === 'bird') {
      const before = p;
      const animState = animStateForPlayerState(p);

      if (birdTouchesPlayer(p, frontObstacle, animState)) {
        p = applyMiss(p);
        resolved.push({
          obstacle: frontObstacle,
          grade: 'miss',
          ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss'),
        });
        obs = obs.slice(1);
        continue;
      }

      if (birdFullyBehindPlayer(p, frontObstacle, animState)) {
        const grade = 'good';
        p = applyGood(p);
        resolved.push({
          obstacle: frontObstacle,
          grade,
          ...classifyAutoResolvedObstacle(before, p, frontObstacle, grade),
        });
        obs = obs.slice(1);
        continue;
      }

      break;
    }

    if (frontObstacle.type === 'goblin' && requiredInput(frontObstacle) === 'attack') {
      // Attack goblins must be resolved by contact (sword or body).
      // But if the window has expired the goblin is off-screen — consume it as a miss
      // so the obstacle queue doesn't get permanently stuck behind it.
      if (!windowExpired(frontObstacle, p.distance)) break;
      // fall through to the standard miss path below
    }

    if (!windowExpired(frontObstacle, p.distance)) {
      break;
    }

    const before = p;
    p   = applyMiss(p);
    const nextObstacles = obs.slice(1);
    resolved.push({
      obstacle: frontObstacle,
      grade: 'miss',
      ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss'),
    });
    obs = nextObstacles;
  }
  return { player: p, obstacles: obs, resolved };
}

function classifyAutoResolvedObstacle(playerBefore, playerAfter, obstacle, grade) {
  const hit = grade === 'miss';
  const clear = grade === 'perfect' || grade === 'good';
  return {
    hit,
    feedback: hit ? 'hit' : (clear ? (grade === 'perfect' ? 'perfect' : 'good') : null),
    linger: obstacle.type === 'spikes' || obstacle.type === 'bird',
    effectType: obstacle.type,
  };
}

function summarizeObstacleOutcome(playerBefore, result, frontObstacle) {
  if (!frontObstacle) {
    return {
      consumed: false,
      hit: false,
      linger: false,
      goblinDeath: false,
      feedback: null,
      effectType: null,
    };
  }

  const consumed = result.player.obstaclesFaced > playerBefore.obstaclesFaced;
  if (!consumed) {
    return {
      consumed: false,
      hit: false,
      linger: false,
      goblinDeath: false,
      feedback: null,
      effectType: null,
    };
  }

  const hit = result.grade === 'miss';
  return {
    consumed: true,
    hit,
    linger: frontObstacle.type === 'spikes' || frontObstacle.type === 'bird',
    goblinDeath: !hit && frontObstacle.type === 'goblin',
    feedback: hit ? 'hit' : (result.grade === 'perfect' ? 'perfect' : 'good'),
    effectType: frontObstacle.type,
  };
}

function spikeHeightAtOffset(offsetPx) {
  if (offsetPx < 0 || offsetPx > SPIKE_WIDTH_PX) return 0;
  const local = offsetPx % SPIKE_TRI_WIDTH_PX;
  const distFromTip = Math.abs(local - SPIKE_TRI_WIDTH_PX / 2);
  return Math.max(0, SPIKE_HEIGHT_PX * (1 - distFromTip / (SPIKE_TRI_WIDTH_PX / 2)));
}

function projectSpikeLocalX(player, obstacle) {
  const distDelta = obstacle.position - player.distance;
  if (player.side === 'girl') {
    return GIRL_CONTACT_REL_PX - distDelta * 4 - SPIKE_WIDTH_PX;
  }
  return BOY_CONTACT_REL_PX + distDelta * 4;
}

function playerBottomAtLocalX(player, localX) {
  if (localX < 0 || localX >= 48) return null;
  const sourceX = Math.floor(localX / 3);
  const profileX = player.side === 'girl' ? 15 - sourceX : sourceX;
  const bottom = JUMP_BOTTOM_PROFILE[profileX];
  if (bottom == null) return null;
  return bottom * 3 + 2;
}

function playerVisibleBoundsX(player) {
  if (player.side === 'girl') {
    return { left: GIRL_VISIBLE_LEFT_PX, right: GIRL_VISIBLE_RIGHT_PX };
  }
  return { left: PLAYER_VISIBLE_LEFT_PX, right: PLAYER_VISIBLE_RIGHT_PX };
}

function playerIsCrouching(player, animState) {
  return !!(player && player.state === 'crouching')
    || !!(animState && animState.state === 'crouch');
}

function playerHurtboxForAnim(player, animState) {
  const { left, right } = playerVisibleBoundsX(player);
  const jumpY = player.jumpY || 0;
  const crouching = playerIsCrouching(player, animState);

  if (crouching) {
    return {
      left,
      right,
      top: PLAYER_RENDER_Y - jumpY + CROUCH_Y_OFFSET_PX + Math.round(PLAYER_BOX_TOP_PX * CROUCH_SCALE),
      bottom: PLAYER_RENDER_Y - jumpY + CROUCH_Y_OFFSET_PX + Math.round(PLAYER_BOX_BOTTOM_PX * CROUCH_SCALE),
    };
  }

  return {
    left,
    right,
    top: PLAYER_RENDER_Y - jumpY + PLAYER_BOX_TOP_PX,
    bottom: PLAYER_RENDER_Y - jumpY + PLAYER_BOX_BOTTOM_PX,
  };
}

function buildPlayerDebugColumns(player, animState, obstacleType) {
  if (obstacleType === 'spikes') {
    const columns = [];
    for (let x = 0; x <= 47; x++) {
      const bottom = playerBottomAtLocalX(player, x);
      if (bottom == null) continue;
      columns.push({
        x,
        top: PLAYER_RENDER_Y - (player.jumpY || 0) + bottom,
        bottom: PLAYER_RENDER_Y - (player.jumpY || 0) + 47,
      });
    }
    return columns;
  }

  const box = playerHurtboxForAnim(player, animState);
  const columns = [];
  for (let x = box.left; x <= box.right; x++) {
    columns.push({
      x,
      top: box.top,
      bottom: box.bottom,
    });
  }
  return columns;
}

function spikeTouchesPlayer(player, obstacle) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], null);
  const geometry = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  return geometry.overlapColumns.length > 0;
}

function birdTouchesPlayer(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  const geometry = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  return !!geometry.collisionBox;
}

function birdFullyBehindPlayer(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  const geometry = getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
  const birdBox = geometry.obstacleBoxes[0];
  const playerBounds = geometry.playerBounds;
  if (!birdBox || !playerBounds) return false;
  if (player.side === 'girl') return birdBox.left >= playerBounds.right;
  return birdBox.right <= playerBounds.left;
}

function arrowWallCollisionGeometry(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  return getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
}

function shieldBlocksArrowWall(player, obstacle, animState) {
  const geometry = arrowWallCollisionGeometry(player, obstacle, animState);
  return !!geometry.shieldCollisionBox;
}

function boxIntersects(a, b) {
  if (!a || !b) return false;
  return a.right >= b.left && b.right >= a.left && a.bottom >= b.top && b.bottom >= a.top;
}

function labeledObstacleIntersects(geometry, targetBox, label) {
  if (!targetBox) return false;
  return geometry.obstacleBoxes.some(box => box.label === label && boxIntersects(box, targetBox));
}

function arrowWallTouchesPlayer(player, obstacle, animState) {
  const geometry = arrowWallCollisionGeometry(player, obstacle, animState);
  return !!geometry.collisionBox;
}

function goblinCollisionGeometry(player, obstacle, animState) {
  const snapshot = buildDebugCollisionSnapshot(player, [obstacle], animState);
  return getDebugOverlayGeometry(player.side, player, [obstacle], snapshot, 0);
}

function swordHitsGoblin(player, obstacle, animState) {
  const geometry = goblinCollisionGeometry(player, obstacle, animState);
  return !!geometry.swordCollisionBox;
}

function goblinTouchesPlayer(player, obstacle, animState) {
  const geometry = goblinCollisionGeometry(player, obstacle, animState);
  return !!geometry.collisionBox;
}

function spikeOverlapHeight(player, obstacle) {
  const spikeLeft = projectSpikeLocalX(player, obstacle);
  const spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  const overlapLeft = Math.max(spikeLeft, 0);
  const overlapRight = Math.min(spikeRight, 47);

  if (overlapLeft >= overlapRight) return 0;

  let maxHeight = 0;
  for (let x = Math.ceil(overlapLeft); x < Math.ceil(overlapRight); x++) {
    const playerTopOffset = playerBottomAtLocalX(player, x);
    if (playerTopOffset == null) continue;

    const playerTop = PLAYER_RENDER_Y - (player.jumpY || 0) + playerTopOffset;
    const playerBottom = PLAYER_RENDER_Y - (player.jumpY || 0) + 47;
    const spikeHeight = spikeHeightAtOffset(x - spikeLeft);
    if (spikeHeight <= 0) continue;

    const spikeTop = 460 - spikeHeight;
    const spikeBottom = 460;
    const overlapPx = Math.min(playerBottom, spikeBottom) - Math.max(playerTop, spikeTop);
    if (overlapPx >= 0) {
      maxHeight = Math.max(maxHeight, overlapPx);
    }
  }
  return maxHeight;
}

function spikeFullyBehindPlayer(player, obstacle) {
  const spikeLeft = projectSpikeLocalX(player, obstacle);
  const spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  if (player.side === 'girl') return spikeLeft >= PLAYER_VISIBLE_RIGHT_PX;
  return spikeRight <= PLAYER_VISIBLE_LEFT_PX;
}

function buildDebugCollisionSnapshot(player, obstacles, animState) {
  const frontObstacle = obstacles && obstacles[0];
  const playerHurtbox = playerHurtboxForAnim(player, animState);
  const timingGrade = frontObstacle
    ? gradeInput(frontObstacle, player.distance)
    : null;
  const snapshot = {
    enabled: true,
    obstacleType: frontObstacle ? frontObstacle.type : 'none',
    timingGrade,
    perfectWindowActive: timingGrade === 'perfect',
    playerBottomY: playerHurtbox.bottom,
    playerColumns: buildPlayerDebugColumns(player, animState, frontObstacle ? frontObstacle.type : null),
    overlapHeight: 0,
    requiredJump: 0,
    action: contactActionForPlayer(player, animState),
    actionTick: animState ? animState.actionTick : 0,
  };

  if (!frontObstacle || frontObstacle.type !== 'spikes') {
    return snapshot;
  }

  const spikeLeft = projectSpikeLocalX(player, frontObstacle);
  snapshot.spikeLeft = spikeLeft;
  snapshot.spikeRight = spikeLeft + SPIKE_WIDTH_PX;
  snapshot.spikeColumns = [];
  for (let x = 0; x <= SPIKE_WIDTH_PX; x++) {
    const h = spikeHeightAtOffset(x);
    if (h <= 0) continue;
    snapshot.spikeColumns.push({
      x: spikeLeft + x,
      top: 460 - h,
      bottom: 460,
    });
  }

  snapshot.overlapHeight = spikeOverlapHeight(player, frontObstacle);
  snapshot.requiredJump = snapshot.overlapHeight;
  snapshot.spikeBehind = spikeFullyBehindPlayer(player, frontObstacle);
  return snapshot;
}

function debugEnabledFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const value = params.get('debug');
  return value === '1' || value === 'true';
}

function toggleDebugHotkey(enabled, key) {
  if (key !== 'F3') {
    return { handled: false, enabled };
  }
  return { handled: true, enabled: !enabled };
}

function contactActionForPlayer(player, animState) {
  if (player.state === 'jumping') return 'jump';
  if (playerIsCrouching(player, animState)) return 'crouch';
  if (!animState) return null;
  if (animState.state === 'attack') return 'attack';
  if (animState.state === 'block') return 'block';
  return null;
}

function resolveContactAction(player, obstacles, animState) {
  if (obstacles.length === 0) {
    return { player, obstacles, action: null };
  }

  const frontObstacle = obstacles[0];
  if (frontObstacle.type === 'spikes') {
    if (spikeTouchesPlayer(player, frontObstacle)) {
      return {
        player: applyMiss(player),
        obstacles: obstacles.slice(1),
        action: player.state === 'jumping' ? 'jump' : SPIKE_RESOLVE_ACTION,
        grade: 'miss',
      };
    }

    if (spikeFullyBehindPlayer(player, frontObstacle)) {
      const grade = spikeClearGrade(player, frontObstacle);
      return {
        player: grade === 'miss' ? applyMiss(player) : applyGradeOutcome(player, grade),
        obstacles: obstacles.slice(1),
        action: grade === 'miss' ? SPIKE_RESOLVE_ACTION : 'jump',
        grade,
      };
    }

    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'bird') {
    if (birdTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player: applyMiss(player),
        obstacles: obstacles.slice(1),
        action: contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade: 'miss',
      };
    }

    if (birdFullyBehindPlayer(player, frontObstacle, animState)) {
      return {
        player: applyGood(player),
        obstacles: obstacles.slice(1),
        action: contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade: 'good',
      };
    }

    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'arrowwall') {
    const grade = gradeInput(frontObstacle, player.distance);
    if (shieldBlocksArrowWall(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player: grade === 'perfect' ? applyPerfect(player) : applyGood(player),
        obstacles: obstacles.slice(1),
        action: 'block',
        grade,
      };
    }

    if (arrowWallTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player: applyMiss(player),
        obstacles: obstacles.slice(1),
        action: contactActionForPlayer(player, animState) || ARROWWALL_RESOLVE_ACTION,
        grade: 'miss',
      };
    }

    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'goblin') {
    const grade = gradeInput(frontObstacle, player.distance);
    if (swordHitsGoblin(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player: grade === 'perfect' ? applyPerfect(player) : applyGood(player),
        obstacles: obstacles.slice(1),
        action: 'attack',
        grade,
      };
    }

    if (goblinTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player: applyMiss(player),
        obstacles: obstacles.slice(1),
        action: contactActionForPlayer(player, animState) || GOBLIN_RESOLVE_ACTION,
        grade: 'miss',
      };
    }

    return { player, obstacles, action: null };
  }

  const grade = gradeInput(frontObstacle, player.distance);
  if (grade === 'miss') {
    return { player, obstacles, action: null };
  }

  const action = contactActionForPlayer(player, animState);
  if (!action) {
    return { player, obstacles, action: null };
  }

  const result = processAction(player, obstacles, action);
  return { ...result, action };
}

// ─── Jump physics ─────────────────────────────────────────────────────────────
function startJump(player) {
  if (player.state !== 'running') return player;
  return {
    ...player,
    state: 'jumping',
    jumpY: 0,
    jumpVY: JUMP_VY,
    jumpStartDistance: player.distance,
  };
}

function tickJumpArc(player) {
  if (player.state !== 'jumping') return player;
  const newVY = player.jumpVY - JUMP_GRAVITY;
  const newY  = player.jumpY + newVY;
  if (newY <= 0) {
    return { ...player, state: 'running', jumpY: 0, jumpVY: 0, jumpStartDistance: null };
  }
  return { ...player, jumpY: newY, jumpVY: newVY };
}

// ─── tickFrame ────────────────────────────────────────────────────────────────
// Advances game state by one frame. Pure function — no side effects.
function tickFrame(state) {
  if (state.phase !== 'playing') return state;

  const elapsed    = state.elapsed + 1;
  const elapsedSec = elapsed / 60;

  // Advance distances (skip finished players)
  let boy  = state.boy.state  !== 'finished' ? advanceDistance(state.boy)  : state.boy;
  let girl = state.girl.state !== 'finished' ? advanceDistance(state.girl) : state.girl;

  // Assist checks
  boy  = checkAssist(boy,  elapsedSec);
  girl = checkAssist(girl, elapsedSec);
  boy  = deactivateAssistIfRecovered(boy,  elapsedSec);
  girl = deactivateAssistIfRecovered(girl, elapsedSec);

  // Jump arcs
  boy  = tickJumpArc(boy);
  girl = tickJumpArc(girl);

  // Reaching the finish line ends obstacle processing for that side immediately.
  if (isFinished(boy)  && boy.state  !== 'finished') boy  = { ...boy,  state: 'finished' };
  if (isFinished(girl) && girl.state !== 'finished') girl = { ...girl, state: 'finished' };

  // Auto-miss expired obstacles
  let boyObs = state.boyObstacles;
  let girlObs = state.girlObstacles;
  let boyResolved = [];
  let girlResolved = [];

  if (boy.state === 'finished') {
    boyObs = [];
  } else {
    const boyResult = processMissedObstacles(boy, state.boyObstacles);
    boy = boyResult.player;
    boyObs = boyResult.obstacles;
    boyResolved = boyResult.resolved || [];
  }

  if (girl.state === 'finished') {
    girlObs = [];
  } else {
    const girlResult = processMissedObstacles(girl, state.girlObstacles);
    girl = girlResult.player;
    girlObs = girlResult.obstacles;
    girlResolved = girlResult.resolved || [];
  }

  // Determine new phase
  let phase = state.phase;
  let phaseFrames = state.phaseFrames;
  let runSummary = state.runSummary;
  if (elapsed >= HARD_CUTOFF_FRAMES) {
    phase = 'gameover';
    phaseFrames = 0;
    runSummary = evaluateRun(boy, girl);
  } else if (boy.state === 'finished' && girl.state === 'finished') {
    phase = 'reunion';
    phaseFrames = 0;
    runSummary = evaluateRun(boy, girl);
  }

  return {
    ...state,
    elapsed,
    phase,
    boy,
    girl,
    boyObstacles:  boyObs,
    girlObstacles: girlObs,
    boyResolved,
    girlResolved,
    phaseFrames,
    runSummary,
  };
}

const GAMEOVER_HOLD_FRAMES = 120;  // 2 seconds

function advancePhaseState(state) {
  if (state.phase !== 'reunion' && state.phase !== 'gameover') return state;

  const phaseFrames = state.phaseFrames + 1;
  const holdFrames  = state.phase === 'reunion' ? END_PHASE_HOLD_FRAMES : GAMEOVER_HOLD_FRAMES;
  if (phaseFrames < holdFrames) {
    return { ...state, phaseFrames };
  }

  return {
    ...state,
    phase: 'score_screen',
    phaseFrames,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
function nextActionForSide(inp, side) {
  if (inp.isHeld(side, 'crouch')) return 'crouch';
  if (inp.isPressed(side, 'jump')) return 'jump';
  if (inp.isPressed(side, 'attack')) return 'attack';
  if (inp.isPressed(side, 'block')) return 'block';
  if (inp.isPressed(side, 'crouch')) return 'crouch';
  return null;
}

export {
  createGameState,
  processAction,
  processMissedObstacles,
  summarizeObstacleOutcome,
  classifyAutoResolvedObstacle,
  spikeHeightAtOffset,
  spikeTouchesPlayer,
  birdTouchesPlayer,
  buildDebugCollisionSnapshot,
  debugEnabledFromSearch,
  debugObstacleTypeFromSearch,
  toggleDebugHotkey,
  contactActionForPlayer,
  resolveContactAction,
  startJump,
  tickJumpArc,
  tickFrame,
  advancePhaseState,
  nextActionForSide,
  JUMP_VY,
  JUMP_GRAVITY,
  HARD_CUTOFF_FRAMES,
  END_PHASE_HOLD_FRAMES,
  initGame,
};

// ─── Browser entry point ──────────────────────────────────────────────────────
function initGame() {
  // ── Image loading ──────────────────────────────────────────────────────────
  const boyImg   = new Image();  boyImg.src   = 'images/boy.png';
  const girlImg  = new Image();  girlImg.src  = 'images/girl.png';
  const swordImg = new Image();  swordImg.src = 'images/SHORT SWORD.png';
  const bird1    = new Image();  bird1.src    = 'images/red1.png';
  const bird2    = new Image();  bird2.src    = 'images/red2.png';
  const bird3    = new Image();  bird3.src    = 'images/red3.png';
  const goblinIdle    = new Image(); goblinIdle.src    = 'images/goblin-idle.png';
  const goblinAttack  = new Image(); goblinAttack.src  = 'images/goblin-attack.png';
  const goblinTakeHit = new Image(); goblinTakeHit.src = 'images/goblin-take-hit.png';
  const goblinDeath   = new Image(); goblinDeath.src   = 'images/goblin-death.png';
  const arrowsImg     = new Image(); arrowsImg.src     = 'images/arrows.png';

  const images = {
    boy: boyImg,
    girl: girlImg,
    sword: swordImg,
    birds: [bird1, bird2, bird3],
    goblinIdle,
    goblinAttack,
    goblinTakeHit,
    goblinDeath,
    arrows: arrowsImg,
  };

  // ── Sounds ────────────────────────────────────────────────────────────────
  const sounds = createSounds();

  // ── Canvas + renderer ─────────────────────────────────────────────────────
  const canvas   = document.getElementById('gameCanvas');
  const renderer = createRenderer(canvas, images);
  const search = window.location && window.location.search;
  const debugObstacleType = debugObstacleTypeFromSearch(search);
  let debugEnabled = debugEnabledFromSearch(search);

  // ── Input ─────────────────────────────────────────────────────────────────
  const inp = createInput();
  window.addEventListener('keydown', e => {
    const toggle = toggleDebugHotkey(debugEnabled, e.key);
    if (toggle.handled) {
      debugEnabled = toggle.enabled;
      if (typeof e.preventDefault === 'function') e.preventDefault();
      return;
    }
    if (keyToAction(e.key) && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    inp.keydown(e.key);
  });
  window.addEventListener('keyup',   e => inp.keyup(e.key));

  // ── Game state ────────────────────────────────────────────────────────────
  let gs = createGameState('single', Date.now() >>> 0, { debugObstacleType });

  // ── Action state timing ───────────────────────────────────────────────────
  // Tracks ticks since current action started (for renderer animState)
  let boyAnim  = { state: 'running', actionTick: 0 };
  let girlAnim = { state: 'running', actionTick: 0 };
  const ACTION_DURATION = 18; // frames (3 steps × 6 ticks each)
  const HIT_DURATION    = 30; // frames player stays in hit state

  // ── State-machine helpers ─────────────────────────────────────────────────
  function startPlaying() {
    sounds.stop('run-success');
    sounds.stop('run-failed');
    gs = { ...createGameState(gs.mode, Date.now() >>> 0, { debugObstacleType }), phase: 'playing' };
    boyAnim  = { state: 'running', actionTick: 0 };
    girlAnim = { state: 'running', actionTick: 0 };
    inp.tick(); // clear the keypress that triggered the transition
  }

  function handleMenuInput() {
    // Any action key from either side starts game from menu/gameover/score screens
    const anyPressed =
      inp.isPressed('boy',  'jump')  || inp.isPressed('boy',  'attack') ||
      inp.isPressed('boy',  'block') || inp.isPressed('boy',  'crouch') ||
      inp.isPressed('girl', 'jump')  || inp.isPressed('girl', 'attack') ||
      inp.isPressed('girl', 'block') || inp.isPressed('girl', 'crouch');

    if (anyPressed) startPlaying();
  }

  // ── Apply input for one side each frame ───────────────────────────────────
  function handleSideInput(side) {
    const getPlayer = () => (side === 'boy' ? gs.boy : gs.girl);
    if (getPlayer().state === 'finished') return;
    const getObstacles = () => (side === 'boy' ? gs.boyObstacles : gs.girlObstacles);
    const anim      = side === 'boy' ? boyAnim : girlAnim;
    let interacted = false;

    function applyResolvedResult(playerBefore, result, frontObs) {
      const outcome = summarizeObstacleOutcome(playerBefore, result, frontObs);
      const gotHit = outcome.hit;

      if (side === 'boy') {
        gs = { ...gs, boy: result.player, boyObstacles: result.obstacles };
      } else {
        gs = { ...gs, girl: result.player, girlObstacles: result.obstacles };
      }

      if (outcome.feedback) {
        renderer.addOutcomeEffect(side, outcome.feedback, outcome.effectType);
      }

      if (outcome.linger) {
        renderer.addTrailObstacle(side, frontObs);
      }

      if (outcome.goblinDeath) {
        renderer.addDyingGoblin(side, frontObs, playerBefore.distance);
        sounds.play('sword-success');
        sounds.play('goblin-death');
      }

      if (outcome.feedback === 'good' || outcome.feedback === 'perfect') {
        if (frontObs && frontObs.type === 'bird') sounds.play('bird');
        if (frontObs && frontObs.type === 'arrowwall') sounds.play('shield-success');
      }

      if (gotHit) {
        anim.state = 'hit';
        anim.actionTick = 0;
        sounds.play('player-hit');
      }

      return outcome;
    }

    const crouchHeld = inp.isHeld(side, 'crouch');
    const enteringHeldCrouch = crouchHeld && anim.state !== 'crouch';
    if (crouchHeld && anim.state !== 'hit') {
      anim.state = 'crouch';
      if (enteringHeldCrouch) {
        anim.actionTick = 0;
        sounds.play('crouch');
      }
    }

    if (side === 'boy') {
      const wasJumping = crouchHeld && gs.boy.state === 'jumping';
      gs = { ...gs, boy: { ...gs.boy, state: crouchHeld ? 'crouching' : (gs.boy.state === 'crouching' ? 'running' : gs.boy.state), ...(wasJumping ? { jumpY: 0, jumpVY: 0, jumpStartDistance: null } : {}) } };
    } else {
      const wasJumping = crouchHeld && gs.girl.state === 'jumping';
      gs = { ...gs, girl: { ...gs.girl, state: crouchHeld ? 'crouching' : (gs.girl.state === 'crouching' ? 'running' : gs.girl.state), ...(wasJumping ? { jumpY: 0, jumpVY: 0, jumpStartDistance: null } : {}) } };
    }

    const action = crouchHeld ? null : nextActionForSide(inp, side);
    if (action) {

      // Input sounds — play immediately on keypress
      if (action === 'jump' && inp.isPressed(side, 'jump')) sounds.play('jump');
      if (action === 'attack' && inp.isPressed(side, 'attack')) sounds.play('sword');
      if (action === 'block' && inp.isPressed(side, 'block')) sounds.play('shield');

      const player = getPlayer();
      const obstacles = getObstacles();

      // Stash front obstacle before processAction removes it
      const frontObs = obstacles[0];

      // Process obstacle grading
      const result = processAction(player, obstacles, action);
      const outcome = applyResolvedResult(player, result, frontObs);
      interacted = interacted || outcome.consumed;

      // Update visual state (jump keeps 'running' — walk cycle continues, jumpY handles position)
      if (!outcome.hit && action !== 'jump') {
        anim.state = action;
        anim.actionTick = 0;
      }

      // Jump arc
      if (action === 'jump') {
        const updated = startJump(side === 'boy' ? gs.boy : gs.girl);
        if (side === 'boy') gs = { ...gs, boy: updated };
        else                gs = { ...gs, girl: updated };
      }
    }

    if (!interacted) {
      const player = getPlayer();
      const obstacles = getObstacles();
      const frontObs = obstacles[0];
      const contactResult = resolveContactAction(player, obstacles, anim);
      if (contactResult.action) {
        applyResolvedResult(player, contactResult, frontObs);
      }
    }

    if (anim.state === 'crouch' && !crouchHeld) {
      anim.state = 'running';
      anim.actionTick = 0;
    }

    // Advance action timer; crouch is held, other actions remain one-shot.
    if (anim.state === 'attack' || anim.state === 'hit' || anim.state === 'block') {
      anim.actionTick++;
      const dur = anim.state === 'hit' ? HIT_DURATION : ACTION_DURATION;
      if (anim.actionTick >= dur) {
        anim.state = 'running';
        anim.actionTick = 0;
      }
    }
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  function loop() {
    if (gs.phase === 'menu' || gs.phase === 'score_screen') {
      handleMenuInput();
    }

    if (gs.phase === 'playing') {
      handleSideInput('boy');
      handleSideInput('girl');

      const phaseBefore = gs.phase;
      const boyFinishedBefore = gs.boy.state === 'finished';
      const girlFinishedBefore = gs.girl.state === 'finished';
      gs = tickFrame(gs);
      if (!boyFinishedBefore && gs.boy.state === 'finished') {
        renderer.clearSideObstacleVisuals('boy');
      }
      if (!girlFinishedBefore && gs.girl.state === 'finished') {
        renderer.clearSideObstacleVisuals('girl');
      }
      if (gs.phase !== phaseBefore) {
        if (gs.phase === 'reunion') sounds.play('run-success');
        if (gs.phase === 'gameover') sounds.play('run-failed');
      }

      for (const outcome of gs.boyResolved || []) {
        if (outcome.feedback) {
          renderer.addOutcomeEffect('boy', outcome.feedback, outcome.effectType);
        }
        if (outcome.linger) {
          renderer.addTrailObstacle('boy', outcome.obstacle);
        }
        if (outcome.hit && boyAnim.state !== 'hit') {
          boyAnim.state = 'hit'; boyAnim.actionTick = 0;
          sounds.play('player-hit');
        }
      }
      for (const outcome of gs.girlResolved || []) {
        if (outcome.feedback) {
          renderer.addOutcomeEffect('girl', outcome.feedback, outcome.effectType);
        }
        if (outcome.linger) {
          renderer.addTrailObstacle('girl', outcome.obstacle);
        }
        if (outcome.hit && girlAnim.state !== 'hit') {
          girlAnim.state = 'hit'; girlAnim.actionTick = 0;
          sounds.play('player-hit');
        }
      }
    } else if (gs.phase === 'reunion' || gs.phase === 'gameover') {
      gs = advancePhaseState(gs);
    }

    // Sync visual state fields that renderer reads
    const boyPlayer  = { ...gs.boy,  animState: boyAnim };
    const girlPlayer = { ...gs.girl, animState: girlAnim };
    const debugHint = debugObstacleType
      ? `yellow=obstacle cyan=player green=perfect/shield magenta=sword only=${DEBUG_OBSTACLE_LABELS[debugObstacleType]}`
      : 'yellow=obstacle cyan=player green=perfect/shield magenta=sword';
    const debugState = debugEnabled ? {
      enabled: true,
      hint: debugHint,
      boy: buildDebugCollisionSnapshot(boyPlayer, gs.boyObstacles, boyAnim),
      girl: buildDebugCollisionSnapshot(girlPlayer, gs.girlObstacles, girlAnim),
    } : null;

    const elapsed = gs.elapsed / 60; // convert frames → seconds for renderer

    if (gs.phase === 'menu') {
      renderer.renderMenu(debugState);
    } else if (gs.phase === 'playing') {
      renderer.renderPlay(
        boyPlayer, girlPlayer,
        gs.boyObstacles, gs.girlObstacles,
        gs.boyBoosts, gs.girlBoosts,
        elapsed,
        debugState
      );
    } else if (gs.phase === 'reunion') {
      renderer.renderReunion(boyPlayer, girlPlayer, gs.phaseFrames);
    } else if (gs.phase === 'gameover') {
      renderer.renderGameOver(gs.boy, gs.girl, gs.runSummary);
    } else if (gs.phase === 'score_screen') {
      renderer.renderScore(gs.boy, gs.girl, gs.runSummary);
    }

    inp.tick(); // clear pressed state at end of frame so isPressed is one-shot
    requestAnimationFrame(loop);
  }

  // Start when images load
  let loaded = 0;
  const totalImages = Object.values(images).flat().length;
  function onLoad() {
    if (++loaded >= totalImages) loop();
  }
  [
    boyImg,
    girlImg,
    swordImg,
    bird1,
    bird2,
    bird3,
    goblinIdle,
    goblinAttack,
    goblinTakeHit,
    goblinDeath,
    arrowsImg,
  ].forEach(img => {
    img.onload  = onLoad;
    img.onerror = onLoad;
  });
}
