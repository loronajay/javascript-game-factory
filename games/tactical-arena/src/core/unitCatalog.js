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
import { WITCH_DOCTOR } from "./units/witch-doctor.js";
import { FATHER_TIME } from "./units/father-time.js";
import { JUGGERNAUT } from "./units/juggernaut.js";
import { areAllies, areEnemies } from "./state.js";

export const UNIT_TYPES = Object.freeze({
  swordsman: SWORDSMAN,
  archer: ARCHER,
  mystic: MYSTIC,
  magician: MAGICIAN,
  paladin: PALADIN,
  necromancer: NECROMANCER,
  ghoul: GHOUL,
  sniper: SNIPER,
  "witch-doctor": WITCH_DOCTOR,
  "father-time": FATHER_TIME,
  juggernaut: JUGGERNAUT
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

function stableValueKey(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValueKey(value[key])}`).join(",")}}`;
}

export function passiveStackKey(passive, effect = passive?.effect) {
  return passive?.stackKey ?? effect?.stackKey ?? `${effect?.type ?? "passive"}:${stableValueKey(effect)}`;
}

function teamAuraStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  const applied = new Set();
  for (const source of state.units) {
    if (source.hp <= 0 || !areAllies(source, unit)) continue;
    const definition = getUnitType(source.type);
    for (const passive of passiveSources(definition)) {
      if (passive.kind !== "passive" || passive.effect?.type !== "teamAura") continue;
      const key = passiveStackKey(passive);
      if (applied.has(key)) continue;
      applied.add(key);
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
    for (const aura of auras) {
      entries.push({
        aura,
        radius: auraRadius(source, aura.radius ?? 2, state),
        stackKey: passiveStackKey(passive, aura)
      });
    }
  }
  return entries;
}

export function getUnitAuraRadius(source, state) {
  let radius = 0;
  for (const { radius: r } of auraEntries(source, state)) radius = Math.max(radius, r);
  // A damage aura (Father Time's Time Steal) also projects a visible zone. It uses a
  // FLAT radius (no RAGE extension) so the drawn overlay matches applyTimeStealTick.
  const passiveEffect = getUnitType(source.type).passive?.effect;
  if (passiveEffect?.type === "damageAura") radius = Math.max(radius, passiveEffect.radius ?? 2);
  return radius;
}

// Debuff auras projected by ENEMY units (the Necromancer's Deathly Aura and the
// Ghoul that carries it). Mirrors teamAuraStats but scans enemy sources and gates
// on Chebyshev range. A source's RAGE amplification rides on the nested
// `effect.enemyAura` block of a statModifiers rage source, so the same base aura
// can grow while the host rages without a second stat-application path.
function enemyAuraStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  const applied = new Set();
  for (const source of state.units) {
    if (source.hp <= 0 || !areEnemies(source, unit)) continue;
    for (const { aura, radius, stackKey } of auraEntries(source, state)) {
      if (chebyshev(source.position, unit.position) > radius) continue;
      if (applied.has(stackKey)) continue;
      applied.add(stackKey);
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
    const radius = getUnitAuraRadius(source, state);
    if (radius > 0) sources.push({ position: source.position, player: source.player, radius });
  }
  return sources;
}

// Source-linked persistent stat modifiers placed on a unit (Father Time's Age). Each
// entry is { sourceId, stats }; it applies only while its source is still alive, so a
// modifier "lasts until the source is defeated" needs no cleanup path — the fold just
// stops. Needs state to resolve the source, mirroring the aura folds (skipped when
// state is null, exactly like team/enemy auras).
function linkedStatModTotals(unit, state) {
  const totals = {};
  if (!state?.units || !unit.linkedStatMods?.length) return totals;
  for (const mod of unit.linkedStatMods) {
    const source = state.units.find((u) => u.id === mod.sourceId);
    if (!source || source.hp <= 0) continue;
    for (const [name, value] of Object.entries(mod.stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
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
  for (const [name, value] of Object.entries(enemyAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(linkedStatModTotals(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }

  // Stance passives (Witch Doctor's Fire Stance +1 STR). Folded generically off
  // `unit.stance` + the unit's `stances` data so no rule hard-codes the unit.
  const stanceStats = getUnitType(unit.type).stances?.[unit.stance]?.stats;
  if (stanceStats) {
    for (const [name, value] of Object.entries(stanceStats)) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }

  const passiveEffect = getUnitType(unit.type).passive?.effect;
  if (passiveEffect?.type === "thresholdBoost" && unit.hp > 0 && unit.hp < passiveEffect.hpBelow) {
    for (const [name, value] of Object.entries(passiveEffect.stats ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  // Bruiser Mode (Juggernaut): a stronger stat block while the unit sits at 0 MP. Folded
  // generically off the passive data so no rule hard-codes the unit. The paired magic
  // vulnerability lives in getSelfMagicVulnerability (rules/combat.js), not here.
  if (passiveEffect?.type === "emptyMpBoost" && (unit.mp ?? 0) <= 0) {
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

// True when a raging unit's rage passive/art zeroes its ART costs (Juggernaut's Null
// Zone freeArts flag). Read centrally so the MP gate, the planner, and the resolvers
// all agree on the effective cost.
function hasFreeArts(unit) {
  if (!isRaging(unit)) return false;
  const definition = getUnitType(unit.type);
  return Boolean(definition.ragePassive?.effect?.freeArts || definition.rageArt?.effect?.freeArts);
}

// The MP an ART actually costs this unit right now: 0 for a raging Juggernaut (freeArts),
// the catalog cost for everyone else. The single seam every MP check reads.
export function getArtMpCost(unit, art) {
  if (!art) return 0;
  if (hasFreeArts(unit)) return 0;
  return art.mpCost ?? 0;
}

// True when a raging unit projects a board-wide healing lockout (Juggernaut's Null Zone
// disableHealing). Any living source suffices; read by isHealingDisabled (rules/combat.js).
export function projectsHealingLockout(unit) {
  if (unit.hp <= 0 || !isRaging(unit)) return false;
  const definition = getUnitType(unit.type);
  return (definition.ragePassive?.effect?.disableHealing === "global") ||
    (definition.rageArt?.effect?.disableHealing === "global");
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
  "tilePulse", "reposition", "rush", "summon", "placeObject", "defend",
  // Self/team support casts with no enemy target (Witch Doctor's Fire/Spirit/
  // Misfortune/Black Death dances): buff allies, cleanse, or shift stance.
  "buffAllies",
  // Father Time's ally-OR-enemy single-target utility + revive:
  //   statBuff — Age: persistent +stat on an ally / -stat on an enemy.
  //   hasten   — Time Stretch: +MOVE on an ally / Slow on an enemy.
  //   revive   — Rewind: return a fallen ally to the board.
  "statBuff", "hasten", "revive",
  // Juggernaut's line abilities + self MP vent:
  //   grab       — Tether Grab: pull the first ally/enemy on a straight ray.
  //   lineStrike — Rocket Punch: strike the first enemy on a straight ray (+ stun).
  //   recharge   — Recharge: restore this unit's own MP (or 1 HP at full MP).
  "grab", "lineStrike", "recharge"
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
