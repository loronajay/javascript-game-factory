// The single authoritative reducer. Every mode submits commands here.
//
// Contract:
//   applyCommand(state, command)
//     -> { accepted: true, nextState, events }
//     -> { accepted: false, errorCode }
//
// Guarantees:
//   * Pure: the input `state` is never mutated. Work happens on a clone.
//   * Atomic: a rejected command produces no partial state change.
//   * Deterministic: dice come from the seeded RNG carried in state, so the
//     same initial state plus the same accepted command sequence always yields
//     the same final state and the same recorded rolls.
//
// The reducer reuses the prototype's pure rule modules (movement, combat,
// turns) so the encoded rules stay identical to the shipped game.

import { tileKey, chebyshevDistance } from "../geometry/isometric.js";
import { UNIT_TYPES, MEDIC_HEAL_RANGE } from "../config.js";
import { getLegalMoves } from "../rules/movement.js";
import {
  getLegalAttackTargets,
  getLegalHealTargets,
  isRangerShotBlocked,
  resolveAttackRoll,
  resolveHealRoll,
} from "../rules/combat.js";
import {
  determineWinner,
  playerHasUnspentUnits,
  preparePlayerTurn,
} from "../rules/turns.js";
import { unitAt } from "../state/gameState.js";
import { cloneState, findUnit } from "./state.js";
import { rollD6 } from "./rng.js";
import { COMMANDS } from "./commands.js";
import { EVENTS, VICTORY_REASON } from "./events.js";
import { ERR } from "./errors.js";

function reject(errorCode) {
  return { accepted: false, errorCode };
}

function accept(nextState, events) {
  nextState.revision += 1;
  return { accepted: true, nextState, events };
}

export function applyCommand(state, command) {
  if (!command || typeof command.type !== "string") {
    return reject(ERR.INVALID_COMMAND);
  }

  // Concede is the only command meaningful once the match is over, and even
  // then it is a no-op rejection: the result is already locked in.
  if (state.phase === "complete") {
    return reject(ERR.MATCH_COMPLETE);
  }

  switch (command.type) {
    case COMMANDS.BEGIN_ACTIVATION:
      return beginActivation(state, command);
    case COMMANDS.MOVE_UNIT:
      return moveUnit(state, command);
    case COMMANDS.CANCEL_MOVE:
      return cancelMove(state, command);
    case COMMANDS.ATTACK:
      return attack(state, command);
    case COMMANDS.HEAL:
      return heal(state, command);
    case COMMANDS.DEFEND:
      return defend(state, command);
    case COMMANDS.FINISH_ACTIVATION:
      return finishActivation(state, command);
    case COMMANDS.CONCEDE:
      return concede(state, command);
    default:
      return reject(ERR.UNKNOWN_COMMAND);
  }
}

function beginActivation(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }

  const unit = findUnit(state, command.unitId);
  if (!unit) return reject(ERR.UNIT_NOT_FOUND);
  if (unit.player !== command.player) return reject(ERR.UNIT_NOT_OWNED);
  if (unit.hp <= 0) return reject(ERR.UNIT_DEAD);
  if (unit.spent) return reject(ERR.UNIT_SPENT);

  // Re-affirming the unit already being activated is a harmless no-op.
  if (state.activation && state.activation.unitId === command.unitId) {
    return accept(cloneState(state), []);
  }

  // Switching units is only allowed before the open activation commits to
  // anything. Once a unit has moved or acted, it must finish first.
  if (
    state.activation &&
    (state.activation.moved || state.activation.primaryUsed)
  ) {
    return reject(ERR.ACTIVATION_ALREADY_OPEN);
  }

  const next = cloneState(state);
  const nextUnit = findUnit(next, command.unitId);

  // Defense expires when a unit is selected to begin its next activation.
  nextUnit.defending = false;
  next.activation = {
    unitId: nextUnit.id,
    origin: { x: nextUnit.x, y: nextUnit.y },
    moved: false,
    primaryUsed: false,
  };

  return accept(next, [
    {
      type: EVENTS.ACTIVATION_BEGAN,
      unitId: nextUnit.id,
      origin: { x: nextUnit.x, y: nextUnit.y },
    },
  ]);
}

