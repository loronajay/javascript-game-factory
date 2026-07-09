import { areEnemies, cloneState, findUnit, livingUnits, unitAt } from "./state.js";
import { getEffectiveStats, getUnitType, sustainsVictory, takesTurns } from "./unitCatalog.js";
import { drawValue } from "./rng.js";
import { isStunned } from "../rules/statuses.js";
import { isFireDamageImmune } from "../rules/combat.js";
import { chebyshevDistance } from "../rules/movement.js";
import { getGlobalTrueTick } from "../rules/stances.js";

export const TEMPO_GAUGE_MAX = 1000;
export const TEMPO_BASE_READY_MS = 7000;
export const TEMPO_BASE_AGILITY = 5;
export const TEMPO_STATUS_TURN_MS = 6000;
export const TEMPO_POISON_TICK_MS = 4000;
export const TEMPO_FIELD_PULSE_MS = 4000;

const DEFAULT_AGILITY = 5;

export function isTempoBattle(state) {
  return Boolean(state?.tempo?.enabled);
}

export function getUnitAgility(unitOrType) {
  const type = typeof unitOrType === "string" ? unitOrType : unitOrType?.type;
  if (!type) return DEFAULT_AGILITY;
  const value = getUnitType(type).tempo?.agility;
  return Number.isFinite(value) ? value : DEFAULT_AGILITY;
}

export function tempoReadyMs(unitOrType) {
  const agility = Math.max(1, getUnitAgility(unitOrType));
  return TEMPO_BASE_READY_MS * (TEMPO_BASE_AGILITY / agility);
}

export function getTempoReadiness(state, unitId) {
  return Math.max(0, Math.min(TEMPO_GAUGE_MAX, Number(state?.tempo?.readiness?.[unitId]) || 0));
}

export function isTempoUnitReady(state, unitOrId) {
  const unit = typeof unitOrId === "string" ? findUnit(state, unitOrId) : unitOrId;
  return Boolean(unit && unit.hp > 0 && takesTurns(unit) && getTempoReadiness(state, unit.id) >= TEMPO_GAUGE_MAX);
}

export function canBeginTempoActivation(state, unitOrId) {
  if (!isTempoBattle(state) || state.activation) return false;
  const unit = typeof unitOrId === "string" ? findUnit(state, unitOrId) : unitOrId;
  return Boolean(unit && isTempoUnitEligible(unit) && !isStunned(unit) && isTempoUnitReady(state, unit));
}

export function enableTempoBattle(state, options = {}) {
  const next = cloneState(state);
  const readiness = {};
  for (const unit of next.units) {
    readiness[unit.id] = Math.max(0, Math.min(TEMPO_GAUGE_MAX, Number(options.readiness?.[unit.id]) || 0));
    if (!isTempoUnitEligible(unit)) unit.spent = true;
    else unit.spent = readiness[unit.id] < TEMPO_GAUGE_MAX;
    unit.statuses = (unit.statuses ?? []).map(normalizeTempoStatus);
  }
  next.currentPlayer = null;
  next.turnNumber = 0;
  next.activation = null;
  next.tempo = {
    enabled: true,
    elapsedMs: 0,
    readiness,
    pulseElapsedMs: 0
  };
  return next;
}

export function normalizeTempoStatus(status) {
  if (!status || typeof status !== "object") return status;
  if (status.duration === "permanent") {
    return { ...status, tickElapsedMs: Number(status.tickElapsedMs) || 0 };
  }
  if (status.duration === "timer") {
    const remainingMs = Math.max(0, Number(status.remainingMs) || 0);
    const totalMs = Math.max(remainingMs, Number(status.totalMs) || remainingMs);
    return { ...status, remainingMs, totalMs };
  }
  const turns = Math.max(0, Number(status.duration));
  if (!Number.isFinite(turns) || turns <= 0) return { ...status };
  const ms = turns * TEMPO_STATUS_TURN_MS;
  return {
    ...status,
    duration: "timer",
    durationTurns: turns,
    remainingMs: ms,
    totalMs: ms
  };
}

