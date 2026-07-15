import { getArtMpCost } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits, unitAt } from "../state.js";
import { getArtTargetRange, getConeCells, getConeOriginForTarget, getFirePlacementTiles, getVolleyShotOriginForTarget } from "../../rules/arts.js";
import { getProximityBonus, isFireBasedDamage, isFireDamageImmune, isShotBlocked, isWallBetween, resolveFixedPhysicalStrike, rollToHit } from "../../rules/combat.js";
import { chebyshevDistance, positionKey } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { applyRockHardDefense, resolvePhysicalDamageHealing } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveThrowCigar(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFirePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "fire", turnsLeft: art.fire?.turns ?? 3 };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: cost
  }]);
}

function applyTrueSplashDamage(state, actor, center, { amount = 0, radius = 1 } = {}, excludeId = null) {
  const damageByTarget = {};
  const targetIds = [];
  const damage = Math.max(0, Number(amount) || 0);
  if (damage <= 0) return { targetIds, damageByTarget };
  for (const target of livingUnits(state)) {
    if (target.id === excludeId || !areEnemies(actor, target)) continue;
    if (chebyshevDistance(center, target.position) > radius) continue;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    if (dealt > 0) {
      targetIds.push(target.id);
      damageByTarget[target.id] = dealt;
    }
  }
  return { targetIds, damageByTarget };
}

export function resolveCannonFire(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState) ||
      isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const damage = resolveFixedPhysicalStrike(actor, target, art.damage?.amount ?? 10, { critical: swing.critical, state: next });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);

  let stunned = false;
  if (swing.critical && target.hp > 0 && art.onCrit?.status) {
    const result = applyStatus(target, { type: art.onCrit.status, duration: art.onCrit.durationTurns ?? 1 });
    if (result.applied) {
      target.statuses = result.statuses;
      stunned = true;
    }
  }

  const splash = swing.critical
    ? applyTrueSplashDamage(next, actor, target.position, art.onCrit?.splash, target.id)
    : { targetIds: [], damageByTarget: {} };
  const rockHardEvents = applyRockHardDefense(next, target, true);
  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    hit: true,
    critical: swing.critical,
    stunned,
    roll: swing.hitRoll,
    damage,
    targetIds: [target.id, ...splash.targetIds],
    damageByTarget: { [target.id]: damageDealt, ...splash.damageByTarget },
    mpCost: cost
  }, ...healingEvents, ...rockHardEvents]);
}

export function resolveConeArt(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const origin = getConeOriginForTarget(state, actorState, command.targetPosition, art);
  if (!origin) return reject(ERR.INVALID_TARGET);
  const cells = getConeCells(state, actorState, origin, art);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targetIds = [];
  const damageByTarget = {};
  const fireBased = isFireBasedDamage({ art });
  for (const position of cells) {
    const target = unitAt(next, position);
    if (!target || !areEnemies(actor, target)) continue;
    if (fireBased && isFireDamageImmune(target)) continue;
    const damage = art.damage.amount + (art.id === "volley-shot" ? getProximityBonus(actor, target) : 0);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetPosition: { ...origin },
    targetIds,
    damageByTarget,
    mpCost: cost
  }]);
}

export function resolveVolleyShot(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const origin = getVolleyShotOriginForTarget(state, actorState, command.targetPosition);
  if (!origin) return reject(ERR.INVALID_TARGET);
  return resolveConeArt(state, { ...command, targetPosition: origin }, art);
}
