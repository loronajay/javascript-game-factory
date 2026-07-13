import { areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "../state.js";
import { resistsDisplacement } from "../../rules/combat.js";
import { chebyshevDistance, isOnBoard, ORTHOGONAL_DIRECTIONS } from "../../rules/movement.js";
import { drawValue } from "../rng.js";
import { accept } from "../reducerResult.js";
import { spendAndAdvance } from "../turnEngine.js";

// Tear the nearby board sideways. Each enemy gets its own deterministic RNG draw among
// currently legal orthogonal destinations. Resolving against the updated board after each
// shift ensures two victims never land on the same tile.
export function resolveVoidGravity(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = Math.max(0, Number(art.targeting?.radius) || 3);
  const targets = livingUnits(next).filter((unit) =>
    areEnemies(actor, unit) && chebyshevDistance(actor.position, unit.position) <= radius);
  const pushed = {};
  const blocked = [];

  for (const target of targets) {
    if (resistsDisplacement(target)) {
      blocked.push(target.id);
      continue;
    }
    const destinations = ORTHOGONAL_DIRECTIONS
      .map((direction) => ({
        x: target.position.x + direction.x,
        y: target.position.y + direction.y,
      }))
      .filter((position) =>
        isOnBoard(next, position) && !isWallAt(next, position) && !unitAt(next, position));
    if (!destinations.length) {
      blocked.push(target.id);
      continue;
    }
    const draw = drawValue(next.rngState);
    next.rngState = draw.rngState;
    const destination = destinations[Math.min(destinations.length - 1, Math.floor(draw.value * destinations.length))];
    const from = { ...target.position };
    target.position = { ...destination };
    pushed[target.id] = { from, to: { ...destination } };
  }

  const hpCost = Math.max(0, Number(art.hpCost) || 0);
  actor.hp = Math.max(0, actor.hp - hpCost);
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds: targets.map((target) => target.id),
    pushed,
    blocked,
    mpCost: 0,
    hpCost,
  }]);
}
