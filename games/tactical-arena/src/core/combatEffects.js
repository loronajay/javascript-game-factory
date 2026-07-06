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
  const before = actor.mp;
  actor.mp = Math.min(getEffectiveStats(actor, state).maxMp, actor.mp + amount);
  const gained = actor.mp - before;
  return gained > 0 ? [{ type: "GROWTH_MP", unitId: actor.id, mpGained: gained }] : [];
}

// Rock Hard (Clod): a physical attack landing on a defending Clod is negated by the
// strike resolvers and also feeds him MP.
export function applyRockHardDefense(state, target, isPhysical) {
  if (!isPhysical || target.hp <= 0 || !isDefending(target)) return [];
  const refund = getRockHardMpRefund(target);
  if (refund <= 0) return [];
  const before = target.mp;
  target.mp = Math.min(getEffectiveStats(target, state).maxMp, target.mp + refund);
  const gained = target.mp - before;
  return gained > 0 ? [{ type: "ROCK_HARD_MP", unitId: target.id, mpGained: gained }] : [];
}

export function applyMagicDamageReaction(target, damageDealt) {
  if (damageDealt <= 0 || target.hp <= 0) return null;
  const effect = getUnitType(target.type).passive?.effect;
  if (effect?.type !== "magicTrauma") return null;
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

export function resolvePhysicalDamageHealing(state, actor, damageDealt) {
  const effect = getUnitType(actor.type).passive?.effect;
  if (effect?.type !== "physicalDamageHealAura" || damageDealt <= 0) return [];
  if (isHealingDisabled(state)) return [];
  const base = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (base <= 0) return [];
  const amount = base + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);

  const healingByTarget = {};
  for (const target of livingTeamUnits(state, actor)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > effect.radius) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (healed > 0) healingByTarget[target.id] = healed;
  }

  return Object.keys(healingByTarget).length
    ? [{ type: "HAND_OF_LIFE", actorId: actor.id, healingByTarget }]
    : [];
}