export function prepareTempoStateForCommand(state, command) {
  if (!isTempoBattle(state)) return state;
  const next = cloneState(state);
  next.tempo = cloneTempoMeta(state.tempo);
  const unitId = command.unitId ?? command.actorId;
  const unit = unitId ? findUnit(next, unitId) : null;
  if (unit) next.currentPlayer = unit.player;
  for (const member of next.units) {
    member.spent = !isTempoUnitReady(next, member);
  }
  return next;
}

export function normalizeTempoStateAfterCommand(state) {
  if (!isTempoBattle(state)) return state;
  state.tempo = cloneTempoMeta(state.tempo);
  for (const unit of state.units) {
    unit.statuses = (unit.statuses ?? []).map(normalizeTempoStatus);
    if (state.activation?.unitId === unit.id) unit.spent = false;
    else unit.spent = !isTempoUnitReady(state, unit);
  }
  return state;
}

export function finishTempoActivation(state, unit) {
  state.tempo = cloneTempoMeta(state.tempo);
  state.tempo.readiness[unit.id] = 0;
  unit.spent = true;
  unit.statuses = (unit.statuses ?? []).map(normalizeTempoStatus);
  state.activation = null;
  state.currentPlayer = null;
}

export function advanceTempoBattle(state, deltaMs) {
  if (!isTempoBattle(state) || state.phase !== "playing") return { state, events: [] };
  const ms = Math.max(0, Number(deltaMs) || 0);
  if (ms <= 0) return { state, events: [] };

  const next = cloneState(state);
  next.tempo = cloneTempoMeta(state.tempo);
  next.tempo.elapsedMs += ms;

  const events = [];
  for (const unit of next.units) {
    if (!isTempoUnitEligible(unit)) {
      next.tempo.readiness[unit.id] = 0;
      unit.spent = true;
      continue;
    }
    unit.statuses = advanceTempoStatuses(unit, ms, events);
    if (!canFillReadiness(unit, next)) {
      unit.spent = !isTempoUnitReady(next, unit);
      continue;
    }
    const before = getTempoReadiness(next, unit.id);
    if (before >= TEMPO_GAUGE_MAX) {
      unit.spent = false;
      continue;
    }
    const gained = (TEMPO_GAUGE_MAX / tempoReadyMs(unit)) * ms;
    const after = Math.min(TEMPO_GAUGE_MAX, before + gained);
    next.tempo.readiness[unit.id] = after;
    unit.spent = after < TEMPO_GAUGE_MAX;
    if (before < TEMPO_GAUGE_MAX && after >= TEMPO_GAUGE_MAX) {
      events.push({ type: "TEMPO_UNIT_READY", unitId: unit.id, player: unit.player, agility: getUnitAgility(unit) });
    }
  }

  next.tempo.pulseElapsedMs = Math.max(0, Number(next.tempo.pulseElapsedMs) || 0) + ms;
  while (next.tempo.pulseElapsedMs >= TEMPO_FIELD_PULSE_MS && next.phase === "playing") {
    next.tempo.pulseElapsedMs -= TEMPO_FIELD_PULSE_MS;
    applyTempoFieldPulse(next, events);
    resolveTempoVictory(next);
  }

  resolveTempoVictory(next);
  return { state: next, events };
}

function resolveTempoVictory(state) {
  const livingTeams = new Set(livingUnits(state).filter(sustainsVictory).map((unit) => unit.team ?? unit.player));
  if (livingTeams.size === 1) {
    state.winner = [...livingTeams][0];
    state.phase = "complete";
    state.activation = null;
  }
}

function cloneTempoMeta(meta = {}) {
  return {
    ...meta,
    readiness: { ...(meta.readiness ?? {}) }
  };
}

function isTempoUnitEligible(unit) {
  return Boolean(unit && unit.hp > 0 && takesTurns(unit));
}

