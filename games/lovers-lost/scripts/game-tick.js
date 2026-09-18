import {
  JUMP_VY, JUMP_GRAVITY,
  HARD_CUTOFF_FRAMES, END_PHASE_HOLD_FRAMES,
  SPIKE_RESOLVE_ACTION, BIRD_RESOLVE_ACTION,
  ARROWWALL_RESOLVE_ACTION, GOBLIN_RESOLVE_ACTION,
} from './game-constants.js';
import {
  spikeTouchesPlayer, spikeFullyBehindPlayer,
  birdTouchesPlayer, birdFullyBehindPlayer,
  shieldBlocksArrowWall, arrowWallTouchesPlayer,
  swordHitsGoblin, goblinTouchesPlayer,
  contactActionForPlayer,
} from './collision.js';
import {
  createPlayer, advanceDistance, isFinished,
  applyPerfect, applyGood, applyMiss,
  checkAssist, deactivateAssistIfRecovered,
  STARTING_SPEED,
} from './player.js';
import {
  createObstacle, generateWarmup, generateWave,
  requiredInput, gradeInput, gradeSpikeJump, windowExpired, makeRng,
  WAVE_COUNTS,
} from './obstacles.js';
import { evaluateRun } from './scoring.js';
import { recordObstacleOutcome } from './lane-stats.js';
import { normalizeDebugObstacleType } from './debug-flags.js';

const GAMEOVER_HOLD_FRAMES = 120; // 2 seconds

// ── Grade helpers ──────────────────────────────────────────────────────────────

function applyGradeOutcome(player, grade) {
  if (grade === 'perfect') return applyPerfect(player);
  if (grade === 'good')    return applyGood(player);
  return applyMiss(player);
}

// The one place an obstacle's resolved grade becomes player state: score/speed
// through applyGradeOutcome, telemetry through recordObstacleOutcome. Every
// resolution branch below goes through here so the grade the renderer shows,
// the grade the snapshot ships and the grade the achievement claim reports are
// the same value.
function resolveObstacleGrade(player, obstacle, grade) {
  return recordObstacleOutcome(applyGradeOutcome(player, grade), obstacle, grade);
}

// A spike chain (two spikes within SPIKE_CHAIN_MAX_SPACING) is cleared by one
// jump. The second spike is graded as if the jump had been taken for it at
// the same lateness — so a Perfect jump over a chain is Perfect for every
// spike it clears, instead of the trailing spikes being capped at Good by a
// jump start that belonged to the first. `jumpChainAnchor` is the position of
// the last spike this jump cleared and is dropped on landing.
function spikeTimingGrade(player, obstacle) {
  if (player.jumpStartDistance == null) return 'miss';
  const anchor = player.jumpChainAnchor;
  const start  = player.jumpStartDistance + (anchor != null ? obstacle.position - anchor : 0);
  return gradeSpikeJump(obstacle, start, player.speed);
}

// Resolves a spike the runner got over: grade it, tally it, and if the jump
// is still in the air remember this spike as the chain anchor.
function resolveSpikeClear(player, obstacle) {
  const grade = spikeClearGrade(player, obstacle);
  let next = resolveObstacleGrade(player, obstacle, grade);
  if (next.state === 'jumping') next = { ...next, jumpChainAnchor: obstacle.position };
  return { player: next, grade };
}

// A spike that ends up behind the player was cleared. Timing decides between
// Perfect (jump started inside the perfect window) and Good (any other jump
// that got over it — including one started before the window opened).
function spikeClearGrade(player, obstacle) {
  const grade = spikeTimingGrade(player, obstacle);
  if (grade === 'perfect') return 'perfect';
  return 'good';
}

function birdTimingGrade(player, obstacle) {
  if (player.crouchStartDistance == null) return 'miss';
  return gradeInput(obstacle, player.crouchStartDistance, player.speed);
}

// Mirror of spikeClearGrade for the bird: the crouch's start distance is graded
// against the bird's window. Before this the bird was the one obstacle whose
// clear was always Good, so Perfect execution was impossible on it.
function birdClearGrade(player, obstacle) {
  const grade = birdTimingGrade(player, obstacle);
  if (grade === 'perfect') return 'perfect';
  return 'good';
}

function animStateForPlayerState(player) {
  if (player && player.state === 'crouching') return { state: 'crouch', actionTick: 0 };
  return { state: 'running', actionTick: 0 };
}

// ── Obstacle course helpers ────────────────────────────────────────────────────

function obstacleCourseForDebug(obstacles, debugObstacleType) {
  const onlyType = normalizeDebugObstacleType(debugObstacleType);
  if (!onlyType) return obstacles;
  return obstacles.map(obstacle => createObstacle(onlyType, obstacle.position));
}

// ── createGameState ────────────────────────────────────────────────────────────

