import { getArtMpCost, getEffectiveStats, isDefending } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits } from "../state.js";
import { getArtTargetRange, getSelfBlastRadius, getTargetedBlastAimTiles, getTargetedBlastTargets } from "../../rules/arts.js";
import { finalizeMagicDamage, ignoresCriticalDamage, isShotBlocked, isWallBetween, negatesPhysicalWhileDefending, rollToHit } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { chebyshevDistance, positionKey } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { applyMagicDamageReaction, applyRockHardDefense, applyRolledStatus, resolvePhysicalDamageHealing } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveQuake(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const enemies = livingUnits(next).filter((u) => areEnemies(actor, u) && chebyshevDistance(actor.position, u.position) <= radius);
  const totalEnemies = livingUnits(next).filter((u) => areEnemies(actor, u)).length;
  const amount = (art.damage?.amount ?? 3) + enemies.length;

  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];
  for (const target of enemies) {
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }

  const refunded = enemies.length > 0 && enemies.length === totalEnemies;
  const cost = getArtMpCost(actor, art, next);
  if (!refunded) actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    mpCost: cost, refunded, quakeAmount: amount
  }, ...reactionEvents]);
}

// Stone Throw (Clod): a STR-scaling physical boulder (fixed power that rises with STR above
// Clod's base, like Front Kick) that rolls to-hit/crit. On a LANDED hit it also applies a
// guaranteed status with NO roll — a crit stuns, otherwise it slows. A defending Rock-Hard
// target negates the damage but still eats the status; Stone Body reflects the status.
export function resolveStoneThrow(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A thrown boulder is a physical ranged strike: a body OR a wall between blocks it.
  if (isShotBlocked(state, actorState.position, targetState.position, actorState) ||
      isWallBetween(state, actorState.position, targetState.position, actorState)) {
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
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const actorStats = getEffectiveStats(actor, next);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 8) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical", critical: swing.critical && !ignoresCriticalDamage(target)
  });
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  let appliedStatus = null;
  if (target.hp > 0) {
    const spec = swing.critical ? art.onCrit : art.onHit;
    const res = applyRolledStatus(target, { ...spec, chance: 1 }, 0, actor);
    if (res.applied && !res.reflected) appliedStatus = spec.status;
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, roll: swing.hitRoll, damage, appliedStatus, mpCost: cost
  }, ...healingEvents, ...rockHardEvents]);
}

// Thunderous Charge (Clod, RAGE): Clod CHARGES to a clear tile within range and quakes a
// Chebyshev radius on landing: 10 physical (DEF + Defend still apply; a defending Rock Hard
// enemy negates it) and a guaranteed 1-turn stun to every enemy caught. He ends the turn
// standing on that tile. The stun is an AoE application (immunity respected, never reflected),
// like Smog.
export function resolveThunderousCharge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const center = command.targetPosition;
  if (!center || !getTargetedBlastAimTiles(state, actorState, art).has(positionKey(center))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  // The blast is centered on where Clod lands; move him there first so the footprint (and
  // his committed position) agree. The tile is a validated clear landing spot.
  actor.position = { ...center };

  const radius = art.targeting?.radius ?? 2;
  const damageByTarget = {};
  const targetIds = [];
  const stunnedIds = [];
  const rockHardEvents = [];
  for (const target of getTargetedBlastTargets(next, actor, center, radius)) {
    const result = resolveDamage({
      attacker: { strength: art.damage.amount },
      defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
      type: "physical"
    });
    const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
    rockHardEvents.push(...applyRockHardDefense(next, target, true));
    if (target.hp > 0) {
      const applied = applyStatus(target, { type: "stun", duration: art.stun?.durationTurns ?? 1 });
      if (applied.applied) { target.statuses = applied.statuses; stunnedIds.push(target.id); }
    }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, from, center: { ...center },
    targetIds, damageByTarget, stunnedIds, mpCost: cost
  }, ...rockHardEvents]);
}
