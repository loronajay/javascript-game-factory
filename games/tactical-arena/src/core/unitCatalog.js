// Unit definitions live in src/core/units/<name>.js — one file per unit type.
// Add new units by importing and registering them here.
import { SWORDSMAN } from "./units/swordsman.js";
import { ARCHER } from "./units/archer.js";
import { MYSTIC } from "./units/mystic.js";

export const UNIT_TYPES = Object.freeze({
  swordsman: SWORDSMAN,
  archer: ARCHER,
  mystic: MYSTIC
});

export function getUnitType(type) {
  const definition = UNIT_TYPES[type];
  if (!definition) throw new Error(`Unknown unit type: ${type}`);
  return definition;
}

export function getArt(type, artId) {
  return getUnitType(type).arts.find((art) => art.id === artId) ?? null;
}

export function isRaging(unit) {
  return unit.hp > 0 && unit.hp <= 5;
}

function passiveSources(definition) {
  return [definition.passive, ...definition.arts, definition.rageArt].filter(Boolean);
}

function teamAuraStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  for (const source of state.units) {
    if (source.hp <= 0 || source.player !== unit.player) continue;
    const definition = getUnitType(source.type);
    for (const passive of passiveSources(definition)) {
      if (passive.kind !== "passive" || passive.effect?.type !== "teamAura") continue;
      for (const [name, value] of Object.entries(passive.effect.stats ?? {})) {
        if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
      }
    }
  }
  return totals;
}

// Runtime modifiers are deliberately numeric and additive. Status effects,
// map auras, and future ARTS can feed this same seam without teaching every
// ability about one another. Per-unit passives apply after external modifiers.
export function getEffectiveStats(unit, state = null) {
  const stats = { ...getUnitType(unit.type).stats };
  for (const [name, value] of Object.entries(unit.statModifiers ?? {})) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(teamAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }

  if (unit.hp > 0 && unit.hp < 3) stats.strength += 3;
  if (isRaging(unit)) {
    for (const [name, value] of Object.entries(getUnitType(unit.type).rageArt.effect?.stats ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  for (const status of unit.statuses ?? []) {
    for (const [name, value] of Object.entries(status.statModifiers ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  stats.moveRange = Math.max(1, stats.moveRange);
  return stats;
}

export function isDefending(unit) {
  if (unit.defending) return true;
  return Boolean(isRaging(unit) && getUnitType(unit.type).rageArt.effect?.defending);
}

// Presentation/query helper — not permission to activate an ART.
export function getAvailableArts(unit) {
  const definition = getUnitType(unit.type);
  return isRaging(unit)
    ? [...definition.arts, definition.rageArt]
    : [...definition.arts];
}
