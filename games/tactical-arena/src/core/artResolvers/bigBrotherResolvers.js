import { getArtMpCost } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits } from "../state.js";
import { getArtTargetRange } from "../../rules/arts.js";
import { isWallBetween, resolveBaseStrike, rollToHit } from "../../rules/combat.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../../rules/movement.js";
import { getGlobalStatusChanceMultiplier } from "../../rules/stances.js";
import { applyRolledStatus } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { pushDestinationAwayFrom } from "./displacement.js";

export function resolveForceTug(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, damage: 0, mpCost: cost
    }]);
  }

  const damage = resolveBaseStrike(actor, target, { critical: swing.critical, state: next, damageType: art.damageType ?? "true" });
  const dealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);

  let effect = null;
  if (target.hp > 0) {
    const spec = swing.critical ? art.critEffect : art.effect;
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    effect = applyRolledStatus(target, spec, roll.value, actor, getGlobalStatusChanceMultiplier(next));
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    targetIds: [target.id],
    damageByTarget: { [target.id]: dealt },
    damage,
    hit: true,
    critical: swing.critical,
    roll: swing.hitRoll,
    ...(effect ? { effect } : {}),
    mpCost: cost
  }]);
}

export function resolveForcePush(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = art.targeting?.radius ?? 1;
  const amount = art.damage?.amount ?? 2;
  const originalOccupied = new Set(livingUnits(next).map((unit) => positionKey(unit.position)));
  const pushed = {};
  const blocked = [];
  const damageByTarget = {};

  for (const target of livingUnits(next)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const destination = pushDestinationAwayFrom(actor, target);
    if (!isOnBoard(next, destination) || isWallAt(next, destination) || originalOccupied.has(positionKey(destination))) {
      const dealt = Math.min(target.hp, amount);
      target.hp = Math.max(0, target.hp - amount);
      blocked.push(target.id);
      damageByTarget[target.id] = dealt;
      continue;
    }
    const from = { ...target.position };
    target.position = destination;
    pushed[target.id] = { from, to: { ...destination } };
  }

  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    pushed,
    blocked,
    damageByTarget,
    mpCost: cost
  }]);
}

export function resolvePolarityShift(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.restorePolarityShift = !Boolean(next.restorePolarityShift);
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    restorePolarityShift: next.restorePolarityShift,
    mpCost: cost
  }]);
}
