import { getEffectiveStats, getUnitType, sustainsVictory, takesTurns } from "./unitCatalog.js";
import { areEnemies, livingUnits, teamOfUnit, unitAt } from "./state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { isFireDamageImmune } from "../rules/combat.js";
import { getGlobalTrueTick } from "../rules/stances.js";
import { isStunned, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";
import { drawValue } from "./rng.js";
import { finishTempoActivation, isTempoBattle } from "./tempoBattle.js";

const MAX_STUN_FAST_FORWARD_ROLLOVERS = 32;
const FIRE_DAMAGE = 1;

export function spendAndAdvance(state, unit) {
  if (isTempoBattle(state)) {
    finishTempoActivation(state, unit);
    return;
  }
  unit.statuses = tickStatuses(unit.statuses);
  unit.spent = true;

  const spellUsed = state.activation?.spellUsed ?? false;
  const realmTraversalActive = state.activation?.unitId === unit.id && state.activation?.realmTraversalActive;
  const passive = getUnitType(unit.type)?.passive;
  if (passive?.effect?.type === "mpRegen") {
    if (spellUsed) {
      unit.mageChargeCount = 0;
    } else {
      unit.mageChargeCount = (unit.mageChargeCount ?? 0) + 1;
      if (unit.mageChargeCount >= passive.effect.interval) {
        const maxMp = getEffectiveStats(unit, state).maxMp;
        unit.mp = Math.min(maxMp, unit.mp + passive.effect.amount);
        unit.mageChargeCount = 0;
      }
    }
  }

  if (realmTraversalActive) unit.realmTraversalLocked = false;
  state.activation = null;
  advanceTurnIfExhausted(state);
}

function appendPendingRolloverEvents(state, events) {
  if (!events.length) return;
  state.pendingRolloverEvents = [...(state.pendingRolloverEvents ?? []), ...events];
}

function autoSpendStunnedUnits(state, player) {
  const events = [];
  for (const member of livingUnits(state, player)) {
    if (!takesTurns(member) || member.spent || !isStunned(member)) continue;

    member.defending = false;
    member.statuses = tickStatuses(member.statuses);
    member.spent = true;
    events.push({ type: "UNIT_STUNNED", unitId: member.id });
  }
  if (events.length) resolveVictory(state);
  return events;
}

function applySquadTurnChargeStatuses(state, player) {
  const events = [];
  for (const member of livingUnits(state, player)) {
    events.push(...resolveTurnStartStatuses(member));
  }
  if (events.length) resolveVictory(state);
  return events;
}

function releaseStunLoopGuard(state) {
  const unitIds = [];
  for (const member of livingUnits(state, state.currentPlayer)) {
    if (!takesTurns(member)) continue;
    member.statuses = (member.statuses ?? []).filter((status) => status.type !== "stun");
    member.spent = false;
    unitIds.push(member.id);
  }
  if (unitIds.length) {
    appendPendingRolloverEvents(state, [{
      type: "STUN_LOOP_GUARD",
      player: state.currentPlayer,
      unitIds
    }]);
  }
}

function playerHasLivingTurnUnits(state, player) {
  return livingUnits(state, player).some(takesTurns);
}

export function nextActivePlayer(state, fromPlayer) {
  const order = state.turnOrder?.length ? state.turnOrder : [1, 2];
  const start = Math.max(0, order.indexOf(fromPlayer));
  for (let step = 1; step <= order.length; step += 1) {
    const player = order[(start + step) % order.length];
    if (playerHasLivingTurnUnits(state, player)) return player;
  }
  return fromPlayer;
}

// Pass the turn to the other player once the current one has no unspent living
// commander left. Summons never take turns, so they neither keep the turn open nor
// get their spent flag reset.
function advanceTurnIfExhausted(state) {
  if (state.phase !== "playing") return;
  let rollovers = 0;
  while (
    state.phase === "playing" &&
    !livingUnits(state, state.currentPlayer).some((member) => takesTurns(member) && !member.spent)
  ) {
    if (rollovers >= MAX_STUN_FAST_FORWARD_ROLLOVERS) {
      releaseStunLoopGuard(state);
      break;
    }
    state.currentPlayer = nextActivePlayer(state, state.currentPlayer);
    state.turnNumber += 1;
    rollovers += 1;
    for (const member of livingUnits(state, state.currentPlayer)) if (takesTurns(member)) member.spent = false;
    appendPendingRolloverEvents(state, applySquadTurnChargeStatuses(state, state.currentPlayer));
    const fireEvents = [];
    applyFireTick(state, fireEvents);
    applyBlackDeathTick(state, fireEvents);
    applyTimeStealTick(state, fireEvents);
    applyAutoStrikeTick(state, fireEvents);
    resolveVictory(state);
    appendPendingRolloverEvents(state, fireEvents);
    appendPendingRolloverEvents(state, autoSpendStunnedUnits(state, state.currentPlayer));
  }
}

// Throw Cigar fire: at every turn rollover, any unit (friend OR foe) standing on a
// fire tile takes 1 TRUE damage. The fire then counts down and is removed once its
// turns run out.
function applyFireTick(state, events) {
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const occupant = unitAt(state, { x, y });
    if (occupant && !isFireDamageImmune(occupant)) {
      const dealt = Math.min(occupant.hp, FIRE_DAMAGE);
      occupant.hp = Math.max(0, occupant.hp - FIRE_DAMAGE);
      if (dealt > 0) events.push({ type: "FIRE_DAMAGE", unitId: occupant.id, position: { x, y }, damage: dealt });
    }
    if (obj.permanent) continue;
    obj.turnsLeft -= 1;
    if (obj.turnsLeft <= 0) delete state.tileObjects[key];
  }
}

