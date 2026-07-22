// Shared tutorial runtime helpers: the setStage update builder, allow/block
// results, and the scripted-CPU targeting/pathing predicates. Used by both the
// validation/recording engine and the scripted CPU.

import { beginActivation, defend, finishActivation } from "../core/commands.js";
import { areEnemies, findUnit, livingUnits } from "../core/state.js";
import { getEffectiveStats, takesTurns } from "../core/unitCatalog.js";
import { chebyshevDistance as chebyshev, getLegalMoves, positionKey } from "../rules/movement.js";
import { isShotBlocked, isWallBetween } from "../rules/combat.js";

import { PLAYER_ARCHER_ID, DAMAGE_TYPES_FOOTWORK_PATH } from "./tutorialContent.js";

export function setStage(tutorial, stage, { prompt, dialogue = null, completed = false, spotlight = null, selectUnitId = null, beforeDialogueAction = null, afterDialogueAction = null, revertVictory = false } = {}) {
  tutorial.stage = stage;
  tutorial.prompt = prompt ?? tutorial.prompt ?? null;
  if (completed) tutorial.completed = true;
  return { prompt: tutorial.prompt, dialogue, completed: Boolean(completed), spotlight, selectUnitId, beforeDialogueAction, afterDialogueAction, revertVictory: Boolean(revertVictory) };
}

export function noUpdate() {
  return { prompt: null, dialogue: null, completed: false, spotlight: null, selectUnitId: null, beforeDialogueAction: null, afterDialogueAction: null, revertVictory: false };
}

export function tutorialAllowed() {
  return { accepted: true, message: null };
}

export function tutorialBlocked(message, update = null) {
  return { accepted: false, message, ...(update ?? {}) };
}

export function activeCommandUnitId(command) {
  return command.actorId ?? command.unitId ?? null;
}

export function canAct(match, unit) {
  return Boolean(unit && unit.hp > 0 && !unit.spent && takesTurns(unit));
}

export function archerHasTarget(match, archerId) {
  const archer = findUnit(match, archerId);
  if (!archer || archer.hp <= 0) return false;
  return Boolean(findLegalTarget(match, archer));
}

export function findLegalTarget(match, attacker) {
  if (!match || !attacker || attacker.hp <= 0) return null;
  return livingUnits(match)
    .filter((target) => target.id !== attacker.id && areEnemies(attacker, target))
    .sort((left, right) => {
      const distance = chebyshev(attacker.position, left.position) - chebyshev(attacker.position, right.position);
      if (distance !== 0) return distance;
      return left.id.localeCompare(right.id);
    })
    .find((target) => canTargetUnit(match, attacker, target)) ?? null;
}

export function findCounterattackTarget(match, archer) {
  const playerArcher = findUnit(match, PLAYER_ARCHER_ID);
  return canTargetUnit(match, archer, playerArcher) ? playerArcher : null;
}

export function canTargetUnit(match, attacker, target) {
  if (!match || !attacker || !target || target.hp <= 0 || !areEnemies(attacker, target)) return false;
  const range = getEffectiveStats(attacker, match).attackRange;
  return chebyshev(attacker.position, target.position) <= range &&
    !isShotBlocked(match, attacker.position, target.position, attacker) &&
    !isWallBetween(match, attacker.position, target.position, attacker);
}

export function findAttackSetupMove(match, attacker, target) {
  if (!target?.hp) return null;
  const moves = [...getLegalMoves(match, attacker)].map(parseTileKey);
  moves.sort((left, right) => {
    const distance = chebyshev(left, target.position) - chebyshev(right, target.position);
    if (distance !== 0) return distance;
    return positionKey(left).localeCompare(positionKey(right));
  });
  return moves.find((move) => {
    const movedMatch = moveUnitInMatch(match, attacker.id, move);
    return canTargetUnit(movedMatch, findUnit(movedMatch, attacker.id), target);
  }) ?? null;
}

export function holdNextTutorialCpuUnit(match, player) {
  const unit = livingUnits(match, player).find((candidate) => canAct(match, candidate));
  if (!unit) return [];
  return [
    beginActivation(player, unit.id),
    defend(player, unit.id),
  ];
}

export function approachMove(match, unit, preferredTarget = null) {
  const target = preferredTarget?.hp > 0 ? preferredTarget : nearestEnemy(match, unit);
  if (!target) return null;
  const moves = [...getLegalMoves(match, unit)].map(parseTileKey);
  if (!moves.length) return null;
  moves.sort((left, right) => {
    const distance = chebyshev(left, target.position) - chebyshev(right, target.position);
    if (distance !== 0) return distance;
    const center = (match.size - 1) / 2;
    const leftCenter = Math.abs(left.x - center) + Math.abs(left.y - center);
    const rightCenter = Math.abs(right.x - center) + Math.abs(right.y - center);
    return leftCenter - rightCenter;
  });
  return moves.find((move) => !samePosition(move, unit.position)) ?? null;
}

export function moveUnitInMatch(match, unitId, position) {
  return {
    ...match,
    units: match.units.map((unit) => unit.id === unitId ? { ...unit, position } : unit),
  };
}

export function nearestEnemy(match, unit) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of livingUnits(match)) {
    if (candidate.player === unit.player) continue;
    const distance = chebyshev(unit.position, candidate.position);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function parseTileKey(key) {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function samePosition(a, b) {
  return positionKey(a) === positionKey(b);
}

export function footworkPathHitsClod(path) {
  return Array.isArray(path) && path.some((step) => samePosition(step, DAMAGE_TYPES_FOOTWORK_PATH[0]));
}
