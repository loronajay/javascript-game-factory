// Weather-driven unit queries, extracted from unitCatalog: which weather is
// active (a living caster or a mission rule), and the stat/restore/crit reads
// the engine folds in while that weather holds. unitCatalog re-exports the
// public surface, so consumers keep importing from the catalog.

import { WEATHER_TYPES, normalizeWeatherSpec } from "./weather.js";
import { getUnitType, isRaging, allPassiveSources } from "./unitRegistry.js";

export function getActiveWeather(state) {
  const boardWeather = normalizeWeatherSpec(state?.weather);
  if (boardWeather) {
    return {
      ...WEATHER_TYPES[boardWeather.id],
      sourceId: boardWeather.sourceId
    };
  }

  for (const unit of state?.units ?? []) {
    if (unit.hp <= 0) continue;
    const weatherId = unit.weather ?? null;
    const weather = weatherId ? WEATHER_TYPES[weatherId] ?? getUnitType(unit.type).weathers?.[weatherId] : null;
    if (weather) return { id: weatherId, sourceId: unit.id, ...weather };
  }
  return null;
}

export function activeWeatherPersistent(state) {
  return getActiveWeather(state)?.persistent ?? null;
}

export function getWeatherRestoreBonus(state) {
  return Math.max(0, Number(activeWeatherPersistent(state)?.restoreBonus) || 0);
}

export function getWeatherMovementArtRangeBonus(state, art = null) {
  if (!art) return 0;
  const shape = art.targeting?.shape;
  const intent = art.ai?.intent;
  const movementArt = shape === "rushPath" || shape === "flightMove" || shape === "flee" || art.id === "flee" ||
    intent === "rush" || intent === "reposition" || intent === "flightStrike";
  return movementArt ? Math.max(0, Number(activeWeatherPersistent(state)?.movementArtRangeBonus) || 0) : 0;
}

export function getWeatherCritDamageBonus(state) {
  return Math.max(0, Number(activeWeatherPersistent(state)?.critDamageBonus) || 0);
}

export function getWeatherCritCreatesFire(state) {
  return activeWeatherPersistent(state)?.critCreatesFire ?? null;
}

export function getWeatherArtMpCostReduction(state) {
  const persistent = activeWeatherPersistent(state);
  return {
    reduction: Math.max(0, Number(persistent?.artMpCostReduction) || 0),
    minCost: Math.max(0, Number(persistent?.minArtMpCost) || 0)
  };
}

// --- Treant (Enchanted Roots + Deep Roots) ----------------------------------
// The active weather's per-weather block for a unit that carries a weatherAffinity
// passive (the Treant's Enchanted Roots), or null. Read off the board-wide weather so
// a mission weather cycle or a Mother Nature cast both drive it.
export function weatherAffinityBlock(unit, state) {
  const effect = getUnitType(unit.type).passive?.effect;
  if (effect?.type !== "weatherAffinity") return null;
  const weather = getActiveWeather(state);
  return weather ? effect.weathers?.[weather.id] ?? null : null;
}

// Enchanted Roots: the current weather's flat stat bonus (Snow +1 DEF, Fire +2 STR/−1
// DEF). Folded into getEffectiveStats. {} when there is no weather or no matching block.
export function weatherAffinityStats(unit, state) {
  return weatherAffinityBlock(unit, state)?.stats ?? {};
}

// Enchanted Roots (Thunderstorm): +1 magic damage the Treant DEALS while a storm holds.
// Read attacker-side by finalizeMagicDamage (rules/combat.js).
export function getWeatherAffinityMagicBonus(attacker, state) {
  return Math.max(0, Number(weatherAffinityBlock(attacker, state)?.magicDamage) || 0);
}

// Enchanted Roots (Rain): the HP/MP a weather-attuned unit restores each full turn cycle.
// Ticked by turnEngine.js. { hp, mp } (zeros when the weather has no regen).
export function getWeatherAffinityRestore(unit, state) {
  const restore = weatherAffinityBlock(unit, state)?.restorePerTurn ?? {};
  return { hp: Math.max(0, Number(restore.hp) || 0), mp: Math.max(0, Number(restore.mp) || 0) };
}

// Passive weather restore: any passive source can declare `weatherRestore` keyed by
// active weather id. Ticked once per full turn cycle by turnEngine.js. Used by
// Gargoyle's One With The Flames during Heatwave.
export function getWeatherPassiveRestore(unit, state) {
  const weatherId = getActiveWeather(state)?.id ?? null;
  if (!weatherId) return { hp: 0, mp: 0 };
  const definition = getUnitType(unit.type);
  let hp = 0;
  let mp = 0;
  for (const source of allPassiveSources(definition)) {
    if (source.kind && source.kind !== "passive") continue;
    if ((source === definition.ragePassive || source === definition.rageArt) && !isRaging(unit)) continue;
    const restore = source.effect?.weatherRestore?.[weatherId] ?? null;
    if (!restore) continue;
    hp += Math.max(0, Number(restore.hp) || 0);
    mp += Math.max(0, Number(restore.mp) || 0);
  }
  return { hp, mp };
}

// Deep Roots (positionalDefense): +DEF while every living enemy sits inside the unit's
// BASE attack range, +DEF while every OTHER living ally does (a "keep the squad close"
// reward, so a lone unit with no team earns nothing from the ally half). Uses base
// attackRange to stay non-recursive inside getEffectiveStats. {} when no set qualifies.
