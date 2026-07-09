import { COMMANDS } from "./commands.js";
import { resolveNemesisAutoPulse, resolveVolcanicPyroclasmTick, useArt } from "./artResolvers.js";
import { getEffectiveStats, getPoisonMpRefund, getRageAttackStatus, getRageEffectValue, getUnitType, isCommandOnly, isDefending, isRaging, takesTurns } from "./unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "./state.js";
import { getBasicAttackDamageType, getCritCreatesFire, getCritOnHitStatus, getLineAttackTargets, getMeleeDefendRetaliation, isHealingDisabled, isShotBlocked, isWallBetween, resolveBaseStrike, rollToHit } from "../rules/combat.js";
import { chebyshevDistance, getLegalMovePath, getLegalMoves, positionKey, validateTrampleMovePath } from "../rules/movement.js";
import { applyStatus, isStunned } from "../rules/statuses.js";
import { alliesInRadius, getStanceEffect } from "../rules/stances.js";
import { applyGrowth, applyMagicDamageReaction, applyRockHardDefense, resolvePhysicalDamageHealing } from "./combatEffects.js";
import { commanderPending, validateOpenActivation, validateOwnedLivingUnit } from "./commandValidation.js";
import { applyPostCommandReactions, consumeOneShotRage, syncOneShotRageArm } from "./reactions.js";
import { accept, ERR, reject } from "./reducerResult.js";
import { nextActivePlayer, resolveVictory, spendAndAdvance } from "./turnEngine.js";
import { isTempoBattle, normalizeTempoStateAfterCommand, prepareTempoStateForCommand } from "./tempoBattle.js";

function stationaryStrengthEffect(unit) {
  return getUnitType(unit.type).arts.find((art) => art.effect?.type === "stationaryStrength")?.effect ?? null;
}