function moveUnit(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.unitId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  if (state.activation.moved) return reject(ERR.MOVE_ALREADY_USED);

  const unit = findUnit(state, command.unitId);
  if (!unit || unit.hp <= 0) return reject(ERR.UNIT_DEAD);

  const { x, y } = command;

  // Distinguish "you can't reach there" from "something is in the way" for a
  // clearer rejection. getLegalMoves already excludes both, so this is only
  // about which code to return.
  if (unitAt(state, x, y)) {
    return reject(ERR.MOVE_BLOCKED);
  }
  if (!getLegalMoves(state, unit).has(tileKey(x, y))) {
    return reject(ERR.MOVE_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const nextUnit = findUnit(next, command.unitId);
  const from = { x: nextUnit.x, y: nextUnit.y };

  nextUnit.x = x;
  nextUnit.y = y;
  next.activation.moved = true;

  return accept(next, [
    { type: EVENTS.UNIT_MOVED, unitId: nextUnit.id, from, to: { x, y } },
  ]);
}

function cancelMove(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.unitId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  // Cancel is a narrow undo of an uncommitted move only.
  if (!state.activation.moved) return reject(ERR.CANCEL_NOT_AVAILABLE);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const next = cloneState(state);
  const nextUnit = findUnit(next, command.unitId);
  const restoredTo = { ...next.activation.origin };

  nextUnit.x = restoredTo.x;
  nextUnit.y = restoredTo.y;
  next.activation.moved = false;

  return accept(next, [
    { type: EVENTS.MOVE_CANCELLED, unitId: nextUnit.id, restoredTo },
  ]);
}

function attack(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.actorId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const actor = findUnit(state, command.actorId);
  const target = findUnit(state, command.targetId);
  if (!actor || actor.hp <= 0) return reject(ERR.UNIT_DEAD);
  if (!target || target.hp <= 0) return reject(ERR.INVALID_TARGET);

  const rejection = validateAttackTarget(state, actor, target);
  if (rejection) return reject(rejection);

  const { roll, rngState } = rollD6(state.rngState);
  const result = resolveAttackRoll(actor, target, roll);

  const next = cloneState(state);
  next.rngState = rngState;
  const nextTarget = findUnit(next, command.targetId);

  if (result.hit) {
    nextTarget.hp = Math.max(0, nextTarget.hp - result.damage);
  }
  next.activation.primaryUsed = true;

  const events = [
    {
      type: EVENTS.ATTACK_RESOLVED,
      actorId: actor.id,
      targetId: target.id,
      roll,
      hit: result.hit,
      critical: result.critical,
      damage: result.damage,
      defended: target.defending,
      targetHpAfter: nextTarget.hp,
    },
  ];

  if (nextTarget.hp <= 0) {
    events.push({ type: EVENTS.UNIT_ELIMINATED, unitId: nextTarget.id });
    applyMatchEndIfDecided(next, events);
  }

  return accept(next, events);
}

function heal(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.actorId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const actor = findUnit(state, command.actorId);
  const target = findUnit(state, command.targetId);
  if (!actor || actor.hp <= 0) return reject(ERR.UNIT_DEAD);
  if (!target || target.hp <= 0) return reject(ERR.INVALID_TARGET);

  const rejection = validateHealTarget(state, actor, target);
  if (rejection) return reject(rejection);

  const { roll, rngState } = rollD6(state.rngState);
  const result = resolveHealRoll(target, roll);

  const next = cloneState(state);
  next.rngState = rngState;
  const nextTarget = findUnit(next, command.targetId);

  if (result.hit) {
    nextTarget.hp = Math.min(nextTarget.maxHp, nextTarget.hp + result.healing);
  }
  next.activation.primaryUsed = true;

  return accept(next, [
    {
      type: EVENTS.HEAL_RESOLVED,
      actorId: actor.id,
      targetId: target.id,
      roll,
      hit: result.hit,
      critical: result.critical,
      healing: result.healing,
      targetHpAfter: nextTarget.hp,
    },
  ]);
}

function defend(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.unitId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const next = cloneState(state);
  const nextUnit = findUnit(next, command.unitId);

  nextUnit.defending = true;
  next.activation.primaryUsed = true;

  return accept(next, [{ type: EVENTS.UNIT_DEFENDED, unitId: nextUnit.id }]);
}

function finishActivation(state, command) {
  if (command.player !== state.currentPlayer) {
    return reject(ERR.NOT_ACTIVE_PLAYER);
  }
  if (!state.activation) return reject(ERR.NO_ACTIVATION);
  if (state.activation.unitId !== command.unitId) {
    return reject(ERR.WRONG_ACTIVE_UNIT);
  }
  // A unit cannot complete an activation by moving alone.
  if (!state.activation.primaryUsed) return reject(ERR.FINISH_REQUIRES_ACTION);

  const next = cloneState(state);
  const nextUnit = findUnit(next, command.unitId);

  nextUnit.spent = true;
  next.activation = null;

  const events = [{ type: EVENTS.ACTIVATION_FINISHED, unitId: nextUnit.id }];

  if (!playerHasUnspentUnits(next, next.currentPlayer)) {
    next.currentPlayer = next.currentPlayer === 1 ? 2 : 1;
    next.turnNumber += 1;
    // Reset the incoming squad so each living unit can activate again.
    preparePlayerTurn(next, next.currentPlayer);
    events.push({
      type: EVENTS.TURN_CHANGED,
      player: next.currentPlayer,
      turnNumber: next.turnNumber,
    });
  }

  return accept(next, events);
}

function concede(state, command) {
  // Concede is legal on either side's turn — a player may resign at any time.
  if (command.player !== 1 && command.player !== 2) {
    return reject(ERR.INVALID_COMMAND);
  }

  const next = cloneState(state);
  next.phase = "complete";
  next.winner = command.player === 1 ? 2 : 1;
  next.victoryReason = VICTORY_REASON.CONCEDE;
  next.activation = null;

  return accept(next, [
    {
      type: EVENTS.MATCH_COMPLETE,
      winner: next.winner,
      victoryReason: next.victoryReason,
    },
  ]);
}

// Shared target validation. Returns an error code, or null when legal. Splitting
// the failure reason out of getLegalAttackTargets keeps the legal-tile helper
// reusable while still giving the caller a precise rejection.
function validateAttackTarget(state, actor, target) {
  if (target.player === actor.player) return ERR.INVALID_TARGET;

  const range = UNIT_TYPES[actor.type].attackRange;
  if (chebyshevDistance(actor, target) > range) return ERR.TARGET_OUT_OF_RANGE;
  if (actor.type === "ranger" && isRangerShotBlocked(state, actor, target)) {
    return ERR.TARGET_BLOCKED;
  }

  // Final authority is the legal-target set, so any divergence is caught.
  if (!getLegalAttackTargets(state, actor).has(tileKey(target.x, target.y))) {
    return ERR.INVALID_TARGET;
  }
  return null;
}

function validateHealTarget(state, actor, target) {
  if (actor.type !== "medic") return ERR.INVALID_TARGET;
  if (target.player !== actor.player) return ERR.INVALID_TARGET;
  if (target.hp >= target.maxHp) return ERR.INVALID_TARGET;

  if (chebyshevDistance(actor, target) > MEDIC_HEAL_RANGE) {
    return ERR.TARGET_OUT_OF_RANGE;
  }
  if (!getLegalHealTargets(state, actor).has(tileKey(target.x, target.y))) {
    return ERR.INVALID_TARGET;
  }
  return null;
}

function applyMatchEndIfDecided(next, events) {
  const winner = determineWinner(next);
  if (!winner) return;

  next.phase = "complete";
  next.winner = winner;
  next.victoryReason = VICTORY_REASON.SQUAD_ELIMINATED;
  next.activation = null;
  events.push({
    type: EVENTS.MATCH_COMPLETE,
    winner,
    victoryReason: next.victoryReason,
  });
}
