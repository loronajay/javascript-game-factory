// The live-stat authority: getEffectiveStats folds base stats, statuses, auras,
// team composition, tile/positional affinities, weather, and King commands into
// a unit's current numbers, alongside the cost/rage/status accessors the rules
// read. The unit registry, weather reads, King commands, and CPU-AI metadata
// live in sibling modules and are re-exported here, so every existing
// `from "./unitCatalog.js"` import keeps working.

import { areAllies, areEnemies, getTileAffinity } from "./state.js";

import {
  UNIT_TYPES,
  chebyshev,
  takesTurns,
  isCommander,
  isCommandOnly,
  sustainsVictory,
  getUnitType,
  getResourceMeta,
  getInitialMp,
  getAbilityUseMax,
  initialAbilityUses,
  getAbilityUsesRemaining,
  hasAbilityUsesRemaining,
  getArt,
  getArtForUnit,
  getSoulShuffleChoices,
  isRaging,
  passiveSources,
  rageStatSources,
  allPassiveSources,
  passiveStackKey,
} from "./unitRegistry.js";
import {
  getActiveWeather,
  getWeatherRestoreBonus,
  getWeatherMovementArtRangeBonus,
  getWeatherCritDamageBonus,
  getWeatherCritCreatesFire,
  getWeatherArtMpCostReduction,
  weatherAffinityStats,
  getWeatherAffinityMagicBonus,
  getWeatherAffinityRestore,
  getWeatherPassiveRestore,
} from "./unitWeather.js";
import { getCommandBuffStats, getCommandHealBonus, getCommandRangeBonus } from "./kingCommands.js";

// Public surface re-exports (see module headers above).
export {
  UNIT_TYPES, takesTurns, isCommander, isCommandOnly, sustainsVictory, getUnitType,
  getResourceMeta, getInitialMp, getAbilityUseMax, initialAbilityUses,
  getAbilityUsesRemaining, hasAbilityUsesRemaining, getArt, getArtForUnit,
  getSoulShuffleChoices, isRaging, passiveStackKey,
} from "./unitRegistry.js";
export {
  getActiveWeather, getWeatherRestoreBonus, getWeatherMovementArtRangeBonus,
  getWeatherCritDamageBonus, getWeatherCritCreatesFire, getWeatherAffinityMagicBonus,
  getWeatherAffinityRestore, getWeatherPassiveRestore,
} from "./unitWeather.js";
export { getCommandBuffStats, getCommandHealBonus, getCommandRangeBonus } from "./kingCommands.js";
export * from "./unitAiMetadata.js";

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

// The Chebyshev radius of a unit's healing-lockout aura (Big Brother's Magnetic
// Field), for the board overlay. Scans passive + arts, mirroring how
// isHealingDisabled (rules/combat.js) finds the same effect. 0 for any unit
// without one.
function healingLockoutAuraRadius(source) {
  const definition = getUnitType(source.type);
  for (const passive of [definition.passive, ...definition.arts]) {
    const effect = passive?.effect;
    if (effect?.type === "healingLockoutAura") return Math.max(0, Number(effect.radius) || 0);
  }
  return 0;
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

export function getCampaignDamageBoost(attacker, state) {
  const boost = state?.missionRules?.campaignDamageBoost;
  if (!attacker || !boost) return 0;
  if (Number.isFinite(boost.player) && attacker.player !== boost.player) return 0;
  if (Number.isFinite(boost.team) && attacker.team !== boost.team) return 0;
  return Math.max(0, Number(boost.amount) || 0);
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

function positionalDefenseStats(unit, state) {
  const effect = getUnitType(unit.type).arts?.find((art) => art.effect?.type === "positionalDefense")?.effect ??
    (getUnitType(unit.type).passive?.effect?.type === "positionalDefense" ? getUnitType(unit.type).passive.effect : null);
  if (!effect || !state?.units) return {};
  const radius = getUnitType(unit.type).stats.attackRange;
  const inRange = (other) => chebyshev(unit.position, other.position) <= radius;
  const enemies = state.units.filter((other) => other.hp > 0 && areEnemies(other, unit));
  const allies = state.units.filter((other) => other.hp > 0 && other.id !== unit.id && areAllies(other, unit));
  const totals = {};
  const add = (stats) => {
    for (const [name, value] of Object.entries(stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
    }
  };
  if (enemies.length && enemies.every(inRange)) add(effect.enemyStats);
  if (allies.length && allies.every(inRange)) add(effect.allyStats);
  return totals;
}

function tileAffinityStats(unit, state) {
  if (!state || !unit?.position) return {};
  const definition = getUnitType(unit.type);
  const affinity = getTileAffinity(state, unit.position);
  const totals = {};
  for (const source of allPassiveSources(definition)) {
    if (source.kind && source.kind !== "passive") continue;
    if ((source === definition.ragePassive || source === definition.rageArt) && !isRaging(unit)) continue;
    const bonus = source.effect?.tileAffinityStats;
    if (bonus?.affinity !== affinity) continue;
    for (const [name, value] of Object.entries(bonus.stats ?? {})) {
      if (Number.isFinite(value)) totals[name] = (totals[name] ?? 0) + value;
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
  // Brick House (Clod): a friendly buff aura also projects a visible zone.
  radius = Math.max(radius, friendlyAuraRadius(source));
  // Magnetic Field (Big Brother): a healing-lockout aura also projects a visible zone.
  radius = Math.max(radius, healingLockoutAuraRadius(source));
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
  // Treant: Enchanted Roots (current-weather stat bonus) + Deep Roots (positional DEF).
  for (const [name, value] of Object.entries(weatherAffinityStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(positionalDefenseStats(unit, state))) {
    if (name in stats && Number.isFinite(value)) stats[name] += value;
  }
  for (const [name, value] of Object.entries(tileAffinityStats(unit, state))) {
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
  const weather = getWeatherArtMpCostReduction(state);
  const reduced = base - support.reduction - weather.reduction;
  return Math.max(Math.max(support.minCost, weather.minCost), reduced);
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

// True for a unit that may move AND use an ART in the same activation (normally mutually
// exclusive). Some units only gain this while raging (Mystic's rage source, Summoner's
// Disturbed Spirit rage passive); others carry it as a standing, always-on passive
// (Monk's Shadow Step). Scans every passive source so either shape works.
export function canMoveAndUseArts(unit) {
  if (!unit) return false;
  if (getRageEffectValue(unit, "moveAndUseArts", false)) return true;
  const definition = getUnitType(unit.type);
  const staticSources = [definition.passive, ...definition.arts].filter(Boolean);
  return staticSources.some((source) => source.effect?.moveAndUseArts === true);
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
  return arts.map((art) => getArtForUnit(unit, art.id));
}

// --- CPU AI metadata --------------------------------------------------------
// Every active art declares `ai.intent`; every unit declares an `ai` block
// (threatValue / role / protect). The planner + evaluator in src/ai/ read these
// through the normalizers below so they never see a missing block — decision 4,
// option C: normalize for runtime safety AND tests/ai-metadata.test.js enforces
// that the data is authored explicitly. Full schema: CPU_AI_METADATA_SCHEMA.md.
