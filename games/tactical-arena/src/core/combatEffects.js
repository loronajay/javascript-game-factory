import { getCommandHealBonus, getEffectiveStats, getUnitType, isDefending } from "./unitCatalog.js";
import { livingTeamUnits } from "./state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { getRockHardMpRefund, isHealingDisabled } from "../rules/combat.js";
import { getGlobalHealBonus } from "../rules/stances.js";
import { applyStatus, reflectsStatus, resolveStatusEffect } from "../rules/statuses.js";

// Apply a rolled status, honoring Stone Body reflection: a status targeted at a
// reflecting unit is issued to the offender instead of the target.
export function applyRolledStatus(target, effect, rollValue, offender, chanceMultiplier = 1) {
  const recipient = (offender && offender.id !== target.id && reflectsStatus(target)) ? offender : target;
  const result = resolveStatusEffect(recipient, effect, rollValue, chanceMultiplier);
  if (result.statuses) { recipient.statuses = result.statuses; }
  delete result.statuses;
  if (recipient.id !== target.id) result.reflected = true;
  return result;
}

// Growth (Virus): restore MP to the actor whenever it poisons an enemy.
export function applyGrowth(state, actor, amount) {
  if (!(amount > 0)) return [];
  const restored = restoreMp(state, actor, actor, amount);
  return restored.mpRestored > 0 || restored.hpRestored > 0
    ? [{ type: "GROWTH_MP", unitId: actor.id, mpGained: restored.mpRestored, hpRestored: restored.hpRestored }]
    : [];
}

// Rock Hard (Clod): a physical attack landing on a defending Clod is negated by the
// strike resolvers and also feeds him MP.
export function applyRockHardDefense(state, target, isPhysical) {
  if (!isPhysical || target.hp <= 0 || !isDefending(target)) return [];
  const refund = getRockHardMpRefund(target);
  if (refund <= 0) return [];
  const restored = restoreMp(state, target, target, refund);
  return restored.mpRestored > 0 || restored.hpRestored > 0
    ? [{ type: "ROCK_HARD_MP", unitId: target.id, mpGained: restored.mpRestored, hpRestored: restored.hpRestored }]
    : [];
}

export function applyMagicDamageReaction(target, damageDealt) {
  if (damageDealt <= 0 || target.hp <= 0) return null;
  const definition = getUnitType(target.type);
  for (const source of [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt]) {
    const effect = source?.effect;
    if (effect?.type === "magicTrauma") {
      const status = effect.status ?? { type: "battle-trauma", duration: 1, statModifiers: { strength: 1 } };
      const result = applyStatus(target, {
        type: status.type,
        duration: status.duration,
        statModifiers: { ...(status.statModifiers ?? {}) },
        ignoreResistance: true
      });
      if (result.applied) target.statuses = result.statuses;
      return { type: "BATTLE_TRAUMA", unitId: target.id, applied: result.applied };
    }
    if (effect?.type === "magicDamageMpRestore") {
      const before = target.mp;
      target.mp = Math.min(getEffectiveStats(target).maxMp, target.mp + Math.max(0, Number(effect.amount) || 0));
      const gained = target.mp - before;
      return gained > 0 ? { type: "BATTERY_MP", unitId: target.id, mpGained: gained } : null;
    }
  }
  return null;
}

export function resolvePhysicalDamageHealing(state, actor, damageDealt) {
  const effect = getUnitType(actor.type).passive?.effect;
  if (effect?.type !== "physicalDamageHealAura" || damageDealt <= 0) return [];
  const base = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (base <= 0) return [];
  const amount = base + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);

  const healingByTarget = {};
  const restoredByTarget = {};
  for (const target of livingTeamUnits(state, actor)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > effect.radius) continue;
    const restored = restoreHp(state, actor, target, amount);
    if (restored.hpRestored > 0) healingByTarget[target.id] = restored.hpRestored;
    if (restored.mpRestored > 0) restoredByTarget[target.id] = restored.mpRestored;
  }

  return Object.keys(healingByTarget).length || Object.keys(restoredByTarget).length
    ? [{
      type: "HAND_OF_LIFE",
      actorId: actor.id,
      healingByTarget,
      ...(Object.keys(restoredByTarget).length ? { restoredByTarget } : {})
    }]
    : [];
}

export function isRestorePolarityShifted(state) {
  return Boolean(state?.restorePolarityShift);
}

export function restoreHp(state, actor, target, amount, { bypassPolarity = false, bypassHealingLockout = false } = {}) {
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0 || !target) return { hpRestored: 0, mpRestored: 0 };
  if (isRestorePolarityShifted(state) && !bypassPolarity) {
    return restoreMp(state, actor, target, value, { bypassPolarity: true });
  }
  if (!bypassHealingLockout && isHealingDisabled(state, target)) return { hpRestored: 0, mpRestored: 0 };
  const before = target.hp;
  target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + value);
  return { hpRestored: target.hp - before, mpRestored: 0 };
}

export function restoreMp(state, actor, target, amount, { bypassPolarity = false } = {}) {
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0 || !target) return { hpRestored: 0, mpRestored: 0 };
  if (isRestorePolarityShifted(state) && !bypassPolarity) {
    return restoreHp(state, actor, target, value, { bypassPolarity: true });
  }
  const before = target.mp;
  target.mp = Math.min(getEffectiveStats(target, state).maxMp, target.mp + value);
  return { hpRestored: 0, mpRestored: target.mp - before };
}
