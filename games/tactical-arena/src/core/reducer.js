import { COMMANDS } from "./commands.js";
import { resolveNemesisAutoPulse, resolveVolcanicPyroclasmTick, useArt } from "./artResolvers.js";
import {
  getRageEffectValue,
  getUnitType,
  isCommandOnly,
  isRaging,
  takesTurns,
} from "./unitCatalog.js";
import {
  areEnemies,
  cloneState,
  findUnit,
  livingUnits,
  openAutomaticFirstActivation,
  unitAt,
} from "./state.js";


import { getLegalMovePath, getLegalMoves, positionKey, validateTrampleMovePath } from "../rules/movement.js";
import { applyStatus, isPetrified, isStunned } from "../rules/statuses.js";

import { restoreHp, restoreMp } from "./combatEffects.js";

import { commanderPending, validateOpenActivation, validateOwnedLivingUnit } from "./commandValidation.js";
import { applyPostCommandReactions, syncOneShotRageArm } from "./reactions.js";
import { accept, ERR, reject } from "./reducerResult.js";
import { nextActivePlayer, resolveVictory, spendAndAdvance, syncFinalBattleDarkTileStatuses } from "./turnEngine.js";
import { isTempoBattle, normalizeTempoStateAfterCommand, prepareTempoStateForCommand } from "./tempoBattle.js";
import { attack } from "./basicAttack.js";
import { applyAbilityRecharge, applyRageRegen, refreshSoulShuffle } from "./activationPassives.js";
import { CAUSE, creditDeaths, snapshotAlive } from "./killAttribution.js";

function stationaryStrengthEffect(unit) {
  return getUnitType(unit.type).arts.find((art) => art.effect?.type === "stationaryStrength")?.effect ?? null;
}

export function applyCommand(state, command) {
  const commandState = isTempoBattle(state) ? prepareTempoStateForCommand(state, command) : state;
  // Opens the BROAD kill-credit scope for this command. Narrow scopes inside the
  // resolvers (fire ticks, poison ticks, self-sacrifice) claim their deaths first;
  // this backstop attributes whatever is left to the acting unit, which is correct for
  // the ordinary case of "their attack/ART/splash killed it". See killAttribution.js.
  const aliveBefore = snapshotAlive(commandState);
  const result = dispatchCommand(commandState, command);
  // A single reconciliation seam runs after EVERY accepted command, diffing the input
  // state against the result to catch every unit that fell or was revived — regardless
  // of which resolver or turn-rollover hazard (fire/poison/black-death/time-steal) did
  // it — and applies the King's reactive HP swings. Deterministic (no RNG), so online
  // lockstep clients all compute the identical reaction.
  if (result.accepted) {
    applyPostCommandReactions(commandState, result.nextState, result.events, {
      resolveNemesisAutoPulse,
      resolveVolcanicPyroclasmTick
    });
    syncFinalBattleDarkTileStatuses(result.nextState, result.events);
    // Closed AFTER the reaction seam so chain deaths are attributed too: if the actor
    // kills an enemy and that enemy's King then mourns itself to death, the actor caused
    // both. Same-team and self kills are filtered by creditDeaths, so friendly fire and
    // a player's own grieving King never pad anyone's record.
    creditDeaths(result.nextState, aliveBefore, result.events, {
      killerId: command.unitId ?? commandState.activation?.unitId ?? null,
      cause: command.type === COMMANDS.CONCEDE ? CAUSE.CONCEDE : CAUSE.UNIT,
    });
    closeDeadActiveUnit(result.nextState);
    normalizeTempoStateAfterCommand(result.nextState);
  }
  return result;
}

function closeDeadActiveUnit(state) {
  if (state.phase !== "playing" || !state.activation?.unitId) return;
  const unit = findUnit(state, state.activation.unitId);
  if (!unit || unit.hp > 0) return;
  spendAndAdvance(state, unit);
}

function dispatchCommand(state, command) {
  if (!command?.type || state.phase !== "playing") return reject(ERR.INVALID_COMMAND);
  switch (command.type) {
    case COMMANDS.BEGIN_ACTIVATION: return beginActivation(state, command);
    case COMMANDS.MOVE_UNIT: return moveUnit(state, command);
    case COMMANDS.CANCEL_MOVE: return cancelMove(state, command);
    case COMMANDS.ATTACK: return attack(state, command);
    case COMMANDS.DEFEND: return defend(state, command);
    case COMMANDS.USE_ART: return useArt(state, command);
    case COMMANDS.FINISH_ACTIVATION: return finishActivation(state, command);
    case COMMANDS.CONCEDE: return concede(state, command);
    default: return reject(ERR.INVALID_COMMAND);
  }
}

