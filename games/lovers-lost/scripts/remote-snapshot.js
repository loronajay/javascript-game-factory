import { applyLaneSnapshot } from './lane-snapshot.js';

function applyRemoteResolvedVisuals(renderer, side, resolved, consumedObstacles, playerBeforeDistance) {
  for (let i = 0; i < resolved.length; i++) {
    const outcome  = resolved[i];
    const obstacle = consumedObstacles[i] || null;
    if (outcome.feedback)                renderer.addOutcomeEffect(side, outcome.feedback, outcome.effectType);
    if (outcome.linger && obstacle)      renderer.addTrailObstacle(side, obstacle);
    if (outcome.goblinDeath && obstacle) renderer.addDyingGoblin(side, obstacle, playerBeforeDistance);
  }
}

// Returns { gs, boyAnim, girlAnim } with the remote side applied, or null if snapshot was stale/ignored.
// Mutates remoteLaneSeq[side] in place (it is a stable reference object owned by the caller).
function applyRemoteSnapshot({ gs, boyAnim, girlAnim, remoteLaneSeq }, renderer, side, snapshot) {
  if (gs.mode !== 'online' || gs.phase !== 'playing') return null;
  const currentLane = side === 'boy'
    ? { player: gs.boy,  obstacles: gs.boyObstacles,  anim: boyAnim }
    : { player: gs.girl, obstacles: gs.girlObstacles, anim: girlAnim };
  const applied = applyLaneSnapshot(currentLane, snapshot, remoteLaneSeq[side]);
  if (!applied.applied) return null;

  remoteLaneSeq[side] = applied.lastSeq;
  applyRemoteResolvedVisuals(renderer, side, applied.resolved, applied.consumedObstacles, currentLane.player.distance);

  const newGs      = side === 'boy'
    ? { ...gs, boy:  applied.player, boyObstacles:  applied.obstacles, boyResolved:  [] }
    : { ...gs, girl: applied.player, girlObstacles: applied.obstacles, girlResolved: [] };
  const newBoyAnim  = side === 'boy'  ? { ...applied.anim } : boyAnim;
  const newGirlAnim = side === 'girl' ? { ...applied.anim } : girlAnim;

  if (currentLane.player.state !== 'finished' && applied.player.state === 'finished') {
    renderer.clearSideObstacleVisuals(side);
  }
  return { gs: newGs, boyAnim: newBoyAnim, girlAnim: newGirlAnim };
}

export { applyRemoteResolvedVisuals, applyRemoteSnapshot };
