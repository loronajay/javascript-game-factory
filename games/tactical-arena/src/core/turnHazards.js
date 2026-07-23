// End-of-turn rollover hazards, extracted from the turn engine: fire-tile ticks,
// mission random-fire, the weather cycle, Black Death, auto-strikes (Ghoul bites),
// and Father Time's time steal. Each is an independent pulse fired by
// advanceTurnIfExhausted at every rollover; all deterministic off the seeded RNG.

import { getUnitType } from "./unitCatalog.js";
import { areEnemies, livingUnits, unitAt } from "./state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { getFireVulnerability, isFireDamageImmune } from "../rules/combat.js";
import { getGlobalTrueTick } from "../rules/stances.js";
import { isInvulnerable } from "../rules/statuses.js";
import { drawValue } from "./rng.js";
import { CAUSE, creditDeaths, snapshotAlive } from "./killAttribution.js";

import { restoreMp } from "./combatEffects.js";
const FIRE_DAMAGE = 1;

// Throw Cigar fire: at every turn rollover, any unit (friend OR foe) standing on a
// fire tile takes 1 TRUE damage. The fire then counts down and is removed once its
// turns run out.
export function applyFireTick(state, events) {
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const occupant = unitAt(state, { x, y });
    if (occupant && !isFireDamageImmune(occupant) && !isInvulnerable(occupant)) {
      // Enchanted Roots (Treant): +fireVulnerability extra damage from a fire-tile tick.
      const amount = FIRE_DAMAGE + getFireVulnerability(occupant);
      const dealt = Math.min(occupant.hp, amount);
      // Each tile burns in its own credit scope so a death here is attributed to the
      // unit that lit THIS tile, not to whoever happens to be acting. Authored mission
      // fire has no owner and falls through as environmental.
      const aliveBefore = snapshotAlive(state);
      occupant.hp = Math.max(0, occupant.hp - amount);
      if (dealt > 0) events.push({ type: "FIRE_DAMAGE", unitId: occupant.id, position: { x, y }, damage: dealt });
      creditDeaths(state, aliveBefore, events, {
        killerId: obj.ownerId ?? null,
        cause: obj.ownerId ? CAUSE.FIRE : CAUSE.ENVIRONMENT,
      });
    }
    if (obj.permanent) continue;
    obj.turnsLeft -= 1;
    if (obj.turnsLeft <= 0) delete state.tileObjects[key];
  }
}

export function applyRandomFireTick(state, events) {
  const rule = state.missionRules?.randomFire;
  if (!rule) return;
  const source = rule.sourceId ? state.units.find((unit) => unit.id === rule.sourceId) : null;
  if (rule.sourceId && (!source || source.hp <= 0)) return;
  const candidates = [];
  for (let y = 0; y < state.size; y += 1) {
    for (let x = 0; x < state.size; x += 1) {
      const position = { x, y };
      if (state.tileObjects?.[`${x},${y}`]) continue;
      if (unitAt(state, position)) continue;
      candidates.push(position);
    }
  }
  if (!candidates.length) return;
  const draw = drawValue(state.rngState);
  state.rngState = draw.rngState;
  const position = candidates[Math.min(candidates.length - 1, Math.floor(draw.value * candidates.length))];
  const key = `${position.x},${position.y}`;
  // Mission random fire is credited to the mission's declared source when it has one
  // (a boss lighting the arena), and is otherwise environmental.
  state.tileObjects[key] = {
    kind: "fire",
    turnsLeft: Math.max(1, Math.floor(Number(rule.turnsLeft) || 3)),
    ownerId: source?.id ?? null,
  };
  events.push({
    type: "RANDOM_FIRE_LIT",
    sourceId: source?.id ?? null,
    position: { ...position },
  });
}

