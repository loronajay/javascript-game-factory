// Unit definitions live in src/core/units/<name>.js — one file per unit type.
// Add new units by importing and registering them here.
import { SWORDSMAN } from "./units/swordsman.js";
import { ARCHER } from "./units/archer.js";
import { MYSTIC } from "./units/mystic.js";
import { MAGICIAN } from "./units/magician.js";
import { PALADIN } from "./units/paladin.js";
import { NECROMANCER } from "./units/necromancer.js";
import { GHOUL } from "./units/ghoul.js";
import { SNIPER } from "./units/sniper.js";

export const UNIT_TYPES = Object.freeze({
  swordsman: SWORDSMAN,
  archer: ARCHER,
  mystic: MYSTIC,
  magician: MAGICIAN,
  paladin: PALADIN,
  necromancer: NECROMANCER,
  ghoul: GHOUL,
  sniper: SNIPER
});

// Local Chebyshev so this module stays free of a rules/movement.js import
// (movement.js imports getEffectiveStats from here — importing it back would be
// a cycle). Aura folding below needs grid distance.
function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Summoned pieces (Ghouls) are real units but never activate: they are skipped
// by the turn loop, the victory check, the squad picker, and summary counts.
export function takesTurns(unit) {
  return !getUnitType(unit.type).summon;
}

export function getUnitType(type) {
  const definition = UNIT_TYPES[type];
  if (!definition) throw new Error(`Unknown unit type: ${type}`);
  return definition;
}

export function getArt(type, artId) {
  const definition = getUnitType(type);
  return definition.arts.find((art) => art.id === artId) ??
    (definition.rageArt?.id === artId ? definition.rageArt : null);
}

export function isRaging(unit) {
  return unit.hp > 0 && unit.hp <= 5;
}

function passiveSources(definition) {
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt].filter(Boolean);
}

function rageStatSources(definition) {
  return [definition.ragePassive, definition.rageArt].filter(Boolean);
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

// The Chebyshev radius an enemy-debuff aura currently reaches from `source`. An
// aura extends one tile further while its OWNER rages: a Ghoul has no rage of its
// own, so it borrows its summoner's rage state — a raging Necromancer widens both
// its own aura AND every Ghoul it raised.
function auraRadius(source, baseRadius, state) {
  let raging = isRaging(source);
  if (!raging && source.summonerId && state?.units) {
    const summoner = state.units.find((u) => u.id === source.summonerId);
    raging = Boolean(summoner && isRaging(summoner));
  }
  return raging ? baseRadius + 1 : baseRadius;
}

// Every enemyAura a `source` projects, paired with its current reach (RAGE folded
// in). Shared by enemyAuraStats (the stat fold) and getAuraSources (the always-on
// board overlay) so the gameplay radius and the drawn radius can never drift.
function auraEntries(source, state) {
  const definition = getUnitType(source.type);
  const passives = [definition.passive, ...definition.arts];
  const rageSources = isRaging(source) ? [definition.ragePassive, definition.rageArt] : [];
  const entries = [];
  for (const passive of [...passives, ...rageSources]) {
    const auras = [];
    if (passive?.effect?.type === "enemyAura") auras.push(passive.effect);
    if (passive?.effect?.enemyAura) auras.push(passive.effect.enemyAura);
    for (const aura of auras) entries.push({ aura, radius: auraRadius(source, aura.radius ?? 2, state) });
  }
  return entries;
}

// Debuff auras projected by ENEMY units (the Necromancer's Deathly Aura and the
// Ghoul that carries it). Mirrors teamAuraStats but scans enemy sources and gates
// on Chebyshev range. A source's RAGE amplification rides on the nested
// `effect.enemyAura` block of a statModifiers rage source, so the same base aura
// can grow while the host rages without a second stat-application path.
function enemyAuraStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  for (const source of state.units) {
    if (source.hp <= 0 || source.player === unit.player) continue;
    for (const { aura, radius } of auraEntries(source, state)) {
      if (chebyshev(source.position, unit.position) > radius) continue;
      for (const [name, value] of Object.entries(aura.stats ?? {})) {
        if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
      }
    }
  }
  return totals;
}

