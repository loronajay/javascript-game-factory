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
  "little-brother": LITTLE_BROTHER
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
  return takesTurns(unit) && !getUnitType(unit.type).commandOnly;
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

function allPassiveSources(definition) {
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt].filter(Boolean);
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

// Brick House (Clod): a PROXIMITY team buff. Unlike teamAura (unconditional while the
// source lives), this only reaches allies within the source's Chebyshev radius — so it
// reads live positions each call and evaporates the instant an ally steps away. Scans
// allied sources OTHER than `unit` ("allies standing near Clod"), so the source never
// buffs itself through this path (its own bonus is selfAllyAuraStats below).
function allyAuraStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  const applied = new Set();
  for (const source of state.units) {
    if (source.hp <= 0 || source.id === unit.id || !areAllies(source, unit)) continue;
    const effect = getUnitType(source.type).passive?.effect;
    if (effect?.type !== "allyAura") continue;
    const radius = Math.max(0, Number(effect.radius) || 0);
    if (chebyshev(source.position, unit.position) > radius) continue;
    const key = passiveStackKey(getUnitType(source.type).passive, effect);
    if (applied.has(key)) continue;
    applied.add(key);
    for (const [name, value] of Object.entries(effect.stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
    }
  }
  return totals;
}

// The source side of Brick House: `unit` gains `selfPerAlly` for every living ally
// currently standing inside its own aura radius (+1 STR each). Read live off positions,
// so it tracks the board turn by turn.
function selfAllyAuraStats(unit, state) {
  const totals = {};
  const effect = getUnitType(unit.type).passive?.effect;
  if (effect?.type !== "allyAura" || !effect.selfPerAlly || !state?.units) return totals;
  const radius = Math.max(0, Number(effect.radius) || 0);
  let count = 0;
  for (const ally of state.units) {
    if (ally.hp <= 0 || ally.id === unit.id || !areAllies(ally, unit)) continue;
    if (chebyshev(unit.position, ally.position) <= radius) count += 1;
  }
  if (count <= 0) return totals;
  for (const [name, value] of Object.entries(effect.selfPerAlly)) {
    if (Number.isFinite(value)) totals[name] = value * count;
  }
  return totals;
}

function teamCompositionStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  const applied = new Set();
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    const effect = source.effect;
    if (effect?.type !== "teamCompositionStats") continue;
    const required = effect.requiredTypes ?? [];
    const hasTeam = required.every((type) => state.units.some((ally) =>
      ally.hp > 0 &&
      ally.type === type &&
      areAllies(ally, unit)));
    if (!hasTeam) continue;
    const key = passiveStackKey(source, effect);
    if (applied.has(key)) continue;
    applied.add(key);
    for (const [name, value] of Object.entries(effect.stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
    }
  }
  return totals;
}

function globalTypePresenceStats(unit, state) {
  const totals = {};
  if (!state?.units) return totals;
  const applied = new Set();
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    const effect = source.effect;
    if (effect?.type !== "globalTypePresenceStats") continue;
    const required = effect.requiredTypes ?? [];
    const active = required.every((type) => state.units.some((candidate) =>
      candidate.hp > 0 &&
      candidate.type === type));
    if (!active) continue;
    const key = passiveStackKey(source, effect);
    if (applied.has(key)) continue;
    applied.add(key);
    for (const [name, value] of Object.entries(effect.stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
    }
  }
  return totals;
}

function teamCompositionEffectActive(unit, state, effect) {
  const required = effect?.requiredTypes ?? [];
  if (!required.length || !state?.units) return false;
  return required.every((type) => state.units.some((ally) =>
    ally.hp > 0 &&
    ally.type === type &&
    areAllies(ally, unit)));
}

// The Chebyshev radius of a unit's ally-buff aura (Brick House), for the board overlay.
// 0 for any unit without one.
function friendlyAuraRadius(source) {
  const effect = getUnitType(source.type).passive?.effect;
  return effect?.type === "allyAura" ? Math.max(0, Number(effect.radius) || 0) : 0;
}

function teamMagicSupportSources(unit, state) {
  const sources = [];
  if (!state?.units) return sources;
  const applied = new Set();
  for (const source of state.units) {
    if (source.hp <= 0 || !areAllies(source, unit)) continue;
    const definition = getUnitType(source.type);
    for (const passive of passiveSources(definition)) {
      if (passive.kind && passive.kind !== "passive") continue;
      if (passive.effect?.type !== "teamMagicSupport") continue;
      const key = passiveStackKey(passive);
      if (applied.has(key)) continue;
      applied.add(key);
      sources.push(passive.effect);
    }
  }
  return sources;
}

export function getTeamMagicDamageBonus(attacker, state) {
  let bonus = 0;
  for (const effect of teamMagicSupportSources(attacker, state)) {
    bonus += Math.max(0, Number(effect.magicDamage) || 0);
  }
  return bonus;
}

