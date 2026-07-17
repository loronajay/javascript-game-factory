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
import { KING } from "./units/king.js";
import { ANGEL } from "./units/angel.js";
import { MONK } from "./units/monk.js";
import { GARGOYLE } from "./units/gargoyle.js";
import { NEMESIS } from "./units/nemesis.js";
import { VIRUS } from "./units/virus.js";
import { CLOD } from "./units/clod.js";
import { FAT_KNIGHT } from "./units/fat-knight.js";
import { FAT_WIZARD } from "./units/fat-wizard.js";
import { FAT_CLERIC } from "./units/fat-cleric.js";
import { FAT_BOWMAN } from "./units/fat-bowman.js";
import { MINER } from "./units/miner.js";
import { BIG_BROTHER } from "./units/big-brother.js";
import { LITTLE_BROTHER } from "./units/little-brother.js";
import { BLACKSWORD } from "./units/blacksword.js";
import { RONIN } from "./units/ronin.js";
import { MOTHER_NATURE } from "./units/mother-nature.js";
import { SUMMONER } from "./units/summoner.js";
import { RIOT_COP } from "./units/riot-cop.js";
import { TREANT } from "./units/treant.js";
import { drawValue } from "./rng.js";
import { areAllies, areEnemies, getTileAffinity } from "./state.js";
import { WEATHER_TYPES, normalizeWeatherSpec } from "./weather.js";

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
  juggernaut: JUGGERNAUT,
  king: KING,
  angel: ANGEL,
  monk: MONK,
  gargoyle: GARGOYLE,
  nemesis: NEMESIS,
  virus: VIRUS,
  clod: CLOD,
  "fat-knight": FAT_KNIGHT,
  "fat-wizard": FAT_WIZARD,
  "fat-cleric": FAT_CLERIC,
  "fat-bowman": FAT_BOWMAN,
  miner: MINER,
  "big-brother": BIG_BROTHER,
  "little-brother": LITTLE_BROTHER,
  blacksword: BLACKSWORD,
  ronin: RONIN,
  "mother-nature": MOTHER_NATURE,
  summoner: SUMMONER,
  "riot-cop": RIOT_COP,
  treant: TREANT
});

