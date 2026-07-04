// Witch Doctor stance queries — the shared read seam for the "Dancing Man" passive.
// A unit's live stance is `unit.stance` (a key into its `stances` data, or null); each
// dance ART sets it in the reducer. These helpers are pure reads consumed by the stat
// fold (getEffectiveStats), rules/combat.js (crit bonus, magic immunity), rules/
// statuses.js (status-chance multiplier), and the reducer's heal / rollover / on-attack
// paths — so no rule hard-codes the Witch Doctor. Mutation (the global tick, the on-
// attack triggers) lives in the reducer; this module only answers questions.
//
// Kept free of a rules/movement.js import (movement imports unitCatalog, which the
// stance data hangs off of) — the one geometry need, Chebyshev, is inlined.
import { getUnitType } from "../core/unitCatalog.js";

function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// The stance-effect data for a unit's CURRENT stance, or null for no stance / a unit
// type with no stances.
export function getStanceEffect(unit) {
  if (!unit?.stance) return null;
  return getUnitType(unit.type).stances?.[unit.stance] ?? null;
}

// True when the unit's current stance makes it immune to `damageType` (Black Death
// Stance → magic). Consulted wherever magic damage is finalized.
export function isDamageTypeImmuneByStance(unit, damageType) {
  const stance = getStanceEffect(unit);
  return Boolean(stance?.magicImmune && damageType === "magic");
}

// The flat bonus added to every HP heal on the board right now (Rain Stance: +1 while
// a living Witch Doctor holds it). Taken as the max across sources — two Rain-Stance
// Witch Doctors don't stack the bonus.
export function getGlobalHealBonus(state) {
  let bonus = 0;
  for (const unit of state?.units ?? []) {
    if (unit.hp <= 0) continue;
    const stance = getStanceEffect(unit);
    if (Number.isFinite(stance?.globalHealBonus)) bonus = Math.max(bonus, stance.globalHealBonus);
  }
  return bonus;
}

// The multiplier on a status effect's success chance for a roll made by `caster`.
// Misfortune Stance doubles the caster's TEAM's status rolls (a living ally in that
// stance). 1 when nothing applies. Chance is later clamped to [0,1] by the caller.
export function getTeamStatusChanceMultiplier(state, caster) {
  let mult = 1;
  for (const unit of state?.units ?? []) {
    if (unit.hp <= 0 || unit.player !== caster.player) continue;
    const stance = getStanceEffect(unit);
    if (Number.isFinite(stance?.teamStatusChanceMultiplier)) mult = Math.max(mult, stance.teamStatusChanceMultiplier);
  }
  return mult;
}

// The attacker's crit-damage bonus from its current stance (Fire Stance: +1). Added to
// a landed crit only, so the normal-hit forecast is unaffected.
export function getStanceCritBonus(attacker) {
  const stance = getStanceEffect(attacker);
  return Number.isFinite(stance?.critBonus) ? stance.critBonus : 0;
}

// The per-rollover global true damage in effect right now (Black Death Stance: 1 to
// every unit). Max across living sources. 0 when nothing applies.
export function getGlobalTrueTick(state) {
  let amount = 0;
  for (const unit of state?.units ?? []) {
    if (unit.hp <= 0) continue;
    const stance = getStanceEffect(unit);
    if (Number.isFinite(stance?.globalTrueTick)) amount = Math.max(amount, stance.globalTrueTick);
  }
  return amount;
}

// The living allies of `actor` (within an optional Chebyshev radius) that a Spirit-
// Stance on-attack MP restore would reach. Excludes the Witch Doctor himself — the
// stance rewards the team for his aggression.
export function alliesInRadius(state, actor, radius) {
  return (state?.units ?? []).filter((unit) =>
    unit.hp > 0 &&
    unit.id !== actor.id &&
    unit.player === actor.player &&
    (radius == null || chebyshev(actor.position, unit.position) <= radius));
}