export function getSourceDamageBonus(attacker, target, state, damageType) {
  if (!attacker || !target) return 0;
  let bonus = 0;
  for (const source of allPassiveSources(getUnitType(attacker.type))) {
    const effect = source.effect;
    if (effect?.type === "studyTarget" && attacker.studiedTargetId === target.id) {
      bonus += Math.max(0, Number(effect.damageBonus) || 0);
    }
    if (effect?.type === "teamCompositionStats" && teamCompositionEffectActive(attacker, state, effect)) {
      bonus += Math.max(0, Number(effect.sourceDamage?.[damageType]) || 0);
    }
  }
  return bonus;
}

export function getMagicDamageReward(attacker, target) {
  if (!attacker || !target || attacker.studiedTargetId !== target.id) return null;
  for (const source of allPassiveSources(getUnitType(attacker.type))) {
    const effect = source.effect;
    if (effect?.type === "studyTarget" && effect.magicReward) {
      return {
        hp: Math.max(0, Number(effect.magicReward.hp) || 0),
        mp: Math.max(0, Number(effect.magicReward.mp) || 0)
      };
    }
  }
  return null;
}

export function hasLivingStudiedTarget(unit, state) {
  return Boolean(unit?.studiedTargetId && state?.units?.some((target) =>
    target.id === unit.studiedTargetId &&
    target.hp > 0 &&
    areEnemies(unit, target)));
}