// Every living aura source on the board with its current reach, for the UI to keep
// auras visible at all times: { position, player, radius } (radius already folds in
// the RAGE +1 extension). `player` is the SOURCE's team so the overlay can tint by
// faction. Independent of selection — auras show whether or not a unit is active.
export function getAuraSources(state) {
  const sources = [];
  if (!state?.units) return sources;
  for (const source of state.units) {
    if (source.hp <= 0) continue;
    let radius = 0;
    for (const { radius: r } of auraEntries(source, state)) radius = Math.max(radius, r);
    if (radius > 0) sources.push({ position: source.position, player: source.player, radius });
  }
  return sources;
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
  for (const [name, value] of Object.entries(enemyAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }

  const passiveEffect = getUnitType(unit.type).passive?.effect;
  if (passiveEffect?.type === "thresholdBoost" && unit.hp > 0 && unit.hp < passiveEffect.hpBelow) {
    for (const [name, value] of Object.entries(passiveEffect.stats ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  if (isRaging(unit)) {
    for (const source of rageStatSources(getUnitType(unit.type))) {
      // Only statModifiers rage sources feed the unit's OWN stats. A rage source
      // may also carry a nested `enemyAura` (handled by enemyAuraStats); that must
      // not leak onto the raging unit itself.
      if (source.effect?.type !== "statModifiers") continue;
      for (const [name, value] of Object.entries(source.effect?.stats ?? {})) {
        if (name in stats && Number.isFinite(value)) stats[name] += value;
      }
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
  if (!isRaging(unit)) return false;
  const definition = getUnitType(unit.type);
  return Boolean(definition.ragePassive?.effect?.defending || definition.rageArt?.effect?.defending);
}

// Presentation/query helper — not permission to activate an ART.
export function getAvailableArts(unit) {
  const definition = getUnitType(unit.type);
  return isRaging(unit)
    ? [...definition.arts, definition.rageArt].filter(Boolean)
    : [...definition.arts];
}

// --- CPU AI metadata --------------------------------------------------------
// Every active art declares `ai.intent`; every unit declares an `ai` block
// (threatValue / role / protect). The planner + evaluator in src/ai/ read these
// through the normalizers below so they never see a missing block — decision 4,
// option C: normalize for runtime safety AND tests/ai-metadata.test.js enforces
// that the data is authored explicitly. Full schema: CPU_AI_METADATA_SCHEMA.md.
export const AI_INTENTS = Object.freeze([
  "strike", "statusCast", "coneAoe", "selfBlast", "healAllies",
  "tilePulse", "reposition", "rush", "summon", "placeObject", "defend"
]);
export const AI_ROLES = Object.freeze([
  "bruiser", "skirmisher", "ranged", "caster", "support", "controller", "summon"
]);

const DEFAULT_UNIT_AI = Object.freeze({ threatValue: 10, role: "skirmisher", protect: false });

// Normalized unit-level AI metadata, with safe fallbacks for any unannotated unit.
// `protect` defaults true for support/caster roles when omitted.
export function normalizeUnitAi(definitionOrType) {
  const definition = typeof definitionOrType === "string" ? getUnitType(definitionOrType) : definitionOrType;
  const ai = definition?.ai ?? {};
  return {
    threatValue: Number.isFinite(ai.threatValue) ? ai.threatValue : DEFAULT_UNIT_AI.threatValue,
    role: AI_ROLES.includes(ai.role) ? ai.role : DEFAULT_UNIT_AI.role,
    protect: typeof ai.protect === "boolean" ? ai.protect : (ai.role === "support" || ai.role === "caster")
  };
}

// Normalized art-level AI metadata. An active art missing `ai` degrades to a plain
// `strike` so the planner can still offer it; tags/evHints/priority get empty/neutral
// defaults.
export function normalizeArtAi(art) {
  const ai = art?.ai ?? {};
  return {
    intent: AI_INTENTS.includes(ai.intent) ? ai.intent : "strike",
    tags: Array.isArray(ai.tags) ? ai.tags : [],
    evHints: ai.evHints ?? {},
    priority: Number.isFinite(ai.priority) ? ai.priority : 1
  };
}