function createGameState(mode, seed, options) {
  const rng  = makeRng(seed != null ? seed : (Date.now() >>> 0));
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
    phase:         'menu',
    mode:          mode || 'single',
    elapsed:       0,
    boy:           { ...createPlayer('boy'),  speed: STARTING_SPEED },
    girl:          { ...createPlayer('girl'), speed: STARTING_SPEED },
    boyObstacles:  allObstacles.map(o => ({ ...o })),
    girlObstacles: allObstacles.map(o => ({ ...o })),
    boyBoosts:     [],
    girlBoosts:    [],
    phaseFrames:   0,
    runSummary:    null,
    seed:          seed != null ? seed : 0,
    debugObstacleType,
  };
}

// ── processAction ──────────────────────────────────────────────────────────────

function processAction(player, obstacles, action) {
  if (obstacles.length === 0) return { player, obstacles };

  const obs = obstacles[0];
  if (obs.type === 'spikes' || obs.type === 'bird' || obs.type === 'arrowwall' || obs.type === 'goblin') {
    return { player, obstacles };
  }
  const required = requiredInput(obs);
  const grade    = gradeInput(obs, player.distance);

  if (grade === 'miss' && !windowExpired(obs, player.distance)) {
    return { player, obstacles };
  }

  if (action !== required) {
    return { player: resolveObstacleGrade(player, obs, 'miss'), obstacles: obstacles.slice(1), grade: 'miss' };
  }

  return { player: resolveObstacleGrade(player, obs, grade), obstacles: obstacles.slice(1), grade };
}

// ── Auto-resolution helpers ────────────────────────────────────────────────────

function classifyAutoResolvedObstacle(playerBefore, playerAfter, obstacle, grade) {
  const hit   = grade === 'miss';
  const clear = grade === 'perfect' || grade === 'good';
  return {
    hit,
    feedback:   hit ? 'hit' : (clear ? (grade === 'perfect' ? 'perfect' : 'good') : null),
    linger:     obstacle.type === 'spikes' || obstacle.type === 'bird',
    effectType: obstacle.type,
  };
}

function summarizeObstacleOutcome(playerBefore, result, frontObstacle) {
  if (!frontObstacle) return { consumed: false, hit: false, linger: false, goblinDeath: false, feedback: null, effectType: null };

  const consumed = result.player.obstaclesFaced > playerBefore.obstaclesFaced;
  if (!consumed) return { consumed: false, hit: false, linger: false, goblinDeath: false, feedback: null, effectType: null };

  const hit = result.grade === 'miss';
  return {
    consumed: true,
    hit,
    linger:      frontObstacle.type === 'spikes' || frontObstacle.type === 'bird',
    goblinDeath: !hit && frontObstacle.type === 'goblin',
    feedback:    hit ? 'hit' : (result.grade === 'perfect' ? 'perfect' : 'good'),
    effectType:  frontObstacle.type,
  };
}

// ── processMissedObstacles ─────────────────────────────────────────────────────