// Local Chebyshev so this module stays free of a rules/movement.js import
// (movement.js imports getEffectiveStats from here — importing it back would be
// a cycle). Aura folding below needs grid distance.
export function chebyshev(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Summoned pieces (Ghouls) are real units but never activate: they are skipped
// by the turn loop, the victory check, the squad picker, and summary counts.
export function takesTurns(unit) {
  return !getUnitType(unit.type).summon;
}

// A commander (the King) must act first each turn and can ONLY issue command ARTS —
// he never moves, attacks, or defends.
export function isCommander(unit) {
  return Boolean(getUnitType(unit.type).actsFirst);
}
export function isCommandOnly(unit) {
  return Boolean(getUnitType(unit.type).commandOnly);
}

// Whether a living unit keeps its team in the match. A turn-less summon (Ghoul) and a
// non-combatant commander (King) can't win on their own, so neither sustains victory —
// a player left with only these has lost. Default true for every ordinary unit.
export function sustainsVictory(unit) {
  return takesTurns(unit) && !unit.ghost && !getUnitType(unit.type).commandOnly;
}

export function getUnitType(type) {
  const definition = UNIT_TYPES[type];
  if (!definition) throw new Error(`Unknown unit type: ${type}`);
  return definition;
}

export function getResourceMeta(typeOrDefinition) {
  const definition = typeof typeOrDefinition === "string" ? getUnitType(typeOrDefinition) : typeOrDefinition;
  return definition?.resource ?? Object.freeze({ id: "mp", label: "MP", shortLabel: "MP", startsAt: definition?.stats?.maxMp ?? 0 });
}

export function getInitialMp(typeOrDefinition) {
  const definition = typeof typeOrDefinition === "string" ? getUnitType(typeOrDefinition) : typeOrDefinition;
  const resource = getResourceMeta(definition);
  return Number.isFinite(resource.startsAt) ? resource.startsAt : definition.stats.maxMp;
}

// --- Finite ability uses (Riot Cop) -----------------------------------------
// Some arts are gated by a finite pool of USES rather than MP (Riot Cop's Stun Gun /
// Smoke Bomb). Each such art declares a numeric `uses` (its max); the live per-art
// remaining counter lives on `unit.abilityUses`, and `unit.abilityRecharge` tracks how
// many of the unit's own turns a depleted pool has waited (see the reducer's
// beginActivation recharge). Arts without `uses` are infinite (Shield Bash / Cover).
export function getAbilityUseMax(art) {
  return Number.isFinite(art?.uses) ? art.uses : null;
}

// A fresh { artId: max } map for every finite-use art a definition owns (the rageArt
// included). Seeds createUnit and the rage-entry refresh.
export function initialAbilityUses(typeOrDefinition) {
  const definition = typeof typeOrDefinition === "string" ? getUnitType(typeOrDefinition) : typeOrDefinition;
  const uses = {};
  for (const art of [...(definition.arts ?? []), definition.rageArt].filter(Boolean)) {
    if (Number.isFinite(art.uses)) uses[art.id] = art.uses;
  }
  return uses;
}

// Remaining uses of a finite-use art on `unit` (its max when the unit has no counter
// yet); null for an infinite-use / MP-costed art.
export function getAbilityUsesRemaining(unit, art) {
  if (!Number.isFinite(art?.uses)) return null;
  const stored = unit?.abilityUses?.[art.id];
  return Number.isFinite(stored) ? stored : art.uses;
}

// True when a finite-use art still has a use left (always true for an infinite-use art).
// The single gate read by canUseArt + the CPU planner so both agree.
export function hasAbilityUsesRemaining(unit, art) {
  const remaining = getAbilityUsesRemaining(unit, art);
  return remaining === null || remaining > 0;
}

export function getArt(type, artId) {
  const definition = getUnitType(type);
  return definition.arts.find((art) => art.id === artId) ??
    (definition.rageArt?.id === artId ? definition.rageArt : null);
}

// Mission bodies may tune one of their canonical ARTS without changing the unit type
// players draft in normal battles. Overrides are data-only patches keyed by ART id.
export function getArtForUnit(unit, artId) {
  const art = unit ? getArt(unit.type, artId) : null;
  const override = unit?.artOverrides?.[artId];
  return art && override ? { ...art, ...override } : art;
}

export function getSoulShuffleChoices(unit, rngState) {
  const passive = getUnitType(unit.type).passive?.effect;
  const count = Math.max(1, Number(passive?.choices) || 5);
  const excluded = new Set();
  if (passive?.excludeSelf) excluded.add(unit.type);
  if (passive?.excludeLastGhost && unit.lastGhostType) excluded.add(unit.lastGhostType);
  // A unit may carry its own restricted Soul Shuffle pool (Void Ridden Castle gives each
  // of its four Summoners a disjoint slice of the roster). Absent one, the whole roster
  // minus summons/commanders is fair game, as normal.
  const roster = Array.isArray(unit.ghostPool) && unit.ghostPool.length
    ? unit.ghostPool.filter((type) => UNIT_TYPES[type])
    : Object.keys(UNIT_TYPES);
  // A COMMANDER can never be summoned. `actsFirst` means the owner must command that unit
  // before any other unit of theirs may activate — a temporary ghost carrying it would
  // seize the owner's whole activation order for the one turn it exists (and the King,
  // being commandOnly, cannot fight at all). This gates the King and Mother Nature off
  // every summon, and any future commander with them.
  const candidates = roster.filter((type) => {
    const definition = UNIT_TYPES[type];
    return !excluded.has(type) && !definition.summon && !definition.commandOnly && !definition.actsFirst;
  });
  const shuffled = [...candidates];
  let nextRngState = rngState;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const draw = drawValue(nextRngState);
    nextRngState = draw.rngState;
    const swap = Math.floor(draw.value * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return { choices: shuffled.slice(0, count), rngState: nextRngState };
}

export function isRaging(unit) {
  const threshold = Number.isFinite(unit.rageThreshold) ? unit.rageThreshold : 5;
  return unit.hp > 0 && unit.hp <= threshold;
}

export function passiveSources(definition) {
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt].filter(Boolean);
}

export function rageStatSources(definition) {
  return [definition.ragePassive, definition.rageArt].filter(Boolean);
}

export function allPassiveSources(definition) {
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt].filter(Boolean);
}

export function stableValueKey(value) {
  if (!value || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableValueKey).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValueKey(value[key])}`).join(",")}}`;
}

export function passiveStackKey(passive, effect = passive?.effect) {
  return passive?.stackKey ?? effect?.stackKey ?? `${effect?.type ?? "passive"}:${stableValueKey(effect)}`;
}