function applyBlackDeathTick(state, events) {
  const amount = getGlobalTrueTick(state);
  if (amount <= 0) return;
  for (const unit of livingUnits(state)) {
    const dealt = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (dealt > 0) events.push({ type: "BLACK_DEATH_DAMAGE", unitId: unit.id, damage: dealt });
  }
}

// Ghoul Bite (and any future unit sharing the `autoStrike` passive effect): at every
// turn rollover, a living source with the effect picks ONE random living enemy within
// `range` (Chebyshev) of it off the authoritative RNG and deals `damage` (true by
// default, so it bypasses DEF/Defend like Fire/Time Steal) — a real activation-free
// melee reflex rather than a costed ART.
function autoStrikeSources(definition) {
  return [definition.passive, ...definition.arts].filter(Boolean);
}

function applyAutoStrikeTick(state, events) {
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

function applyTimeStealTick(state, events) {
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

export function resolveVictory(state) {
  const monkTrial = state.missionRules?.monkTrial;
  if (monkTrial?.realMonkId) {
    const playerAlive = livingUnits(state, 1).some(sustainsVictory);
    if (!playerAlive) {
      state.winner = 2;
      state.phase = "complete";
      state.activation = null;
      return;
    }
    const realMonk = state.units.find((unit) => unit.id === monkTrial.realMonkId);
    if (realMonk && realMonk.hp <= 0) {
      for (const unit of state.units) {
        if (unit.trialFakeMonk && unit.hp > 0) unit.hp = 0;
      }
      state.winner = 1;
      state.phase = "complete";
      state.activation = null;
      return;
    }
  }
  // Defeat is decided by living units that can actually win, not raw bodies: a player
  // whose only survivor is a turn-less summon or non-combatant commander has lost.
  const livingTeams = new Set(livingUnits(state).filter(sustainsVictory).map(teamOfUnit));
  if (livingTeams.size === 1) {
    state.winner = [...livingTeams][0];
    state.phase = "complete";
    state.activation = null;
  }
}