function beginActivation(state, command) {
  if (command.player !== state.currentPlayer) return reject(ERR.NOT_ACTIVE_PLAYER);
  const result = validateOwnedLivingUnit(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  // Summons (Ghouls) never activate — they spawn spent, but guard explicitly so a
  // summon can never open an activation even if some path clears its spent flag.
  // Stun is auto-spent at turn refresh, and this guard keeps hand-built states from
  // opening an action panel for a stunned unit.
  // Petrify (Treant): a petrified statue cannot open an activation — it auto-spends each
  // of its turns (turnEngine.js) until it wakes.
  if (!takesTurns(result.unit) || result.unit.spent || isStunned(result.unit) || isPetrified(result.unit)) return reject(ERR.UNIT_SPENT);
  if (state.activation?.summonerId && state.activation.unitId !== result.unit.id) return reject(ERR.ACTIVATION_ALREADY_OPEN);
  if (state.activation && state.activation.unitId !== result.unit.id &&
      (state.activation.moved || state.activation.primaryUsed)) return reject(ERR.ACTIVATION_ALREADY_OPEN);
  // First-actor supports go first: no other unit of this owner may open an activation
  // while a living first-actor still owes its turn.
  if (!getUnitType(result.unit.type).actsFirst && commanderPending(state, command.player)) {
    return reject(ERR.KING_MUST_ACT_FIRST);
  }

  // A genuinely fresh activation (not a re-open of the same unit's already-open one),
  // so a one-shot begin effect (Gargoyle's free Pyroclasm) can't double-fire.
  const fresh = state.activation?.unitId !== result.unit.id;

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  unit.defending = false;
  syncOneShotRageArm(unit);
  if (unit.skipNextActivation) {
    unit.skipNextActivation = false;
    spendAndAdvance(next, unit);
    return accept(next, [{ type: "DESPERATION_EXHAUSTED", unitId: unit.id }]);
  }
  if (fresh) {
    const planted = stationaryStrengthEffect(unit);
    if (planted) {
      unit.stationaryStrength = Math.min(
        Math.max(0, Number(planted.max) || 0),
        (unit.stationaryStrength ?? 0) + Math.max(0, Number(planted.amount) || 0)
      );
    }
    // Riot Cop: refresh finite ability uses (rage entry) and progress depleted pools
    // toward their restore. Fired at the START of each fresh turn (deterministic, no
    // roll), so online lockstep clients all agree.
    applyAbilityRecharge(unit);
    refreshSoulShuffle(next, unit);
  }
  // Rain Stance's on-attack charge (set last turn) becomes a live +MOVE buff for this
  // whole activation — applied here, not at attack time, so it lands on the NEXT turn
  // even if the Witch Doctor attacked-then-moved. It ticks off at this activation's end.
  if (unit.rainCharged) {
    const hasted = applyStatus(unit, { type: "empowered", duration: 1, statModifiers: { moveRange: unit.rainCharged } });
    if (hasted.applied) unit.statuses = hasted.statuses;
    unit.rainCharged = 0;
  }
  if (unit.weatherMoveCharged) {
    const hasted = applyStatus(unit, { type: "empowered", duration: 1, statModifiers: { moveRange: unit.weatherMoveCharged } });
    if (hasted.applied) unit.statuses = hasted.statuses;
    unit.weatherMoveCharged = 0;
  }
  // Ether (Treant): a banked +stat buff from recovering MP last turn lands now, for this
  // whole activation (the Rain-haste pattern above).
  if (unit.etherCharged) {
    const empowered = applyStatus(unit, { type: "empowered", duration: 1, statModifiers: { ...unit.etherCharged } });
    if (empowered.applied) unit.statuses = empowered.statuses;
    unit.etherCharged = null;
  }
  next.activation = {
    unitId: unit.id,
    origin: { ...unit.position },
    moved: false,
    primaryUsed: false,
    spellUsed: false,
    bonusActionGroups: [],
    realmTraversalActive: Boolean(unit.realmTraversalCharged)
  };
  if (unit.realmTraversalCharged) unit.realmTraversalCharged = false;
  // Volcanic Rage (Gargoyle): the first raging activation and every Nth one after erupt
  // a free Pyroclasm BEFORE the turn opens. It spends no MP and no action — the Gargoyle
  // still takes its full turn.
  // Fired here (deterministic, no roll — magic AoE) so online lockstep clients all agree.
  const events = [{ type: "ACTIVATION_BEGAN", unitId: unit.id }];
  const freeCast = fresh ? getRageEffectValue(unit, "freePyroclasm", null) : null;
  if (freeCast && isRaging(unit)) {
    resolveVolcanicPyroclasmTick(next, unit, freeCast, events, { trigger: "activation" });
  }
  // Emergency Snacks (Fat Cleric RAGE): a per-turn self-regen while raging, fired at the
  // start of each fresh turn (deterministic, no roll — so online lockstep clients agree).
  if (fresh) applyRageRegen(next, unit, events);
  return accept(next, events);
}

function moveUnit(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.moved) return reject(ERR.MOVE_ALREADY_USED);

  let path;
  if (command.path) {
    // An explicit tile-by-tile route (Trample's step-by-step targeting). Must
    // validate as a legal walk AND actually end on the clicked destination.
    if (!validateTrampleMovePath(state, result.unit, command.path)) return reject(ERR.MOVE_OUT_OF_RANGE);
    const last = command.path[command.path.length - 1];
    if (last.x !== command.position.x || last.y !== command.position.y) return reject(ERR.MOVE_OUT_OF_RANGE);
    path = command.path.map((step) => ({ ...step }));
  } else {
    if (!getLegalMoves(state, result.unit).has(positionKey(command.position))) return reject(ERR.MOVE_OUT_OF_RANGE);
    path = getLegalMovePath(state, result.unit, command.position) ?? [{ ...command.position }];
  }

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const from = { ...unit.position };
  const trampleDamage = Math.max(0, Number(getRageEffectValue(unit, "trampleDamage", 0)) || 0);
  const harmed = [];
  const damageByTarget = {};
  if (trampleDamage > 0) {
    for (const step of path) {
      const target = unitAt(next, step);
      if (!target || !areEnemies(unit, target)) continue;
      const dealt = Math.min(target.hp, trampleDamage);
      target.hp = Math.max(0, target.hp - trampleDamage);
      harmed.push(target.id);
      damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    }
  }
  unit.position = { ...command.position };
  if (stationaryStrengthEffect(unit)) {
    next.activation.stationaryStrengthBeforeMove = unit.stationaryStrength ?? 0;
    unit.stationaryStrength = 0;
  }
  next.activation.moved = true;
  resolveVictory(next);
  return accept(next, [{
    type: "UNIT_MOVED",
    unitId: unit.id,
    from,
    to: { ...unit.position },
    ...(harmed.length ? { path: path.map((step) => ({ ...step })), harmed, damageByTarget } : {})
  }]);
}