function canFillReadiness(unit, state) {
  return unit.hp > 0 && takesTurns(unit) && state.activation?.unitId !== unit.id && !isStunned(unit);
}

function advanceTempoStatuses(unit, deltaMs, events) {
  const statuses = [];
  for (const raw of unit.statuses ?? []) {
    const status = normalizeTempoStatus(raw);
    if (status.duration === "permanent") {
      statuses.push(advancePermanentStatus(unit, status, deltaMs, events));
      continue;
    }
    if (status.duration === "timer") {
      const remainingMs = Math.max(0, Number(status.remainingMs) - deltaMs);
      if (remainingMs > 0) {
        statuses.push({ ...status, remainingMs });
      } else {
        events.push({ type: "STATUS_EXPIRED", unitId: unit.id, status: status.type });
      }
      continue;
    }
    statuses.push(status);
  }
  return statuses;
}

function advancePermanentStatus(unit, status, deltaMs, events) {
  if (status.type !== "poison") return status;
  let tickElapsedMs = Math.max(0, Number(status.tickElapsedMs) || 0) + deltaMs;
  const damage = Math.max(0, Number(status.turnStartDamage ?? 1) || 0);
  while (tickElapsedMs >= TEMPO_POISON_TICK_MS && unit.hp > 0 && damage > 0) {
    tickElapsedMs -= TEMPO_POISON_TICK_MS;
    const appliedDamage = Math.min(unit.hp, damage);
    unit.hp -= appliedDamage;
    events.push({ type: "STATUS_DAMAGE", unitId: unit.id, status: status.type, damage: appliedDamage });
  }
  return { ...status, tickElapsedMs };
}

function applyTempoFieldPulse(state, events) {
  applyTempoFirePulse(state, events);
  applyTempoBlackDeathPulse(state, events);
  applyTempoTimeStealPulse(state, events);
  applyTempoAutoStrikePulse(state, events);
}

function applyTempoFirePulse(state, events) {
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const occupant = unitAt(state, { x, y });
    if (occupant && !isFireDamageImmune(occupant)) {
      const dealt = Math.min(occupant.hp, 1);
      occupant.hp = Math.max(0, occupant.hp - 1);
      if (dealt > 0) events.push({ type: "FIRE_DAMAGE", unitId: occupant.id, position: { x, y }, damage: dealt });
    }
    if (obj.permanent) continue;
    obj.turnsLeft -= 1;
    if (obj.turnsLeft <= 0) delete state.tileObjects[key];
  }
}

function applyTempoBlackDeathPulse(state, events) {
  const amount = getGlobalTrueTick(state);
  if (amount <= 0) return;
  for (const unit of livingUnits(state)) {
    const dealt = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (dealt > 0) events.push({ type: "BLACK_DEATH_DAMAGE", unitId: unit.id, damage: dealt });
  }
}

function applyTempoTimeStealPulse(state, events) {
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
      target.hp = Math.max(0, target.hp - amount);
      totalDealt += dealt;
      events.push({ type: "TIME_STEAL", sourceId: source.id, targetId: target.id, position: { ...target.position }, damage: dealt });
    }
    if (totalDealt > 0 && effect.refundMpPerDamage) {
      const before = source.mp;
      source.mp = Math.min(getEffectiveStats(source, state).maxMp, source.mp + totalDealt * effect.refundMpPerDamage);
      const gained = source.mp - before;
      if (gained > 0) events.push({ type: "TIME_STEAL_MP", sourceId: source.id, mpGained: gained });
    }
  }
}

function applyTempoAutoStrikePulse(state, events) {
  for (const source of livingUnits(state)) {
    const definition = getUnitType(source.type);
    for (const passive of [definition.passive, ...definition.arts].filter(Boolean)) {
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
      target.hp = Math.max(0, target.hp - dealt);
      events.push({
        type: "AUTO_STRIKE",
        sourceId: source.id,
        targetId: target.id,
        position: { ...target.position },
        damage: dealt
      });
    }
  }
}
