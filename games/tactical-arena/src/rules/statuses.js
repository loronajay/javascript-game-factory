import { getUnitType } from "../core/unitCatalog.js";

// The negative (debuff) statuses — the ones a cleanse should strip and a Focus Prayer
// misfire can inflict. Positive statuses (empowered, battle-trauma) are deliberately
// excluded so a scoped cleanse never removes a friendly buff. Ordered so a seeded roll
// (Fat Cleric's Focus Prayer) picks deterministically across clients.
export const NEGATIVE_STATUS_TYPES = Object.freeze(["blind", "silence", "poison", "slow", "stun"]);

export function isNegativeStatus(status) {
  return NEGATIVE_STATUS_TYPES.includes(status?.type);
}

export function statusImmunities(unit) {
  const definition = getUnitType(unit.type);
  const sources = [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt];
  return new Set(sources.flatMap((source) =>
    source?.effect?.type === "immunity" ? source.effect.statuses : []
  ));
}

export function damageTypeImmunities(unit) {
  const definition = getUnitType(unit.type);
  const sources = [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt];
  return new Set(sources.flatMap((source) =>
    source?.effect?.type === "immunity" ? source.effect.damageTypes ?? [] : []
  ));
}

function resistsNextStatus(unit) {
  const definition = getUnitType(unit.type);
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt]
    .some((source) => source?.effect?.type === "statusResistOnce") &&
    !unit.statusResistUsed;
}

// True when a unit reflects a TARGETED status back onto the offender instead of taking
// it (the Gargoyle's Stone Body). Read off passive data so no rule hard-codes the unit;
// the reducer's single-target status sites redirect the application when this is set.
export function reflectsStatus(unit) {
  return Boolean(getUnitType(unit.type).passive?.effect?.reflectStatus);
}

export function applyStatus(unit, status) {
  if (status.type === "stun" && !isStunDuration(status.duration)) {
    return { applied: false, reason: "INVALID_DURATION", statuses: [...unit.statuses] };
  }
  if (statusImmunities(unit).has(status.type)) {
    return { applied: false, reason: "IMMUNE", statuses: [...unit.statuses] };
  }
  if (!status.ignoreResistance && resistsNextStatus(unit)) {
    unit.statusResistUsed = true;
    return { applied: false, reason: "RESISTED", statuses: [...unit.statuses] };
  }
  const { ignoreResistance: _ignoreResistance, ...storedStatus } = status;
  const existing = unit.statuses.filter((entry) => entry.type !== status.type);
  return { applied: true, statuses: [...existing, { ...storedStatus }] };
}

function isStunDuration(duration) {
  const value = Number(duration);
  return Number.isFinite(value) && value > 0;
}

export function isStunned(unit) {
  return (unit.statuses ?? []).some((status) => {
    return status.type === "stun" && isStunDuration(status.duration);
  });
}

// `chanceMultiplier` scales the effect's base success chance before the roll (the
// Witch Doctor's Misfortune Stance passes 2 for his team). Clamped to [0,1] so a
// doubled 70% becomes a capped 100%, never an out-of-range chance.
export function resolveStatusEffect(unit, effect, effectRoll, chanceMultiplier = 1) {
  if (!Number.isFinite(effectRoll) || effectRoll < 0 || effectRoll >= 1) {
    return { attempted: false, applied: false, reason: "INVALID_ROLL" };
  }
  const chance = Math.min(1, effect.chance * (Number.isFinite(chanceMultiplier) ? chanceMultiplier : 1));
  if (effectRoll >= chance) return { attempted: true, applied: false, reason: "ROLL_FAILED" };

  const status = {
    type: effect.status,
    duration: effect.duration ?? effect.durationTurns,
    ...(effect.statModifiers ? { statModifiers: { ...effect.statModifiers } } : {}),
    ...(Number.isFinite(effect.turnStartDamage) ? { turnStartDamage: effect.turnStartDamage } : {})
  };
  const result = applyStatus(unit, status);
  return { attempted: true, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}), statuses: result.statuses };
}

export function resolveTurnStartStatuses(unit) {
  const events = [];
  for (const status of unit.statuses) {
    const configuredDamage = status.turnStartDamage ?? (status.type === "poison" ? 1 : 0);
    const damage = Math.max(0, Number(configuredDamage) || 0);
    if (damage === 0 || unit.hp <= 0) continue;
    const appliedDamage = Math.min(unit.hp, damage);
    unit.hp -= appliedDamage;
    events.push({ type: "STATUS_DAMAGE", unitId: unit.id, status: status.type, damage: appliedDamage });
  }
  return events;
}

// Timed statuses consume one of the afflicted unit's completed turns. A
// permanent status (currently poison) can only disappear through a cleanse.
export function tickStatuses(statuses) {
  return statuses.flatMap((status) => {
    if (status.duration === "permanent") return [{ ...status }];
    const duration = Math.max(0, Number(status.duration) - 1);
    return duration > 0 ? [{ ...status, duration }] : [];
  });
}
