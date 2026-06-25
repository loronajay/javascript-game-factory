import { getUnitType } from "../core/unitCatalog.js";

export function statusImmunities(unit) {
  const definition = getUnitType(unit.type);
  const sources = [definition.passive, ...definition.arts, definition.rageArt];
  return new Set(sources.flatMap((source) =>
    source?.effect?.type === "immunity" ? source.effect.statuses : []
  ));
}

export function applyStatus(unit, status, { immuneTypes = [] } = {}) {
  if (statusImmunities(unit).has(status.type) || immuneTypes.includes(unit.type)) {
    return { applied: false, reason: "IMMUNE", statuses: [...unit.statuses] };
  }
  const existing = unit.statuses.filter((entry) => entry.type !== status.type);
  return { applied: true, statuses: [...existing, { ...status }] };
}

export function resolveStatusEffect(unit, effect, effectRoll, options) {
  if (!Number.isFinite(effectRoll) || effectRoll < 0 || effectRoll >= 1) {
    return { attempted: false, applied: false, reason: "INVALID_ROLL" };
  }
  if (effectRoll >= effect.chance) return { attempted: true, applied: false, reason: "ROLL_FAILED" };

  const status = {
    type: effect.status,
    duration: effect.duration ?? effect.durationTurns,
    ...(effect.statModifiers ? { statModifiers: { ...effect.statModifiers } } : {}),
    ...(Number.isFinite(effect.turnStartDamage) ? { turnStartDamage: effect.turnStartDamage } : {})
  };
  const result = applyStatus(unit, status, options);
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