function processMissedObstacles(player, obstacles) {
  let p   = player;
  let obs = obstacles;
  const resolved = [];

  while (obs.length > 0) {
    const frontObstacle = obs[0];

    if (frontObstacle.type === 'spikes') {
      if (spikeTouchesPlayer(p, frontObstacle)) {
        const before = p;
        p = resolveObstacleGrade(p, frontObstacle, 'miss');
        resolved.push({ obstacle: frontObstacle, grade: 'miss', ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss') });
        obs = obs.slice(1);
        continue;
      }
      if (spikeFullyBehindPlayer(p, frontObstacle)) {
        const before = p;
        const cleared = resolveSpikeClear(p, frontObstacle);
        const grade   = cleared.grade;
        p = cleared.player;
        resolved.push({ obstacle: frontObstacle, grade, ...classifyAutoResolvedObstacle(before, p, frontObstacle, grade) });
        obs = obs.slice(1);
        continue;
      }
      break;
    }

    if (frontObstacle.type === 'bird') {
      const before    = p;
      const animState = animStateForPlayerState(p);
      if (birdTouchesPlayer(p, frontObstacle, animState)) {
        p = resolveObstacleGrade(p, frontObstacle, 'miss');
        resolved.push({ obstacle: frontObstacle, grade: 'miss', ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss') });
        obs = obs.slice(1);
        continue;
      }
      if (birdFullyBehindPlayer(p, frontObstacle, animState)) {
        const grade = birdClearGrade(p, frontObstacle);
        p = resolveObstacleGrade(p, frontObstacle, grade);
        resolved.push({ obstacle: frontObstacle, grade, ...classifyAutoResolvedObstacle(before, p, frontObstacle, grade) });
        obs = obs.slice(1);
        continue;
      }
      break;
    }

    if (frontObstacle.type === 'goblin' && requiredInput(frontObstacle) === 'attack') {
      if (!windowExpired(frontObstacle, p.distance)) break;
    }

    if (!windowExpired(frontObstacle, p.distance)) break;

    const before = p;
    p = resolveObstacleGrade(p, frontObstacle, 'miss');
    resolved.push({ obstacle: frontObstacle, grade: 'miss', ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss') });
    obs = obs.slice(1);
  }
  return { player: p, obstacles: obs, resolved };
}

// ── resolveContactAction ───────────────────────────────────────────────────────

function resolveContactAction(player, obstacles, animState) {
  if (obstacles.length === 0) return { player, obstacles, action: null };

  const frontObstacle = obstacles[0];

  if (frontObstacle.type === 'spikes') {
    if (spikeTouchesPlayer(player, frontObstacle)) {
      return {
        player: resolveObstacleGrade(player, frontObstacle, 'miss'),
        obstacles: obstacles.slice(1),
        action: player.state === 'jumping' ? 'jump' : SPIKE_RESOLVE_ACTION,
        grade: 'miss',
      };
    }
    if (spikeFullyBehindPlayer(player, frontObstacle)) {
      const cleared = resolveSpikeClear(player, frontObstacle);
      return {
        player:    cleared.player,
        obstacles: obstacles.slice(1),
        action:    'jump',
        grade:     cleared.grade,
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'bird') {
    if (birdTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    resolveObstacleGrade(player, frontObstacle, 'miss'),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade:     'miss',
      };
    }
    if (birdFullyBehindPlayer(player, frontObstacle, animState)) {
      const grade = birdClearGrade(player, frontObstacle);
      return {
        player:    resolveObstacleGrade(player, frontObstacle, grade),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade,
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'arrowwall') {
    const grade = gradeInput(frontObstacle, player.distance, player.speed);
    if (shieldBlocksArrowWall(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player:    resolveObstacleGrade(player, frontObstacle, grade),
        obstacles: obstacles.slice(1),
        action:    'block',
        grade,
      };
    }
    if (arrowWallTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    resolveObstacleGrade(player, frontObstacle, 'miss'),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || ARROWWALL_RESOLVE_ACTION,
        grade:     'miss',
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'goblin') {
    const grade = gradeInput(frontObstacle, player.distance, player.speed);
    if (swordHitsGoblin(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player:    resolveObstacleGrade(player, frontObstacle, grade),
        obstacles: obstacles.slice(1),
        action:    'attack',
        grade,
      };
    }
    if (goblinTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    resolveObstacleGrade(player, frontObstacle, 'miss'),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || GOBLIN_RESOLVE_ACTION,
        grade:     'miss',
      };
    }
    return { player, obstacles, action: null };
  }

  const grade = gradeInput(frontObstacle, player.distance);
  if (grade === 'miss') return { player, obstacles, action: null };

  const action = contactActionForPlayer(player, animState);
  if (!action) return { player, obstacles, action: null };

  const result = processAction(player, obstacles, action);
  return { ...result, action };
}

// ── Jump physics ───────────────────────────────────────────────────────────────

function startJump(player) {
  if (player.state !== 'running') return player;
  return { ...player, state: 'jumping', jumpY: 0, jumpVY: JUMP_VY, jumpStartDistance: player.distance, jumpChainAnchor: null };
}

// Applies the held-crouch input to the player's state. Entering a crouch stamps
// crouchStartDistance (the bird's timing reference); releasing clears it.
// Crouching mid-air cancels the jump, which is the pre-existing behaviour.
function applyCrouchHeld(player, crouchHeld) {
  if (player.state === 'finished') return player;
  if (crouchHeld) {
    if (player.state === 'crouching') return player;
    const wasJumping = player.state === 'jumping';
    return {
      ...player,
      state: 'crouching',
      crouchStartDistance: player.distance,
      ...(wasJumping ? { jumpY: 0, jumpVY: 0, jumpStartDistance: null, jumpChainAnchor: null } : {}),
    };
  }
  if (player.state === 'crouching') return { ...player, state: 'running', crouchStartDistance: null };
  return player;
}

function tickJumpArc(player) {
  if (player.state !== 'jumping') return player;
  const newVY = player.jumpVY - JUMP_GRAVITY;
  const newY  = player.jumpY + newVY;
  if (newY <= 0) return { ...player, state: 'running', jumpY: 0, jumpVY: 0, jumpStartDistance: null, jumpChainAnchor: null };
  return { ...player, jumpY: newY, jumpVY: newVY };
}

function finishPlayer(player, finishFrame = null) {
  return {
    ...player,
    state: 'finished', jumpY: 0, jumpVY: 0, jumpStartDistance: null, jumpChainAnchor: null, crouchStartDistance: null,
    finishFrame: player.finishFrame ?? finishFrame,
  };
}

// ── Side frame tick ────────────────────────────────────────────────────────────

function tickSideFrame(player, obstacles, elapsedSec, simulate = true, elapsedFrames = null) {
  if (!simulate) return { player, obstacles, resolved: [] };

  let nextPlayer = player.state !== 'finished' ? advanceDistance(player) : player;
  nextPlayer = checkAssist(nextPlayer, elapsedSec);
  nextPlayer = deactivateAssistIfRecovered(nextPlayer, elapsedSec);
  nextPlayer = tickJumpArc(nextPlayer);

  if (isFinished(nextPlayer) && nextPlayer.state !== 'finished') {
    nextPlayer = finishPlayer(nextPlayer, elapsedFrames ?? Math.round(elapsedSec * 60));
  }

  if (nextPlayer.state === 'finished') return { player: nextPlayer, obstacles: [], resolved: [] };

  const result = processMissedObstacles(nextPlayer, obstacles);
  return { player: result.player, obstacles: result.obstacles, resolved: result.resolved || [] };
}

// ── tickFrame ──────────────────────────────────────────────────────────────────

function tickFrame(state, options) {
  if (state.phase !== 'playing') return state;

  const elapsed    = state.elapsed + 1;
  const elapsedSec = elapsed / 60;
  const simulatedSides = options?.simulatedSides || {};
  const boyResult  = tickSideFrame(state.boy,  state.boyObstacles,  elapsedSec, simulatedSides.boy  !== false, elapsed);
  const girlResult = tickSideFrame(state.girl, state.girlObstacles, elapsedSec, simulatedSides.girl !== false, elapsed);
  const boy        = boyResult.player;
  const girl       = girlResult.player;
  const boyObs     = boyResult.obstacles;
  const girlObs    = girlResult.obstacles;
  const boyResolved  = boyResult.resolved  || [];
  const girlResolved = girlResult.resolved || [];

  let phase       = state.phase;
  let phaseFrames = state.phaseFrames;
  let runSummary  = state.runSummary;
  if (elapsed >= HARD_CUTOFF_FRAMES) {
    phase = 'gameover'; phaseFrames = 0; runSummary = evaluateRun(boy, girl, elapsed);
  } else if (boy.state === 'finished' && girl.state === 'finished') {
    phase = 'reunion';  phaseFrames = 0; runSummary = evaluateRun(boy, girl, elapsed);
  }

  return {
    ...state,
    elapsed, phase,
    boy, girl,
    boyObstacles:  boyObs,
    girlObstacles: girlObs,
    boyResolved,
    girlResolved,
    phaseFrames,
    runSummary,
  };
}

// ── advancePhaseState ──────────────────────────────────────────────────────────

function advancePhaseState(state) {
  if (state.phase !== 'reunion' && state.phase !== 'gameover') return state;
  const phaseFrames = state.phaseFrames + 1;
  const holdFrames  = state.phase === 'reunion' ? END_PHASE_HOLD_FRAMES : GAMEOVER_HOLD_FRAMES;
  if (phaseFrames < holdFrames) return { ...state, phaseFrames };
  return { ...state, phase: 'score_screen', phaseFrames };
}

// ── Input helpers ──────────────────────────────────────────────────────────────

function nextActionForSide(inp, side) {
  if (inp.isHeld(side, 'crouch'))    return 'crouch';
  if (inp.isPressed(side, 'jump'))   return 'jump';
  if (inp.isPressed(side, 'attack')) return 'attack';
  if (inp.isPressed(side, 'block'))  return 'block';
  if (inp.isPressed(side, 'crouch')) return 'crouch';
  return null;
}

function shouldHandleMappedKeyLocally(mode, onlineSide, mappedSide) {
  if (!mappedSide)          return true;
  if (mode !== 'online')    return true;
  return mappedSide === onlineSide;
}

function shouldHandleScoreScreenKeydown(phase, key) {
  return phase === 'score_screen' && typeof key === 'string' && key.length > 0;
}

export {
  GAMEOVER_HOLD_FRAMES,
  applyGradeOutcome,
  resolveObstacleGrade,
  spikeTimingGrade,
  spikeClearGrade,
  birdTimingGrade,
  birdClearGrade,
  animStateForPlayerState,
  obstacleCourseForDebug,
  createGameState,
  processAction,
  classifyAutoResolvedObstacle,
  summarizeObstacleOutcome,
  processMissedObstacles,
  resolveContactAction,
  startJump,
  applyCrouchHeld,
  tickJumpArc,
  finishPlayer,
  tickSideFrame,
  tickFrame,
  advancePhaseState,
  nextActionForSide,
  shouldHandleScoreScreenKeydown,
  shouldHandleMappedKeyLocally,
};