function trampleMoveCancelLocked(unit) {
  return Math.max(0, Number(getRageEffectValue(unit, "trampleDamage", 0)) || 0) > 0;
}

function cancelMove(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.moved) return reject(ERR.CANCEL_NOT_AVAILABLE);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  if (trampleMoveCancelLocked(result.unit)) return reject(ERR.CANCEL_NOT_AVAILABLE);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const restoredTo = { ...next.activation.origin };
  unit.position = restoredTo;
  next.activation.moved = false;
  if (Number.isFinite(next.activation.stationaryStrengthBeforeMove) && stationaryStrengthEffect(unit)) {
    unit.stationaryStrength = next.activation.stationaryStrengthBeforeMove;
    delete next.activation.stationaryStrengthBeforeMove;
  }

  return accept(next, [{ type: "MOVE_CANCELLED", unitId: unit.id, restoredTo: { ...restoredTo } }]);
}

function defend(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  unit.defending = true;
  next.activation.primaryUsed = true;
  const events = [{ type: "UNIT_DEFENDED", unitId: command.unitId }];
  // Snack Break (Fat Cleric): bracing without having moved this activation restores a
  // little HP (honoring a board-wide healing lockout) and MP. Read centrally off the
  // passive so no rule hard-codes the unit.
  const snack = getUnitType(unit.type).passive?.effect;
  if (snack?.type === "defendRestore" && !next.activation.moved) {
    const hp = restoreHp(next, unit, unit, snack.hp ?? 0);
    const mp = restoreMp(next, unit, unit, snack.mp ?? 0);
    const hpRestored = hp.hpRestored;
    const mpRestored = mp.mpRestored;
    const recipientId = hp.targetId ?? mp.targetId ?? unit.id;
    if (hpRestored > 0 || mpRestored > 0) {
      events.push({ type: "SNACK_BREAK", unitId: recipientId, sourceId: unit.id, hpRestored, mpRestored });
    }
  }
  spendAndAdvance(next, unit);
  return accept(next, events);
}

function finishActivation(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.primaryUsed) return reject(ERR.FINISH_REQUIRES_ACTION);
  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  spendAndAdvance(next, unit);
  return accept(next, [{ type: "ACTIVATION_FINISHED", unitId: unit.id }]);
}

// A player resigns. Their living units all drop out, then victory is re-resolved
// (in a 1v1 this always completes the match for the opponent). Written
// player-generically so it carries forward to FFA/teams: if the match continues and
// the conceding player was on the clock, the turn passes on. Summons follow their
// commander out, so a forfeit can't leave a lone Ghoul stalling the board.
function concede(state, command) {
  if (!Number.isInteger(command.player) || command.player < 1) return reject(ERR.INVALID_COMMAND);
  const next = cloneState(state);
  const events = [];
  // Resigning wipes the squad. The UNIT_DEFEATED events are emitted by the shared
  // attribution pass in applyCommand (cause: "concede", crediting nobody) rather than
  // here, so a death is announced exactly once no matter how it happened.
  for (const unit of next.units) {
    if (unit.player === command.player && unit.hp > 0) unit.hp = 0;
  }
  events.push({ type: "PLAYER_CONCEDED", player: command.player });
  next.activation = null;
  resolveVictory(next);
  if (next.phase === "playing" && next.currentPlayer === command.player) {
    next.currentPlayer = nextActivePlayer(next, command.player);
    next.turnNumber += 1;
    for (const member of livingUnits(next, next.currentPlayer)) if (takesTurns(member)) member.spent = false;
    openAutomaticFirstActivation(next);
  }
  return accept(next, events);
}

