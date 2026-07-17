import { getAbilityUsesRemaining, getEffectiveStats, getRageEffectValue } from "../unitCatalog.js";
import { areAllies, areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "../state.js";
import { getArtTargetRange, getSelfBlastRadius, getTargetedBlastAimTiles, getTargetedBlastTargets } from "../../rules/arts.js";
import {
  addDuelMark,
  duelistTracksMisses,
  getDisplacementRetaliation,
  isWallBetween,
  resistsDisplacement,
  resolveFixedPhysicalStrike,
  rollToHit,
} from "../../rules/combat.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../../rules/movement.js";
import { applyStatus, isTargetable } from "../../rules/statuses.js";
import { getGlobalStatusChanceMultiplier } from "../../rules/stances.js";
import { applyRockHardDefense, applyRolledStatus, resolvePhysicalDamageHealing } from "../combatEffects.js";
import { consumeOneShotRage } from "../reactions.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { spendAbilityUse } from "./abilityUses.js";

// --- Riot Cop ----------------------------------------------------------------

// Stun Gun (Riot Cop): a range-3 dart that rolls to-hit for a fixed 3 TRUE damage, then
// rolls for a status — STUN if the target is adjacent (or Riot Cop is raging, stunAtAnyRange),
// otherwise SLOW. A wall blocks the shot; a body does not (true damage, like other casts).
export function resolveStunGun(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!isTargetable(targetState) || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  spendAbilityUse(actor, art);

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    if (duelistTracksMisses(target)) addDuelMark(target, actor.id);
    const desperationEvents = consumeOneShotRage(actor);
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, usesLeft: getAbilityUsesRemaining(actor, art)
    }, ...desperationEvents]);
  }

  const amount = Math.max(0, Number(art.damage?.amount) || 0);
  const damageDealt = Math.min(target.hp, amount);
  target.hp = Math.max(0, target.hp - amount);

  let appliedStatus = null;
  let effect = null;
  if (target.hp > 0) {
    const adjacent = chebyshevDistance(actor.position, target.position) <= 1;
    const anyRange = getRageEffectValue(actor, "stunAtAnyRange", false);
    const statusType = (adjacent || anyRange) ? "stun" : "slow";
    const spec = statusType === "stun"
      ? { status: "stun", chance: art.effect.chance, durationTurns: art.effect.durationTurns }
      : { status: "slow", chance: art.effect.chance, durationTurns: art.effect.durationTurns, statModifiers: { moveRange: -1 } };
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    effect = applyRolledStatus(target, spec, roll.value, actor, getGlobalStatusChanceMultiplier(next));
    effect = { ...effect, status: statusType, roll: roll.value };
    if (effect.applied && !effect.reflected) appliedStatus = statusType;
  }

  const desperationEvents = consumeOneShotRage(actor);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    hit: true, critical: swing.critical, roll: swing.hitRoll,
    damage: { type: "true", damage: damageDealt }, targetIds: [target.id], damageByTarget: { [target.id]: damageDealt },
    ...(appliedStatus ? { appliedStatus } : {}),
    ...(effect ? { effect } : {}),
    usesLeft: getAbilityUsesRemaining(actor, art)
  }, ...desperationEvents]);
}

// Smoke Bomb (Riot Cop): thrown at a clear tile within range 4 (targeted like Thunderous
// Charge). Rolls for success; on a landed throw, blind every enemy within the blast radius
// (no roll, immunity respected). Deals no damage.
export function resolveSmokeBomb(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const center = command.targetPosition;
  if (!center || !getTargetedBlastAimTiles(state, actorState, art).has(positionKey(center))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  spendAbilityUse(actor, art);

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll }, { targetPosition: center, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  const radius = art.targeting?.radius ?? 1;
  const statusTargets = [];
  if (!swing.missed) {
    for (const target of getTargetedBlastTargets(next, actor, center, radius)) {
      const applied = applyStatus(target, { type: art.effect.status, duration: art.effect.durationTurns });
      if (applied.applied) { target.statuses = applied.statuses; statusTargets.push(target.id); }
    }
  }
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, center: { ...center },
    hit: !swing.missed, missed: swing.missed, roll: swing.hitRoll, statusTargets, mpCost: 0, usesLeft: getAbilityUsesRemaining(actor, art)
  }]);
}

