import { getArtMpCost, getEffectiveStats } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit } from "../state.js";
import { getArtTargetRange, getRevivePlacementTiles, getReviveTargets } from "../../rules/arts.js";
import { isWallBetween } from "../../rules/combat.js";
import { chebyshevDistance, positionKey } from "../../rules/movement.js";
import { applyStatus, isTargetable, reflectsStatus } from "../../rules/statuses.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveAge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (areEnemies(actorState, targetState) && !isTargetable(targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks the cast like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const stat = command.stat === "defense" ? "defense" : "strength";
  const amount = Math.max(1, Number(art.effect?.amount) || 1);
  const delta = areEnemies(actorState, targetState) ? -amount : amount;

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  target.linkedStatMods = [...(target.linkedStatMods ?? []), { sourceId: actor.id, stats: { [stat]: delta } }];
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost, stat, delta
  }]);
}

// Time Stretch: an ally-OR-enemy timed status. Ally → an `empowered` +MOVE buff; enemy
// → a `slow` -MOVE debuff. No damage and no roll — it always attempts (immunity is
// still respected centrally, so a Slow-immune enemy simply resists).
export function resolveTimeStretch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (areEnemies(actorState, targetState) && !isTargetable(targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const enemy = areEnemies(actorState, targetState);
  // Slowing an enemy is a ranged ability, so a wall blocks it; a friendly haste is not
  // shot-gated.
  if (enemy && isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const spec = enemy ? art.enemy : art.ally;
  // Stone Body reflects a slow (the enemy branch) back onto Father Time; a friendly
  // haste is never reflected.
  const recipient = (enemy && reflectsStatus(target)) ? actor : target;
  const result = applyStatus(recipient, {
    type: spec.status,
    duration: spec.durationTurns,
    ...(spec.statModifiers ? { statModifiers: { ...spec.statModifiers } } : {})
  });
  if (result.applied) recipient.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
    effect: { status: spec.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

function reviveHpForArt(revived, state, art) {
  const maxHp = getEffectiveStats(revived, state).maxHp;
  const fraction = Number.isFinite(art.revive?.hpFraction) ? art.revive.hpFraction : 1;
  return Math.max(1, Math.min(maxHp, Math.ceil(maxHp * fraction)));
}

// Rewind-style revive (RAGE): return a fallen ally to the board on a chosen tile within
// range, healed by the art's revive fraction with statuses cleared. Its MP is NOT
// restored. The revived unit is placed already `spent` so the revival doesn't hand its
// owner a bonus activation this round.
export function resolveRewind(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const target = getReviveTargets(state, actorState).find((unit) => unit.id === command.targetId);
  if (!target) return reject(ERR.INVALID_TARGET);
  const placement = command.targetPosition;
  if (!placement || !getRevivePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const revived = findUnit(next, command.targetId);
  revived.position = { ...placement };
  revived.statuses = [];
  revived.defending = false;
  revived.hp = reviveHpForArt(revived, next, art);
  revived.spent = true;
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, revivedUnitId: revived.id, position: { ...placement }, mpCost: cost
  }]);
}

// Tether Grab: grab the first ally OR enemy on a straight ray within range and haul them
// to the tile one step from the Juggernaut along that ray. An enemy also takes 3 magic
// damage; an ally is only repositioned. The tiles between are empty (it was the first
// contact), so the pull destination is always clear.