export function applyCommand(state, command) {
  const commandState = isTempoBattle(state) ? prepareTempoStateForCommand(state, command) : state;
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
    normalizeTempoStateAfterCommand(result.nextState);
  }
  return result;
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
  if (!takesTurns(result.unit) || result.unit.spent || isStunned(result.unit)) return reject(ERR.UNIT_SPENT);
  if (state.activation && state.activation.unitId !== result.unit.id &&
      (state.activation.moved || state.activation.primaryUsed)) return reject(ERR.ACTIVATION_ALREADY_OPEN);
  // The King commands first: no other unit of this owner may open an activation while a
  // living King still owes his command this turn.
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
  }
  // Rain Stance's on-attack charge (set last turn) becomes a live +MOVE buff for this
  // whole activation — applied here, not at attack time, so it lands on the NEXT turn
  // even if the Witch Doctor attacked-then-moved. It ticks off at this activation's end.
  if (unit.rainCharged) {
    const hasted = applyStatus(unit, { type: "empowered", duration: 1, statModifiers: { moveRange: unit.rainCharged } });
    if (hasted.applied) unit.statuses = hasted.statuses;
    unit.rainCharged = 0;
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

// Emergency Snacks (a `rageRegen` ragePassive): while raging, nibble `hp` HP back at the
// start of the turn. The turn that nibble lifts her back above the 5-HP rage threshold she
// also restores `exitMp`. Capped at `maxProcs` procs per battle (unit.emergencySnackCount,
// a hashed field). A board-wide healing lockout (a raging Juggernaut's Null Zone) shuts it
// off — and does NOT burn a proc. Returns true when it actually restored something.
function getRageRegen(unit) {
  if (!isRaging(unit)) return null;
  const effect = getUnitType(unit.type).ragePassive?.effect;
  return effect?.type === "rageRegen" ? effect : null;
}

function applyRageRegen(state, unit, events) {
  const regen = getRageRegen(unit);
  if (!regen) return false;
  if ((unit.emergencySnackCount ?? 0) >= (regen.maxProcs ?? Infinity)) return false;
  if (isHealingDisabled(state)) return false;
  const stats = getEffectiveStats(unit, state);
  const beforeHp = unit.hp;
  const beforeMp = unit.mp;
  const wasBelowThreshold = beforeHp <= 5;
  unit.hp = Math.min(stats.maxHp, unit.hp + (regen.hp ?? 0));
  unit.emergencySnackCount = (unit.emergencySnackCount ?? 0) + 1;
  if (wasBelowThreshold && unit.hp > 5) {
    unit.mp = Math.min(stats.maxMp, unit.mp + (regen.exitMp ?? 0));
  }
  events.push({ type: "EMERGENCY_SNACK", unitId: unit.id, hpRestored: unit.hp - beforeHp, mpRestored: unit.mp - beforeMp });
  return true;
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

function attack(state, command) {
  const result = validateOpenActivation(state, command.player, command.actorId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  // A wall is attacked by tile (no unit there); it resolves through its own path.
  if (command.targetPosition) return attackWall(state, command, result.unit);
  const target = findUnit(state, command.targetId);
  if (!target || target.hp <= 0 || !areEnemies(result.unit, target)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(result.unit.position, target.position) > getEffectiveStats(result.unit, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A basic attack is body-blocked by any unit in between unless the attacker has an
  // explicit pierce passive (Sniper). Angel's Blessed Arrow changes damage type, not
  // targeting. A wall between blocks too, unless pierce says otherwise.
  const basicDamageType = getBasicAttackDamageType(result.unit);
  if (isShotBlocked(state, result.unit.position, target.position, result.unit) ||
      isWallBetween(state, result.unit.position, target.position, result.unit)) return reject(ERR.TARGET_OBSTRUCTED);

  const next = cloneState(state);
  const actor = findUnit(next, command.actorId);
  const nextTarget = findUnit(next, command.targetId);
  next.activation.primaryUsed = true;

  // Witch Doctor stance on-attack triggers fire on the swing itself (hit or miss):
  // Rain charges next-turn haste, Spirit restores MP to nearby allies. No-op for
  // every other unit (no stance).
  const triggerEvents = applyStanceAttackTriggers(next, actor);

  // To-hit roll first (miss/crit). Blind and the raging Archer's never-miss are
  // folded into the chance, so a guaranteed miss reads through the same path.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    const desperationEvents = consumeOneShotRage(actor);
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll }, ...triggerEvents, ...desperationEvents]);
  }
  const targets = getLineAttackTargets(next, actor, nextTarget);
  const targetIds = [];
  const damageByTarget = {};
  let totalDamageDealt = 0;
  let primaryDamage = null;
  // On-hit status riders. A raging kit that poisons EVERY landed hit (Virus's Infectious
  // Affinity) applies unconditionally; otherwise a crit rider (Angel's Blessed Arrow blind,
  // Virus's Spread crit-poison) applies only on a critical. Immunity is enforced by
  // applyStatus, so a status-immune target simply resists.
  const critStatus = getCritOnHitStatus(actor);
  const rageAttackStatus = getRageAttackStatus(actor);
  const poisonRefund = getPoisonMpRefund(actor);
  const critFire = getCritCreatesFire(actor);
  const blinded = []; // targets that received an on-hit status (event key kept for back-compat)
  const fireTiles = [];
  const rockHardEvents = []; // Rock Hard (Clod): MP refunded per physical strike while defending
  const magicReactionEvents = [];
  let poisonedByAttack = 0;
  const strike = (unit) => resolveBaseStrike(actor, unit, { proximity: true, critical: swing.critical, state: next, damageType: basicDamageType });
  for (const targetUnit of targets) {
    const damage = strike(targetUnit);
    const damageDealt = Math.min(targetUnit.hp, damage.damage);
    targetUnit.hp = Math.max(0, targetUnit.hp - damage.damage);
    const magicReaction = basicDamageType === "magic" ? applyMagicDamageReaction(targetUnit, damageDealt) : null;
    if (magicReaction) magicReactionEvents.push(magicReaction);
    targetIds.push(targetUnit.id);
    damageByTarget[targetUnit.id] = damage.damage;
    totalDamageDealt += damageDealt;
    rockHardEvents.push(...applyRockHardDefense(next, targetUnit, basicDamageType === "physical"));
    const onHit = rageAttackStatus ?? (swing.critical ? critStatus : null);
    if (onHit && targetUnit.hp > 0) {
      const applied = applyStatus(targetUnit, { type: onHit.status, duration: onHit.duration });
      if (applied.applied) {
        targetUnit.statuses = applied.statuses;
        blinded.push(targetUnit.id);
        if (onHit.status === "poison") poisonedByAttack += 1;
      }
    }
    if (swing.critical && critFire) {
      const position = { ...targetUnit.position };
      next.tileObjects[positionKey(position)] = { kind: critFire.kind ?? "fire", permanent: Boolean(critFire.permanent) };
      fireTiles.push(position);
    }
    if (targetUnit.id === nextTarget.id) primaryDamage = damage;
  }
  const damage = primaryDamage ?? strike(nextTarget);
  // A magic strike (Blessed Arrow) never feeds a physical-damage heal aura (Hand of Life).
  const healingEvents = basicDamageType === "physical" ? resolvePhysicalDamageHealing(next, actor, totalDamageDealt) : [];
  // Stone Body (Gargoyle): a landed MELEE strike on a DEFENDING Gargoyle returns TRUE
  // damage to the attacker (ignoring the attacker's DEF/Defend). Melee = the attacker
  // stands adjacent; a ranged shot (distance > 1) never triggers it. A Gargoyle raging
  // under Volcanic Rage is always defending, so it always bites a melee attacker.
  const retaliationEvents = [];
  const thorns = getMeleeDefendRetaliation(nextTarget);
  if (thorns > 0 && nextTarget.hp > 0 && isDefending(nextTarget) &&
      chebyshevDistance(actor.position, nextTarget.position) === 1) {
    const dealt = Math.min(actor.hp, thorns);
    actor.hp = Math.max(0, actor.hp - thorns);
    if (dealt > 0) retaliationEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: nextTarget.id, damage: dealt });
  }
  // Growth (Virus): restore MP for each enemy this attack poisoned.
  const growthEvents = poisonRefund > 0 ? applyGrowth(next, actor, poisonRefund * poisonedByAttack) : [];
  const desperationEvents = consumeOneShotRage(actor);
  resolveVictory(next);
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, targetIds, damageByTarget,
    ...(blinded.length ? { blinded } : {}),
    ...(fireTiles.length ? { fireTiles } : {}),
    ...damageFields
  }, ...triggerEvents, ...healingEvents, ...retaliationEvents, ...growthEvents, ...desperationEvents, ...rockHardEvents, ...magicReactionEvents]);
}

