import { ARENA_RADIUS } from "./match.js";

const normalize = (x, y) => {
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
};

/** Deterministic offline rival: recover from the rim, otherwise pressure the nearest pet. */
export function cpuControls(actor, players, tick) {
  const rimDistance = Math.hypot(actor.x, actor.y);
  const opponents = players.filter((player) => player.id !== actor.id && !player.eliminated);
  const duel = opponents.length === 1;
  if (!duel && rimDistance > ARENA_RADIUS * 0.84) {
    const inward = normalize(-actor.x, -actor.y);
    return { ...inward, bump: false };
  }

  const target = opponents.sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y) || a.id.localeCompare(b.id))[0];
  if (!target) return { x: 0, y: 0, bump: false };

  const distance = Math.hypot(target.x - actor.x, target.y - actor.y);
  const targetRadius = Math.hypot(target.x, target.y);
  const outward = normalize(target.x, target.y);
  const duelAggressor = duel && actor.id.localeCompare(target.id) < 0;
  if (duel && !duelAggressor && tick > 1200) return { x: 0, y: 0, bump: false };
  const actorIsBehind = duelAggressor || (!duel && rimDistance < targetRadius - 26);
  const flank = actor.id < target.id ? 18 : -18;
  const aimPoint = duel && !duelAggressor
    ? { x: -actor.x - actor.y * 0.65, y: -actor.y + actor.x * 0.65 }
    : actorIsBehind
    ? target
    : { x: target.x - outward.x * 62 - outward.y * flank, y: target.y - outward.y * 62 + outward.x * flank };
  const aim = normalize(aimPoint.x - actor.x, aimPoint.y - actor.y);
  const alignment = aim.x * actor.facingX + aim.y * actor.facingY;
  const pulse = Math.floor(tick / 24) % 3 !== 2;
  return { ...aim, bump: actor.bumpCooldown <= 0 && distance < 88 && alignment > 0.45 && actorIsBehind && pulse };
}
