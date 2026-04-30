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
  requiredInput, gradeInput, windowExpired, makeRng,
  WAVE_COUNTS,
} from './obstacles.js';
import { evaluateRun } from './scoring.js';
import { normalizeDebugObstacleType } from './debug-flags.js';

const GAMEOVER_HOLD_FRAMES = 120; // 2 seconds

// ── Grade helpers ──────────────────────────────────────────────────────────────

function applyGradeOutcome(player, grade) {
  if (grade === 'perfect') return applyPerfect(player);
  if (grade === 'good')    return applyGood(player);
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

  let newPlayer;
  if (action !== required) {
    newPlayer = applyMiss(player);
    return { player: newPlayer, obstacles: obstacles.slice(1), grade: 'miss' };
  }

  if (grade === 'perfect')     newPlayer = applyPerfect(player);
  else if (grade === 'good')   newPlayer = applyGood(player);
  else                         newPlayer = applyMiss(player);

  return { player: newPlayer, obstacles: obstacles.slice(1), grade };
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
        p = applyMiss(p);
        resolved.push({ obstacle: frontObstacle, grade: 'miss', ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss') });
        obs = obs.slice(1);
        continue;
      }
      if (spikeFullyBehindPlayer(p, frontObstacle)) {
        const before = p;
        const grade  = spikeClearGrade(p, frontObstacle);
        p = grade === 'miss' ? applyMiss(p) : applyGradeOutcome(p, grade);
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
        p = applyMiss(p);
        resolved.push({ obstacle: frontObstacle, grade: 'miss', ...classifyAutoResolvedObstacle(before, p, frontObstacle, 'miss') });
        obs = obs.slice(1);
        continue;
      }
      if (birdFullyBehindPlayer(p, frontObstacle, animState)) {
        const grade = 'good';
        p = applyGood(p);
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
    p = applyMiss(p);
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
        player: applyMiss(player),
        obstacles: obstacles.slice(1),
        action: player.state === 'jumping' ? 'jump' : SPIKE_RESOLVE_ACTION,
        grade: 'miss',
      };
    }
    if (spikeFullyBehindPlayer(player, frontObstacle)) {
      const grade = spikeClearGrade(player, frontObstacle);
      return {
        player:    grade === 'miss' ? applyMiss(player) : applyGradeOutcome(player, grade),
        obstacles: obstacles.slice(1),
        action:    grade === 'miss' ? SPIKE_RESOLVE_ACTION : 'jump',
        grade,
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'bird') {
    if (birdTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    applyMiss(player),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade:     'miss',
      };
    }
    if (birdFullyBehindPlayer(player, frontObstacle, animState)) {
      return {
        player:    applyGood(player),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || BIRD_RESOLVE_ACTION,
        grade:     'good',
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'arrowwall') {
    const grade = gradeInput(frontObstacle, player.distance);
    if (shieldBlocksArrowWall(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player:    grade === 'perfect' ? applyPerfect(player) : applyGood(player),
        obstacles: obstacles.slice(1),
        action:    'block',
        grade,
      };
    }
    if (arrowWallTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    applyMiss(player),
        obstacles: obstacles.slice(1),
        action:    contactActionForPlayer(player, animState) || ARROWWALL_RESOLVE_ACTION,
        grade:     'miss',
      };
    }
    return { player, obstacles, action: null };
  }

  if (frontObstacle.type === 'goblin') {
    const grade = gradeInput(frontObstacle, player.distance);
    if (swordHitsGoblin(player, frontObstacle, animState) && grade !== 'miss') {
      return {
        player:    grade === 'perfect' ? applyPerfect(player) : applyGood(player),
        obstacles: obstacles.slice(1),
        action:    'attack',
        grade,
      };
    }
    if (goblinTouchesPlayer(player, frontObstacle, animState)) {
      return {
        player:    applyMiss(player),
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
  return { ...player, state: 'jumping', jumpY: 0, jumpVY: JUMP_VY, jumpStartDistance: player.distance };
}

function tickJumpArc(player) {
  if (player.state !== 'jumping') return player;
  const newVY = player.jumpVY - JUMP_GRAVITY;
  const newY  = player.jumpY + newVY;
  if (newY <= 0) return { ...player, state: 'running', jumpY: 0, jumpVY: 0, jumpStartDistance: null };
  return { ...player, jumpY: newY, jumpVY: newVY };
}

function finishPlayer(player) {
  return { ...player, state: 'finished', jumpY: 0, jumpVY: 0, jumpStartDistance: null };
}

// ── Side frame tick ────────────────────────────────────────────────────────────

function tickSideFrame(player, obstacles, elapsedSec, simulate = true) {
  if (!simulate) return { player, obstacles, resolved: [] };

  let nextPlayer = player.state !== 'finished' ? advanceDistance(player) : player;
  nextPlayer = checkAssist(nextPlayer, elapsedSec);
  nextPlayer = deactivateAssistIfRecovered(nextPlayer, elapsedSec);
  nextPlayer = tickJumpArc(nextPlayer);

  if (isFinished(nextPlayer) && nextPlayer.state !== 'finished') {
    nextPlayer = finishPlayer(nextPlayer);
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
  const boyResult  = tickSideFrame(state.boy,  state.boyObstacles,  elapsedSec, simulatedSides.boy  !== false);
  const girlResult = tickSideFrame(state.girl, state.girlObstacles, elapsedSec, simulatedSides.girl !== false);
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

export {
  GAMEOVER_HOLD_FRAMES,
  applyGradeOutcome,
  spikeTimingGrade,
  spikeClearGrade,
  animStateForPlayerState,
  obstacleCourseForDebug,
  createGameState,
  processAction,
  classifyAutoResolvedObstacle,
  summarizeObstacleOutcome,
  processMissedObstacles,
  resolveContactAction,
  startJump,
  tickJumpArc,
  finishPlayer,
  tickSideFrame,
  tickFrame,
  advancePhaseState,
  nextActionForSide,
  shouldHandleMappedKeyLocally,
};