function getTeamMpCostReduction(unit, state) {
  let reduction = 0;
  let minCost = 0;
  for (const effect of teamMagicSupportSources(unit, state)) {
    reduction += Math.max(0, Number(effect.mpCostReduction) || 0);
    minCost = Math.max(minCost, Number(effect.minMpCost) || 0);
  }
  return { reduction, minCost };
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
  // Brick House (Clod): a friendly buff aura also projects a visible zone.
  radius = Math.max(radius, friendlyAuraRadius(source));
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

// --- King commands ----------------------------------------------------------
// The King's four commands (Strike/Hold/Pursue/Higher Ground) are a DYNAMIC one-turn
// team buff, not a baked status: the buff is folded live from the King's currently-
// active command so the RAGE scaling ("+1 per allied unit currently in RAGE") tracks
// the board in real time, and it vanishes the instant the King's turn passes. A King's
// command is "active" only during the same turnNumber it was issued (the King is forced
// to re-issue one every turn — see the beginActivation gate). Kept inline here beside
// the aura/stance folds (not a separate module) so getEffectiveStats needs no extra
// import — the same pattern stances use.
function activeCommandData(king) {
  if (!king.command) return null;
  return getArt(king.type, king.command)?.command ?? null;
}
function activeCommanderKings(unit, state) {
  if (!state?.units) return [];
  return state.units.filter((king) =>
    king.hp > 0 &&
    getUnitType(king.type).actsFirst &&
    king.command &&
    king.commandTurn === state.turnNumber &&
    areAllies(king, unit));
}
function ragingAllyCount(state, ref) {
  if (!state?.units) return 0;
  return state.units.filter((u) => u.hp > 0 && areAllies(u, ref) && isRaging(u)).length;
}

// The live stat buff an active allied King grants `unit` this turn ({} if none). The
// King never buffs himself (a Pursue +MOVE must not make the immobile King mobile), so
// commandOnly units are excluded. Every buffed value gains +1 per allied unit in RAGE;
// Strike's base is lifted when the King's previous command matches `prevOverride`.
export function getCommandBuffStats(unit, state) {
  if (isCommandOnly(unit)) return {};
  const totals = {};
  for (const king of activeCommanderKings(unit, state)) {
    const cmd = activeCommandData(king);
    if (!cmd?.stats) continue;
    const base = (cmd.prevOverride && king.previousCommand && cmd.prevOverride[king.previousCommand]) || cmd.stats;
    const rage = ragingAllyCount(state, king);
    for (const [name, value] of Object.entries(base)) {
      if (!Number.isFinite(value)) continue;
      const scaled = value + rage;
      // Two Kings on one team don't stack — take the strongest per stat.
      totals[name] = name in totals ? Math.max(totals[name], scaled) : scaled;
    }
  }
  return totals;
}

// Hold's "+1 to all healing this turn" (+1 per raging ally). Team-scoped, so it takes
// the healed unit's actor/team context. 0 when no allied King holds Hold this turn.
export function getCommandHealBonus(state, actor) {
  let bonus = 0;
  for (const king of activeCommanderKings(actor, state)) {
    const cmd = activeCommandData(king);
    if (!Number.isFinite(cmd?.healBonus) || cmd.healBonus <= 0) continue;
    bonus = Math.max(bonus, cmd.healBonus + ragingAllyCount(state, king));
  }
  return bonus;
}

// Higher Ground's "+1 range, area ARTS included" (+1 per raging ally). The attack/
// targeted-ART range rides on the attackRange stat buff (getCommandBuffStats); this is
// the extra reach folded into the AOE/placement/line geometry in rules/arts.js.
export function getCommandRangeBonus(state, actor) {
  let bonus = 0;
  for (const king of activeCommanderKings(actor, state)) {
    const cmd = activeCommandData(king);
    if (!Number.isFinite(cmd?.rangeBonus) || cmd.rangeBonus <= 0) continue;
    bonus = Math.max(bonus, cmd.rangeBonus + ragingAllyCount(state, king));
  }
  return bonus;
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
  // Brick House (Clod): +DEF received from a nearby allied source, and +STR to the
  // source itself per sheltered ally. Both proximity-gated, folded live off positions.
  for (const [name, value] of Object.entries(allyAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(selfAllyAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(teamCompositionStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(globalTypePresenceStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(enemyAuraStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(linkedStatModTotals(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  // King commands (Strike/Hold/Pursue/Higher Ground): a live one-turn team buff.
  for (const [name, value] of Object.entries(getCommandBuffStats(unit, state))) {
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
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    const boost = source.effect?.missingHpStat;
    if (!boost || unit.hp <= 0) continue;
    const stat = boost.stat;
    const per = Math.max(1, Number(boost.per) || 1);
    const amount = Number(boost.amount) || 0;
    const missing = Math.max(0, getUnitType(unit.type).stats.maxHp - unit.hp);
    const bonus = Math.floor(missing / per) * amount;
    if (stat in stats && Number.isFinite(bonus)) stats[stat] += bonus;
  }
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    const effect = source.effect;
    if (effect?.type !== "stationaryStrength") continue;
    const bonus = Math.min(Math.max(0, unit.stationaryStrength ?? 0), Math.max(0, Number(effect.max) || 0));
    if (bonus > 0) stats.strength += bonus;
  }
  // Bruiser Mode (Juggernaut): a stronger stat block while the unit sits at 0 MP. Folded
  // generically off the passive data so no rule hard-codes the unit. The paired magic
  // vulnerability lives in getSelfMagicVulnerability (rules/combat.js), not here.
  if (passiveEffect?.type === "emptyMpBoost" && (unit.mp ?? 0) <= 0) {
    for (const [name, value] of Object.entries(passiveEffect.stats ?? {})) {
      if (name in stats && Number.isFinite(value)) stats[name] += value;
    }
  }
  if (passiveEffect?.type === "oreHarvester") {
    const resource = Math.max(0, Number(unit.mp) || 0);
    if (resource <= 0 && Number.isFinite(passiveEffect.emptyAttackRange)) {
      stats.attackRange = Math.min(stats.attackRange, passiveEffect.emptyAttackRange);
    }
    if (resource >= stats.maxMp) {
      for (const [name, value] of Object.entries(passiveEffect.fullResourceStats ?? {})) {
        if (name in stats && Number.isFinite(value)) stats[name] += value;
      }
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
    for (const source of rageStatSources(getUnitType(unit.type))) {
      if (source.effect?.type !== "oneShotStatModifiers" || unit.desperationShotSpent) continue;
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
  // Heavy (Gargoyle): a hard Move ceiling no speed buff can exceed. Applied after every
  // additive fold, before the floor clamp — folded generically off the passive data.
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    const cap = source.effect?.maxMoveRange;
    if (Number.isFinite(cap)) stats.moveRange = Math.min(stats.moveRange, cap);
  }
  // A slowed unit still gets at least 1 MOVE, but a base-immobile unit (the King) stays
  // immobile — clamp the floor to the unit's own baseline so debuffs can't lift a 0.
  const baseMove = getUnitType(unit.type).stats.moveRange;
  stats.moveRange = Math.max(baseMove <= 0 ? 0 : 1, stats.moveRange);
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

function hasFreeSelectedArt(unit, art) {
  if (!isRaging(unit) || !art) return false;
  const definition = getUnitType(unit.type);
  const sources = [definition.ragePassive, definition.rageArt].filter(Boolean);
  return sources.some((source) => Array.isArray(source.effect?.freeSelectedArts) && source.effect.freeSelectedArts.includes(art.id));
}

// The MP an ART actually costs this unit right now: 0 for a raging Juggernaut (freeArts),
// the catalog cost for everyone else. The single seam every MP check reads.
export function getArtMpCost(unit, art, state = null) {
  if (!art) return 0;
  if (hasFreeSelectedArt(unit, art)) return 0;
  if (hasFreeArts(unit)) return 0;
  const base = art.mpCost ?? 0;
  if (base <= 0) return base;
  const support = getTeamMpCostReduction(unit, state);
  if (support.reduction <= 0) return base;
  return Math.max(support.minCost, base - support.reduction);
}

export function getBasicAttackResourceCost(attacker, target) {
  if (!attacker || !target) return 0;
  const effect = getUnitType(attacker.type).passive?.effect;
  if (effect?.type !== "oreHarvester") return 0;
  const targetPosition = target.position ?? target;
  const distance = chebyshev(attacker.position, targetPosition);
  return distance > 1 ? Math.max(0, Number(effect.rangedAttackCost) || 0) : 0;
}

export function getWallKillResourceReward(attacker, position) {
  if (!attacker || !position) return 0;
  const effect = getUnitType(attacker.type).passive?.effect;
  if (effect?.type !== "oreHarvester") return 0;
  const range = Number.isFinite(effect.wallKillRange) ? effect.wallKillRange : 1;
  if (chebyshev(attacker.position, position) > range) return 0;
  return Math.max(0, Number(effect.wallKillOreReward) || 0);
}

export function getRageArtRangeBonus(unit) {
  if (!unit || !isRaging(unit)) return 0;
  const definition = getUnitType(unit.type);
  const bonus = Math.max(
    0,
    Number(definition.ragePassive?.effect?.artRangeBonus) || 0,
    Number(definition.rageArt?.effect?.artRangeBonus) || 0
  );
  return bonus;
}

export function getRageEffectValue(unit, key, fallback = null) {
  if (!unit || !isRaging(unit)) return fallback;
  const definition = getUnitType(unit.type);
  return definition.ragePassive?.effect?.[key] ?? definition.rageArt?.effect?.[key] ?? fallback;
}

// --- Virus (contagion) ------------------------------------------------------
// Spread: a status inflicted on an enemy of a living Virus propagates to that enemy's
// nearby allies. The radius grows by `rageRadiusBonus` while the Virus rages (Infectious
// Affinity). Read centrally by the reducer's applySpreadReactions so no ability hard-codes
// the contagion. Returns null for any unit without the passive.
export function getStatusSpreadConfig(unit) {
  const effect = getUnitType(unit.type).passive?.effect;
  if (effect?.type !== "statusSpread") return null;
  const radius = Math.max(0, Number(effect.radius) || 0) +
    (isRaging(unit) ? Math.max(0, Number(effect.rageRadiusBonus) || 0) : 0);
  return { radius, statuses: new Set(effect.statuses ?? []) };
}

// Growth: the MP a unit restores each time it poisons an enemy. Scans every passive
// source so a unit can carry it as a passive ART entry. 0 for any unit without it.
export function getPoisonMpRefund(unit) {
  for (const source of allPassiveSources(getUnitType(unit.type))) {
    if (source.effect?.type === "poisonMpRefund") return Math.max(0, Number(source.effect.amount) || 0);
  }
  return 0;
}

// A status a raging unit's kit lands on EVERY landed basic attack (Virus's Infectious
// Affinity poison). Returns { status, duration } or null (also null when not raging).
export function getRageAttackStatus(unit) {
  return getRageEffectValue(unit, "attackStatus", null);
}

// The set of status types a raging unit inflicts with a guaranteed (100%) roll — Virus's
// poison, once Infectious Affinity is live. Empty for any non-raging unit.
export function getGuaranteedStatuses(unit) {
  const list = getRageEffectValue(unit, "guaranteedStatuses", null);
  return new Set(Array.isArray(list) ? list : []);
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
  const arts = isRaging(unit)
    ? [...definition.arts.filter((art) => !art.replacedByRageArt), definition.rageArt].filter(Boolean)
    : [...definition.arts];
  return arts;
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
  "grab", "lineStrike", "recharge",
  // The King's global one-turn team buffs (Strike/Hold/Pursue/Higher Ground):
  "commandBuff",
  // Angel's single-ally targeted buff (Anoint: +1 range on a friendly unit):
  "buffAlly", "healAlly",
  // Mystic's single-ally targeted cleanse (Purify: remove all statuses):
  "cleanseAlly",
  // Monk's guarded ally reposition + defend handoff:
  "protectAlly",
  // Gargoyle's abilities:
  //   flightStrike — Flight: reposition (Move + 1) then a small TRUE blast on landing.
  //   lineBurst    — Pyroclasm: hit every enemy on any of the 8 straight rays in range.
  "flightStrike", "lineBurst",
  // Virus's contagion casts:
  //   statusAoe    — Smog: a self-centred blind cloud (no damage, no roll).
  //   poisonBurst  — Poison Tick / Explosion: true damage to every poisoned enemy.
  "statusAoe", "poisonBurst",
  // Clod's Thunderous Charge: a RANGE-picked tile that detonates a radius blast (damage +
  // a mass stun) — a targeted-tile AoE, distinct from the self-centred selfBlast.
  "targetedBlast"
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