// A Build Cover wall is a destructible obstacle, not a unit: an attack against it
// never rolls to-hit (it can't dodge) and deals the attacker's STR, removing the
// wall once its HP hits 0. Spends the unit's primary like any attack. Range and
// line-of-sight are checked like a unit attack — a body blocks a physical shot, a
// wall blocks the line, and only the Sniper's pierce reaches a covered wall.
function attackWall(state, command, attacker) {
  const pos = command.targetPosition;
  if (!isWallAt(state, pos)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(attacker.position, pos) > getEffectiveStats(attacker, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isShotBlocked(state, attacker.position, pos, attacker) ||
      isWallBetween(state, attacker.position, pos, attacker)) return reject(ERR.TARGET_OBSTRUCTED);

  const next = cloneState(state);
  const key = positionKey(pos);
  const wall = next.tileObjects[key];
  wall.hp = Math.max(0, wall.hp - getEffectiveStats(findUnit(next, command.actorId), next).strength);
  next.activation.primaryUsed = true;
  const destroyed = wall.hp <= 0;
  if (destroyed) delete next.tileObjects[key];
  return accept(next, [{ type: "WALL_ATTACKED", actorId: command.actorId, position: { ...pos }, destroyed, hpAfter: destroyed ? 0 : wall.hp }]);
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
    const stats = getEffectiveStats(unit, next);
    const beforeHp = unit.hp;
    const beforeMp = unit.mp;
    if (!isHealingDisabled(next)) unit.hp = Math.min(stats.maxHp, unit.hp + (snack.hp ?? 0));
    unit.mp = Math.min(stats.maxMp, unit.mp + (snack.mp ?? 0));
    const hpRestored = unit.hp - beforeHp;
    const mpRestored = unit.mp - beforeMp;
    if (hpRestored > 0 || mpRestored > 0) {
      events.push({ type: "SNACK_BREAK", unitId: unit.id, hpRestored, mpRestored });
    }
  }
  return accept(next, events);
}

// New art mechanics register here instead of adding branches to useArt.
// Default (targeted attack + optional status/heal effect) needs no entry.
function finishActivation(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.primaryUsed) return reject(ERR.FINISH_REQUIRES_ACTION);
  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  spendAndAdvance(next, unit);
  return accept(next, [{ type: "ACTIVATION_FINISHED", unitId: unit.id }]);
}

function applyStanceAttackTriggers(state, actor) {
  const trigger = getStanceEffect(actor)?.onAttack;
  if (!trigger) return [];
  const events = [];

  if (Number.isFinite(trigger.hasteMove) && trigger.hasteMove > 0) {
    actor.rainCharged = Math.max(actor.rainCharged ?? 0, trigger.hasteMove);
    events.push({ type: "STANCE_HASTE_CHARGED", unitId: actor.id, amount: trigger.hasteMove });
  }

  if (Number.isFinite(trigger.allyMp) && trigger.allyMp > 0) {
    const restoredByTarget = {};
    for (const ally of alliesInRadius(state, actor, trigger.allyMpRadius)) {
      const before = ally.mp;
      ally.mp = Math.min(getEffectiveStats(ally, state).maxMp, ally.mp + trigger.allyMp);
      const restored = ally.mp - before;
      if (restored > 0) restoredByTarget[ally.id] = restored;
    }
    if (Object.keys(restoredByTarget).length) {
      events.push({ type: "STANCE_MP_RESTORED", unitId: actor.id, restoredByTarget });
    }
  }

  return events;
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
  for (const unit of next.units) {
    if (unit.player === command.player && unit.hp > 0) {
      unit.hp = 0;
      events.push({ type: "UNIT_DEFEATED", unitId: unit.id });
    }
  }
  events.push({ type: "PLAYER_CONCEDED", player: command.player });
  next.activation = null;
  resolveVictory(next);
  if (next.phase === "playing" && next.currentPlayer === command.player) {
    next.currentPlayer = nextActivePlayer(next, command.player);
    next.turnNumber += 1;
    for (const member of livingUnits(next, next.currentPlayer)) if (takesTurns(member)) member.spent = false;
  }
  return accept(next, events);
}