export function applyWeatherCycleTick(state, events) {
  const rule = state.missionRules?.weatherCycle;
  const sequence = Array.isArray(rule?.sequence) ? rule.sequence.filter((id) => typeof id === "string" && id) : [];
  if (!sequence.length) return;
  const interval = Math.max(1, Math.floor(Number(rule.intervalTurns) || 1));
  // A weather "cycle" is one full round in which every player takes a turn — NOT a
  // single turn rollover. turnNumber counts rollovers, so fold it down by the number
  // of players before applying the interval, otherwise a 2-player duel would swap
  // weather twice as often as intended.
  const playerCount = Math.max(1, state.turnOrder?.length || 2);
  const cyclesElapsed = Math.floor((Math.max(1, Number(state.turnNumber) || 1) - 1) / playerCount);
  const index = Math.floor(cyclesElapsed / interval) % sequence.length;
  const weather = sequence[index];
  if (state.weather?.id === weather && (state.weather?.sourceId ?? null) === (rule.sourceId ?? null)) return;
  state.weather = { id: weather, sourceId: rule.sourceId ?? null };
  events.push({
    type: "MISSION_WEATHER_CHANGED",
    weather,
    sourceId: rule.sourceId ?? null,
  });
}

export function applyBlackDeathTick(state, events) {
  const amount = getGlobalTrueTick(state);
  if (amount <= 0) return;
  // Black Death is a board-wide clock that hits friend and foe alike — nobody's kill.
  const aliveBefore = snapshotAlive(state);
  for (const unit of livingUnits(state)) {
    const dealt = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (dealt > 0) events.push({ type: "BLACK_DEATH_DAMAGE", unitId: unit.id, damage: dealt });
  }
  creditDeaths(state, aliveBefore, events, { cause: CAUSE.ENVIRONMENT });
}

// Ghoul Bite (and any future unit sharing the `autoStrike` passive effect): at every
// turn rollover, a living source with the effect picks ONE random living enemy within
// `range` (Chebyshev) of it off the authoritative RNG and deals `damage` (true by
// default, so it bypasses DEF/Defend like Fire/Time Steal) — a real activation-free
// melee reflex rather than a costed ART.
function autoStrikeSources(definition) {
  return [definition.passive, ...definition.arts].filter(Boolean);
}

export function applyAutoStrikeTick(state, events) {
  for (const source of livingUnits(state)) {
    const definition = getUnitType(source.type);
    for (const passive of autoStrikeSources(definition)) {
      if (passive.kind && passive.kind !== "passive") continue;
      const effect = passive.effect;
      if (effect?.type !== "autoStrike") continue;
      const range = effect.range ?? 1;
      const targets = livingUnits(state).filter((target) =>
        areEnemies(source, target) && chebyshevDistance(source.position, target.position) <= range);
      if (!targets.length) continue;
      const pick = drawValue(state.rngState);
      state.rngState = pick.rngState;
      const target = targets[Math.min(targets.length - 1, Math.floor(pick.value * targets.length))];
      const amount = Math.max(0, Number(effect.damage) || 0);
      const dealt = Math.min(target.hp, amount);
      if (dealt <= 0) continue;
      const aliveBefore = snapshotAlive(state);
      target.hp = Math.max(0, target.hp - dealt);
      events.push({
        type: "AUTO_STRIKE",
        sourceId: source.id,
        targetId: target.id,
        position: { ...target.position },
        damage: dealt
      });
      creditDeaths(state, aliveBefore, events, { killerId: source.id, cause: CAUSE.UNIT });
    }
  }
}

export function applyTimeStealTick(state, events) {
  for (const source of livingUnits(state)) {
    const effect = getUnitType(source.type).passive?.effect;
    if (effect?.type !== "damageAura") continue;
    const radius = effect.radius ?? 2;
    const amount = effect.amount ?? 1;
    let totalDealt = 0;
    for (const target of livingUnits(state)) {
      if (!areEnemies(source, target)) continue;
      if (chebyshevDistance(source.position, target.position) > radius) continue;
      const dealt = Math.min(target.hp, amount);
      if (dealt <= 0) continue;
      const aliveBefore = snapshotAlive(state);
      target.hp = Math.max(0, target.hp - amount);
      totalDealt += dealt;
      events.push({ type: "TIME_STEAL", sourceId: source.id, targetId: target.id, position: { ...target.position }, damage: dealt });
      creditDeaths(state, aliveBefore, events, { killerId: source.id, cause: CAUSE.UNIT });
    }
    if (totalDealt > 0 && effect.refundMpPerDamage) {
      const restored = restoreMp(state, source, source, totalDealt * effect.refundMpPerDamage);
      if (restored.mpRestored > 0 || restored.hpRestored > 0) {
        events.push({ type: "TIME_STEAL_MP", sourceId: source.id, mpGained: restored.mpRestored, hpRestored: restored.hpRestored });
      }
    }
  }
}