// Shield Bash (Riot Cop): an adjacent shove that rolls to-hit for a fixed 8 physical (DEF +
// Defend apply, Rock Hard negates), then pushes the target straight back one tile. If the
// push is blocked (edge / wall / occupant / displacement-immune), deal +1 TRUE instead.
export function resolveShieldBash(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!isTargetable(targetState) || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    if (duelistTracksMisses(target)) addDuelMark(target, actor.id);
    const desperationEvents = consumeOneShotRage(actor);
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll
    }, ...desperationEvents]);
  }

  const strike = resolveFixedPhysicalStrike(actor, target, art.damage.amount, { critical: swing.critical, state: next });
  let dealt = Math.min(target.hp, strike.damage);
  target.hp = Math.max(0, target.hp - strike.damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  let pushed = null;
  let blocked = false;
  const retaliationEvents = [];
  if (target.hp > 0) {
    if (resistsDisplacement(target)) {
      blocked = true;
      const thorns = getDisplacementRetaliation(target);
      if (thorns > 0) {
        const bit = Math.min(actor.hp, thorns);
        actor.hp = Math.max(0, actor.hp - thorns);
        if (bit > 0) retaliationEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: target.id, damage: bit });
      }
    } else {
      const dx = Math.sign(target.position.x - actor.position.x);
      const dy = Math.sign(target.position.y - actor.position.y);
      const dest = { x: target.position.x + dx, y: target.position.y + dy };
      if (!isOnBoard(next, dest) || isWallAt(next, dest) || unitAt(next, dest)) {
        blocked = true;
      } else {
        const from = { ...target.position };
        target.position = { ...dest };
        pushed = { [target.id]: { from, to: { ...dest } } };
      }
    }
    if (blocked) {
      const extra = Math.max(0, Number(art.blockedDamage) || 0);
      const extraDealt = Math.min(target.hp, extra);
      target.hp = Math.max(0, target.hp - extra);
      dealt += extraDealt;
    }
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, dealt);
  const desperationEvents = consumeOneShotRage(actor);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    hit: true, critical: swing.critical, roll: swing.hitRoll,
    damage: { type: "physical", damage: strike.damage }, targetIds: [target.id], damageByTarget: { [target.id]: dealt },
    ...(pushed ? { pushed } : {}),
    ...(blocked ? { pushBlocked: true } : {})
  }, ...rockHardEvents, ...retaliationEvents, ...healingEvents, ...desperationEvents]);
}

// Cover (Riot Cop): swap places with an adjacent ally and Defend. If the covered ally is
// below half HP, Riot Cop also gains +1 STR on his next turn (a timed empowered buff).
export function resolveCover(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || targetState.id === actorState.id || !areAllies(actorState, targetState)) {
    return reject(ERR.INVALID_TARGET);
  }
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const actorPos = { ...actor.position };
  actor.position = { ...target.position };
  target.position = actorPos;
  actor.defending = true;

  let empowered = false;
  const buff = art.coverBuff ?? { statModifiers: { strength: 1 }, duration: 2 };
  if (target.hp < getEffectiveStats(target, next).maxHp * 0.5) {
    const applied = applyStatus(actor, { type: "empowered", duration: buff.duration, statModifiers: buff.statModifiers });
    if (applied.applied) { actor.statuses = applied.statuses; empowered = true; }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    swap: { [actor.id]: { ...actor.position }, [target.id]: { ...target.position } },
    empowered, mpCost: 0
  }]);
}

// Lockdown (Riot Cop, RAGE): a self-centred crackdown. Every unit within radius 3 (allies
// INCLUDED, Riot Cop excluded) is clamped to 1 MOVE and loses 2 DEF for one turn. Must be
// the turn's first command (gated by firstCommandOnly in canUseArt).
export function resolveLockdown(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const affected = [];
  for (const unit of livingUnits(next)) {
    if (unit.id === actor.id) continue;
    if (chebyshevDistance(actor.position, unit.position) > radius) continue;
    // A hard slow: a large negative MOVE the getEffectiveStats floor pins to 1, plus -2 DEF.
    const applied = applyStatus(unit, {
      type: "slow",
      duration: art.effect?.durationTurns ?? 1,
      statModifiers: { moveRange: -20, defense: -2 }
    });
    if (applied.applied) { unit.statuses = applied.statuses; affected.push(unit.id); }
  }
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, statusTargets: affected, mpCost: 0
  }]);
}
