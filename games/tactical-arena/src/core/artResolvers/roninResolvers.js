import { getArtMpCost } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit } from "../state.js";
import { getArtTargetRange } from "../../rules/arts.js";
import { addDuelMark, duelistTracksMisses, ignoresCriticalDamage, isWallBetween, rollToHit, shouldApplyAttackRecoil } from "../../rules/combat.js";
import { CRIT_MULTIPLIER } from "../../rules/damage.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

function validateTargetedEnemyCast(state, actor, target, art) {
  if (!target || target.hp <= 0 || !areEnemies(actor, target)) return ERR.INVALID_TARGET;
  if (chebyshevDistance(actor.position, target.position) > getArtTargetRange(state, actor, art)) {
    return ERR.TARGET_OUT_OF_RANGE;
  }
  if (isWallBetween(state, actor.position, target.position, actor)) return ERR.TARGET_OBSTRUCTED;
  return null;
}

export function resolveSelfBuff(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const buff = art.selfBuff ?? {};
  if (buff.defend) actor.defending = true;
  let buffApplied = false;
  if (buff.status) {
    const result = applyStatus(actor, {
      type: buff.status.type,
      duration: buff.status.duration,
      statModifiers: { ...(buff.status.statModifiers ?? {}) },
      ignoreResistance: true
    });
    if (result.applied) { actor.statuses = result.statuses; buffApplied = true; }
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpCost: cost,
    defended: Boolean(buff.defend), buffApplied
  }]);
}

// Ronin's Challenge: a mutual grudge on an enemy within range. No damage — it marks BOTH
// Ronin and the target with the same `challenged` status naming the OTHER as `from`, so
// getChallengeDamageBonus (rules/combat.js) grants +bonus in each direction of the duel.
// `duration: 2` carries the marks through the coming turn. The call ignores status
// resistance/immunity (it's a taunt, not a debuff).
export function resolveChallenge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  const invalid = validateTargetedEnemyCast(state, actorState, targetState, art);
  if (invalid) return reject(invalid);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const bonus = Math.max(0, Number(art.challenge?.bonus) || 0);
  const duration = art.challenge?.durationTurns ?? 2;
  const markTarget = applyStatus(target, { type: "challenged", duration, from: actor.id, bonus, ignoreResistance: true });
  if (markTarget.applied) target.statuses = markTarget.statuses;
  const markSelf = applyStatus(actor, { type: "challenged", duration, from: target.id, bonus, ignoreResistance: true });
  if (markSelf.applied) actor.statuses = markSelf.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
    effect: { attempted: true, applied: true, status: "challenged" }
  }]);
}

// Ronin's Shuriken: a range-3 throw that rolls to-hit for a FIXED amount of TRUE damage
// (bypasses DEF and Defend). A crit still multiplies. A body doesn't block a thrown blade,
// but a wall does. Records a duel mark on a whiff against a Ronin target, and recoils under
// Final Draw like his other attacks while enemies remain.
export function resolveShuriken(state, command, art) {
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
    if (duelistTracksMisses(target)) addDuelMark(target, actor.id);
    spendAndAdvance(next, actor);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const base = Math.max(0, Number(art.damage?.amount) || 0);
  const amount = swing.critical && !ignoresCriticalDamage(target) ? Math.ceil(base * CRIT_MULTIPLIER) : base;
  const damageDealt = Math.min(target.hp, amount);
  target.hp = Math.max(0, target.hp - amount);

  const recoilEvents = [];
  if (shouldApplyAttackRecoil(actor, next) && damageDealt > 0) {
    const recoil = Math.min(actor.hp, damageDealt);
    actor.hp = Math.max(0, actor.hp - damageDealt);
    recoilEvents.push({ type: "ATTACK_RECOIL", unitId: actor.id, damage: recoil });
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    hit: true, critical: swing.critical, roll: swing.hitRoll, damage: amount,
    targetIds: [target.id], damageByTarget: { [target.id]: damageDealt }, mpCost: cost
  }, ...recoilEvents]);
}
