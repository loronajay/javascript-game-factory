// Short-lived visual state for collisions with Trick Shot Lab pads.
//
// The physics reports the exact contact point and face axes; this field only
// gives that contact a readable lifetime. Nothing here can alter the ball.

import { SPRING_PIECE } from "../sim/trick-shot.js";

const BOARD_IMPACT_LIFE = 0.32;
const SPRING_IMPACT_LIFE = 0.46;
const MAX_BURSTS = 10;

export function createTrickShotImpactField() {
  return { bursts: [] };
}

export function clearTrickShotImpacts(field) {
  field.bursts.length = 0;
}

export function addTrickShotImpact(field, impact) {
  if (!impact) return null;
  const burst = {
    ...impact,
    age: 0,
    life: impact.kind === SPRING_PIECE ? SPRING_IMPACT_LIFE : BOARD_IMPACT_LIFE,
    strength: Math.max(0.28, Math.min(1, impact.speed / 5)),
  };
  field.bursts.push(burst);
  while (field.bursts.length > MAX_BURSTS) field.bursts.shift();
  return burst;
}

export function tickTrickShotImpacts(field, dt) {
  for (const burst of field.bursts) burst.age += dt;
  field.bursts = field.bursts.filter((burst) => burst.age < burst.life);
}

export function trickShotImpactProgress(burst) {
  return Math.max(0, Math.min(1, burst.age / burst.life));
}
