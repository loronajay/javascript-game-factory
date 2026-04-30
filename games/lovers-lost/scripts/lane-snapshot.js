import { STARTING_SPEED } from './player.js';

function sanitizeResolvedOutcome(outcome) {
  return {
    feedback:   typeof outcome?.feedback   === 'string' ? outcome.feedback   : null,
    effectType: typeof outcome?.effectType === 'string' ? outcome.effectType : null,
    hit:        !!outcome?.hit,
    linger:     !!outcome?.linger,
    goblinDeath: !!outcome?.goblinDeath,
  };
}

function buildLaneSnapshot(player, obstacles, animState, resolved, elapsed, seq) {
  return {
    seq:           Math.max(0, Math.floor(seq || 0)),
    elapsed:       Math.max(0, Math.floor(elapsed || 0)),
    obstacleCount: Array.isArray(obstacles) ? obstacles.length : 0,
    player: {
      side:                player?.side || 'boy',
      speed:               player?.speed ?? STARTING_SPEED,
      score:               player?.score ?? 0,
      distance:            player?.distance ?? 0,
      chain:               player?.chain ?? 0,
      obstaclesFaced:      player?.obstaclesFaced ?? 0,
      state:               player?.state || 'running',
      jumpY:               player?.jumpY ?? 0,
      jumpVY:              player?.jumpVY ?? 0,
      jumpStartDistance:   player?.jumpStartDistance ?? null,
      assistActive:        !!player?.assistActive,
      assistOpportunities: player?.assistOpportunities ?? 0,
    },
    anim: {
      state:      animState?.state || 'running',
      actionTick: Math.max(0, Math.floor(animState?.actionTick || 0)),
    },
    resolved: Array.isArray(resolved) ? resolved.map(sanitizeResolvedOutcome) : [],
  };
}

function applyLaneSnapshot(currentLane, snapshot, lastSeq = -1) {
  const seq = Number(snapshot?.seq);
  if (!Number.isFinite(seq) || seq <= lastSeq) {
    return {
      applied: false,
      lastSeq,
      player:           currentLane.player,
      obstacles:        currentLane.obstacles,
      anim:             currentLane.anim,
      resolved:         [],
      consumedObstacles: [],
    };
  }

  const obstacleCount   = Math.max(0, Math.floor(Number(snapshot?.obstacleCount) || 0));
  const currentObstacles = Array.isArray(currentLane.obstacles) ? currentLane.obstacles : [];
  const consumedCount   = Math.max(0, currentObstacles.length - obstacleCount);
  const consumedObstacles = currentObstacles.slice(0, consumedCount);

  return {
    applied:  true,
    lastSeq:  Math.floor(seq),
    player: {
      ...currentLane.player,
      ...(snapshot?.player || {}),
      side:                currentLane.player?.side || snapshot?.player?.side || 'boy',
      jumpY:               snapshot?.player?.jumpY ?? 0,
      jumpVY:              snapshot?.player?.jumpVY ?? 0,
      jumpStartDistance:   snapshot?.player?.jumpStartDistance ?? null,
      assistActive:        !!snapshot?.player?.assistActive,
      assistOpportunities: snapshot?.player?.assistOpportunities ?? 0,
    },
    obstacles:        currentObstacles.slice(consumedCount),
    anim: {
      state:      snapshot?.anim?.state || 'running',
      actionTick: Math.max(0, Math.floor(snapshot?.anim?.actionTick || 0)),
    },
    resolved:         Array.isArray(snapshot?.resolved) ? snapshot.resolved.map(sanitizeResolvedOutcome) : [],
    consumedObstacles,
  };
}

export { sanitizeResolvedOutcome, buildLaneSnapshot, applyLaneSnapshot };
