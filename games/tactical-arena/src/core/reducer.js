import { COMMANDS } from "./commands.js";
import { resolveNemesisAutoPulse, resolveVolcanicPyroclasmTick, useArt } from "./artResolvers.js";
import { getArt, getBasicAttackResourceCost, getEffectiveStats, getPoisonMpRefund, getRageAttackStatus, getRageEffectValue, getUnitType, getWallKillResourceReward, getWeatherCritCreatesFire, initialAbilityUses, isCommandOnly, isDefending, isRaging, takesTurns } from "./unitCatalog.js";
import { areEnemies, cloneState, findUnit, getTileAffinity, isWallAt, livingUnits, unitAt } from "./state.js";
import { getConeCells } from "../rules/arts.js";
import { addDuelMark, duelistTracksMisses, getAttackRecoil, getAttackSplashDamage, getBasicAttackDamageType, getCritCreatesFire, getCritOnHitStatus, getCritPullEffect, getCritSplashDamage, getDuelistCritLifesteal, getLineAttackTargets, getMeleeDefendRetaliation, isFireBasedDamage, isFireDamageImmune, isShotBlocked, isStraightRayTarget, isWallBetween, requiresRayBasicAttack, resolveBaseStrike, rollToHit } from "../rules/combat.js";
import { chebyshevDistance, getLegalMovePath, getLegalMoves, positionKey, validateTrampleMovePath } from "../rules/movement.js";
import { applyStatus, isPetrified, isStunned } from "../rules/statuses.js";
import { alliesInRadius, getStanceEffect } from "../rules/stances.js";
import { applyDarkTreadLifesteal, applyGrowth, applyMagicDamageReaction, applyRockHardDefense, resolvePhysicalDamageHealing, restoreHp, restoreMp } from "./combatEffects.js";
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
  // Petrify (Treant): a petrified statue cannot open an activation — it auto-spends each
  // of its turns (turnEngine.js) until it wakes.
  if (!takesTurns(result.unit) || result.unit.spent || isStunned(result.unit) || isPetrified(result.unit)) return reject(ERR.UNIT_SPENT);
  if (state.activation?.summonerId && state.activation.unitId !== result.unit.id) return reject(ERR.ACTIVATION_ALREADY_OPEN);
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
    // Riot Cop: refresh finite ability uses (rage entry) and progress depleted pools
    // toward their restore. Fired at the START of each fresh turn (deterministic, no
    // roll), so online lockstep clients all agree.
    applyAbilityRecharge(unit);
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
  const beforeHp = unit.hp;
  const beforeMp = unit.mp;
  const wasBelowThreshold = beforeHp <= 5;
  restoreHp(state, unit, unit, regen.hp ?? 0);
  unit.emergencySnackCount = (unit.emergencySnackCount ?? 0) + 1;
  if (wasBelowThreshold && unit.hp > 5) {
    restoreMp(state, unit, unit, regen.exitMp ?? 0);
  }
  events.push({ type: "EMERGENCY_SNACK", unitId: unit.id, hpRestored: unit.hp - beforeHp, mpRestored: unit.mp - beforeMp });
  return true;
}

// Riot Cop's finite ability uses. Fired at the start of each fresh activation: the
// RAGE entry refill (Lockdown), and the one-full-turn-empty recharge for any depleted
// pool. Data-first off `art.uses` + the ragePassive `refreshResources` flag, so it is a
// no-op for every unit without finite-use arts.
function applyAbilityRecharge(unit) {
  const definition = getUnitType(unit.type);
  const useArts = (definition.arts ?? []).filter((art) => Number.isFinite(art.uses));
  if (!useArts.length) return;
  if (!unit.abilityUses) unit.abilityUses = initialAbilityUses(definition);
  if (!unit.abilityRecharge) unit.abilityRecharge = {};

  // Lockdown (RAGE): the instant Riot Cop rages, refill every finite pool to full — once
  // per rage window, re-armable if he ever climbs back above the threshold.
  if (isRaging(unit) && getRageEffectValue(unit, "refreshResources", false)) {
    if (!unit.lockdownRefreshed) {
      unit.abilityUses = initialAbilityUses(definition);
      unit.abilityRecharge = {};
      unit.lockdownRefreshed = true;
    }
  } else if (!isRaging(unit)) {
    unit.lockdownRefreshed = false;
  }

  // A pool at 0 must experience one FULL turn empty before it restores: the turn it hits
  // 0 doesn't count, the next turn it is empty (counter → 1), and the turn after that it
  // restores to full (counter reaches the 2 threshold at this turn's start).
  for (const art of useArts) {
    const remaining = Number.isFinite(unit.abilityUses[art.id]) ? unit.abilityUses[art.id] : art.uses;
    if (remaining > 0) { delete unit.abilityRecharge[art.id]; continue; }
    const waited = (unit.abilityRecharge[art.id] ?? 0) + 1;
    if (waited >= 2) {
      unit.abilityUses[art.id] = art.uses;
      delete unit.abilityRecharge[art.id];
    } else {
      unit.abilityRecharge[art.id] = waited;
    }
  }
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
  if (requiresRayBasicAttack(result.unit) && !isStraightRayTarget(result.unit.position, target.position)) {
    return reject(ERR.INVALID_TARGET);
  }
  // A basic attack is body-blocked by any unit in between unless the attacker has an
  // explicit pierce passive (Sniper). Angel's Blessed Arrow changes damage type, not
  // targeting. A wall between blocks too, unless pierce says otherwise.
  const basicDamageType = getBasicAttackDamageType(result.unit);
  if (isShotBlocked(state, result.unit.position, target.position, result.unit) ||
      isWallBetween(state, result.unit.position, target.position, result.unit)) return reject(ERR.TARGET_OBSTRUCTED);
  const resourceCost = getBasicAttackResourceCost(result.unit, target);
  if (resourceCost > 0 && result.unit.mp < resourceCost) return reject(ERR.ART_NOT_AVAILABLE);

  const next = cloneState(state);
  const actor = findUnit(next, command.actorId);
  const nextTarget = findUnit(next, command.targetId);
  next.activation.primaryUsed = true;
  if (resourceCost > 0) actor.mp = Math.max(0, actor.mp - resourceCost);

  // Witch Doctor stance on-attack triggers fire on the swing itself (hit or miss):
  // Rain charges next-turn haste, Spirit restores MP to nearby allies. No-op for
  // every other unit (no stance).
  const triggerEvents = applyStanceAttackTriggers(next, actor);

  // To-hit roll first (miss/crit). Blind and the raging Archer's never-miss are
  // folded into the chance, so a guaranteed miss reads through the same path.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  // Dark Ether (Blacksword): a one-shot guaranteed-crit charge is spent by the attack it
  // buffed, hit OR miss ("still roll for misses").
  if (actor.guaranteedCritCharged) actor.guaranteedCritCharged = false;
  if (swing.missed) {
    // Wanderer (Ronin): a foe that whiffs on Ronin is marked for +1 damage on his next turn.
    if (duelistTracksMisses(nextTarget)) addDuelMark(nextTarget, actor.id);
    const desperationEvents = consumeOneShotRage(actor);
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll, ...(resourceCost > 0 ? { mpCost: resourceCost } : {}) }, ...triggerEvents, ...desperationEvents]);
  }
  const targets = getLineAttackTargets(next, actor, nextTarget);
  const targetIds = [];
  const damageByTarget = {};
  let totalDamageDealt = 0;
  let primaryDamage = null;
  let primaryDamageDealt = 0;
  // On-hit status riders. A raging kit that poisons EVERY landed hit (Virus's Infectious
  // Affinity) applies unconditionally; otherwise a crit rider (Angel's Blessed Arrow blind,
  // Virus's Spread crit-poison) applies only on a critical. Immunity is enforced by
  // applyStatus, so a status-immune target simply resists.
  const critStatus = getCritOnHitStatus(actor);
  const rageAttackStatus = getRageAttackStatus(actor);
  const poisonRefund = getPoisonMpRefund(actor);
  const critFire = getCritCreatesFire(actor);
  const weatherCritFire = getWeatherCritCreatesFire(next);
  const blinded = []; // targets that received an on-hit status (event key kept for back-compat)
  const fireTiles = [];
  const rockHardEvents = []; // Rock Hard (Clod): MP refunded per physical strike while defending
  const magicReactionEvents = [];
  const pulled = {};
  const damagedForLifesteal = []; // Dark Tread (Blacksword): enemies hurt this swing
  let poisonedByAttack = 0;
  const strike = (unit) => resolveBaseStrike(actor, unit, { proximity: true, critical: swing.critical, state: next, damageType: basicDamageType, basicAttack: true });
  for (const targetUnit of targets) {
    const damage = strike(targetUnit);
    const damageDealt = Math.min(targetUnit.hp, damage.damage);
    targetUnit.hp = Math.max(0, targetUnit.hp - damage.damage);
    if (damageDealt > 0) damagedForLifesteal.push(targetUnit);
    const magicReaction = basicDamageType === "magic" ? applyMagicDamageReaction(targetUnit, damageDealt) : null;
    if (magicReaction) magicReactionEvents.push(magicReaction);
    targetIds.push(targetUnit.id);
    damageByTarget[targetUnit.id] = damage.damage;
    totalDamageDealt += damageDealt;
    rockHardEvents.push(...applyRockHardDefense(next, targetUnit, basicDamageType === "physical"));
    const onHit = rageAttackStatus ?? (swing.critical ? critStatus : null);
    if (onHit && targetUnit.hp > 0) {
      // Carry statModifiers when the crit-status is a stat debuff (Treant's Verdant Bond
      // slow = −1 MOVE); blind/poison riders have none.
      const applied = applyStatus(targetUnit, {
        type: onHit.status,
        duration: onHit.duration,
        ...(onHit.statModifiers ? { statModifiers: { ...onHit.statModifiers } } : {})
      });
      if (applied.applied) {
        targetUnit.statuses = applied.statuses;
        blinded.push(targetUnit.id);
        if (onHit.status === "poison") poisonedByAttack += 1;
      }
    }
    if (swing.critical && (critFire || weatherCritFire)) {
      const position = { ...targetUnit.position };
      const fire = critFire ?? weatherCritFire;
      next.tileObjects[positionKey(position)] = { kind: fire.kind ?? "fire", permanent: Boolean(fire.permanent) };
      fireTiles.push(position);
    }
    const critPull = swing.critical ? getCritPullEffect(actor) : null;
    if (critPull && targetUnit.hp > 0) {
      const dx = Math.sign(targetUnit.position.x - actor.position.x);
      const dy = Math.sign(targetUnit.position.y - actor.position.y);
      const destination = { x: actor.position.x + dx, y: actor.position.y + dy };
      const from = { ...targetUnit.position };
      const blocked = destination.x < 0 || destination.y < 0 || destination.x >= next.size || destination.y >= next.size ||
        isWallAt(next, destination) || (unitAt(next, destination) && unitAt(next, destination).id !== targetUnit.id);
      if (!blocked) {
        targetUnit.position = destination;
        pulled[targetUnit.id] = { from, to: { ...destination } };
        const applied = applyStatus(targetUnit, { type: critPull.status, duration: critPull.durationTurns ?? critPull.duration ?? 1 });
        if (applied.applied) targetUnit.statuses = applied.statuses;
      }
    }
    if (targetUnit.id === nextTarget.id) { primaryDamage = damage; primaryDamageDealt = damageDealt; }
  }
  const damage = primaryDamage ?? strike(nextTarget);
  // Wanderer (Ronin): a critical basic strike heals Ronin for half the damage dealt to the
  // target (honoring a board-wide healing lockout). RAGE Final Draw: the attack then recoils
  // its full damage back onto Ronin (this can kill him — resolveVictory below settles it).
  const duelistEvents = [];
  const critLifesteal = getDuelistCritLifesteal(actor);
  if (swing.critical && critLifesteal > 0 && primaryDamageDealt > 0) {
    const restored = restoreHp(next, actor, actor, Math.round(primaryDamageDealt * critLifesteal));
    if (restored.hpRestored > 0) duelistEvents.push({ type: "DUELIST_HEAL", unitId: restored.targetId ?? actor.id, sourceId: actor.id, hpRestored: restored.hpRestored });
  }
  const critMpRestore = getBasicAttackCritMpRestore(actor);
  if (swing.critical && critMpRestore > 0) {
    const restored = restoreMp(next, actor, actor, critMpRestore);
    if (restored.mpRestored > 0 || restored.hpRestored > 0) {
      duelistEvents.push({ type: "CRIT_MP_RESTORE", unitId: restored.targetId ?? actor.id, sourceId: actor.id, mpGained: restored.mpRestored, hpRestored: restored.hpRestored });
    }
  }
  if (getAttackRecoil(actor) && totalDamageDealt > 0) {
    const recoil = Math.min(actor.hp, totalDamageDealt);
    actor.hp = Math.max(0, actor.hp - totalDamageDealt);
    duelistEvents.push({ type: "ATTACK_RECOIL", unitId: actor.id, damage: recoil });
  }
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
  // Dark Tread (Blacksword): heal for each enemy struck while it stood on a dark tile.
  const darkTreadEvents = applyDarkTreadLifesteal(next, actor, damagedForLifesteal);
  const splashEvents = swing.critical ? applySplashDamage(next, actor, nextTarget, getCritSplashDamage(actor)) : [];
  // Void Reach (attackSplash): splash on EVERY landed hit, crit or not.
  const attackSplashEvents = applySplashDamage(next, actor, nextTarget, getAttackSplashDamage(actor), "ATTACK_SPLASH");
  const freeConeEvents = applyBasicAttackFreeCone(next, actor, nextTarget);
  const desperationEvents = consumeOneShotRage(actor);
  resolveVictory(next);
  // If the attacker died resolving its own strike (Ronin's Final Draw recoil, or Stone Body
  // thorns), close out its now-dangling activation so the turn isn't soft-locked on a dead
  // unit — the player could otherwise neither continue with it nor open another unit.
  if (next.phase === "playing" && actor.hp <= 0 && next.activation?.unitId === actor.id) {
    spendAndAdvance(next, actor);
  }
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, targetIds, damageByTarget,
    ...(resourceCost > 0 ? { mpCost: resourceCost } : {}),
    ...(blinded.length ? { blinded } : {}),
    ...(fireTiles.length ? { fireTiles } : {}),
    ...(Object.keys(pulled).length ? { pulled } : {}),
    ...damageFields
  }, ...triggerEvents, ...healingEvents, ...retaliationEvents, ...growthEvents, ...darkTreadEvents, ...splashEvents, ...attackSplashEvents, ...freeConeEvents, ...desperationEvents, ...rockHardEvents, ...magicReactionEvents, ...duelistEvents]);
}

function getBasicAttackCritMpRestore(unit) {
  const effect = getUnitType(unit.type).passive?.effect;
  return effect?.type === "weatherCommander" ? Math.max(0, Number(effect.critMpRestore) || 0) : 0;
}

// True-damage splash around the unit a basic attack just struck: everything hostile to the
// attacker within `radius` of the original target (the target itself excluded — it already
// took the strike) takes `amount`, plus `affinityBonus.amount` more if THAT unit stands on
// an `affinityBonus.affinity` tile. Two callers: Little Brother's crit-only Splash Fire,
// and the `attackSplash` passive, which rides every landed hit (mission 22's Blacksword —
// standing next to whoever he swings at is what gets a party killed).
function applySplashDamage(state, actor, originalTarget, splash, eventType = "SPLASH_FIRE") {
  const amount = Math.max(0, Number(splash?.amount) || 0);
  if (amount <= 0 || !originalTarget) return [];
  const radius = Math.max(0, Number(splash.radius) || 0);
  const affinityBonus = splash.affinityBonus ?? null;
  const bonusAmount = Math.max(0, Number(affinityBonus?.amount) || 0);
  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(state)) {
    if (target.id === originalTarget.id || !areEnemies(actor, target)) continue;
    if (chebyshevDistance(originalTarget.position, target.position) > radius) continue;
    const onAffinity = Boolean(affinityBonus) &&
      getTileAffinity(state, target.position) === affinityBonus.affinity;
    const damage = amount + (onAffinity ? bonusAmount : 0);
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    if (dealt > 0) {
      targetIds.push(target.id);
      damageByTarget[target.id] = dealt;
    }
  }
  return targetIds.length ? [{
    type: eventType,
    actorId: actor.id,
    sourceTargetId: originalTarget.id,
    targetIds,
    damageByTarget
  }] : [];
}

function applyBasicAttackFreeCone(state, actor, originalTarget) {
  if (!isRaging(actor)) return [];
  const trigger = getRageEffectValue(actor, "basicAttackCone", null);
  if (!trigger?.artId || !originalTarget) return [];
  const dx = Math.sign(originalTarget.position.x - actor.position.x);
  const dy = Math.sign(originalTarget.position.y - actor.position.y);
  if (trigger.orthogonalOnly && !((dx === 0) !== (dy === 0))) return [];
  const art = getArt(actor.type, trigger.artId);
  if (!art?.damage) return [];
  const origin = { x: actor.position.x + dx, y: actor.position.y + dy };
  const cells = getConeCells(state, actor, origin, art);
  if (!cells) return [];
  const cellKeys = new Set(cells.map(positionKey));
  const amount = Math.max(0, Number(art.damage.amount) || 0);
  const fireBased = isFireBasedDamage({ art });
  const targetIds = [];
  const damageByTarget = {};
  for (const target of livingUnits(state)) {
    if (!areEnemies(actor, target) || !cellKeys.has(positionKey(target.position))) continue;
    if (fireBased && isFireDamageImmune(target)) continue;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    if (dealt > 0) {
      targetIds.push(target.id);
      damageByTarget[target.id] = dealt;
    }
  }
  return [{
    type: "FLAMESPITTER",
    actorId: actor.id,
    artId: art.id,
    targetPosition: origin,
    targetIds,
    damageByTarget,
    mpCost: 0
  }];
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
  if (requiresRayBasicAttack(attacker) && !isStraightRayTarget(attacker.position, pos)) {
    return reject(ERR.INVALID_TARGET);
  }
  if (isShotBlocked(state, attacker.position, pos, attacker) ||
      isWallBetween(state, attacker.position, pos, attacker)) return reject(ERR.TARGET_OBSTRUCTED);
  const resourceCost = getBasicAttackResourceCost(attacker, pos);
  if (resourceCost > 0 && attacker.mp < resourceCost) return reject(ERR.ART_NOT_AVAILABLE);

  const next = cloneState(state);
  const key = positionKey(pos);
  const wall = next.tileObjects[key];
  const actor = findUnit(next, command.actorId);
  if (resourceCost > 0) actor.mp = Math.max(0, actor.mp - resourceCost);
  wall.hp = Math.max(0, wall.hp - getEffectiveStats(actor, next).strength);
  next.activation.primaryUsed = true;
  const destroyed = wall.hp <= 0;
  let oreGained = 0;
  if (destroyed) {
    delete next.tileObjects[key];
    const reward = getWallKillResourceReward(actor, pos);
    if (reward > 0) {
      const before = actor.mp;
      actor.mp = Math.min(getEffectiveStats(actor, next).maxMp, actor.mp + reward);
      oreGained = actor.mp - before;
    }
  }
  return accept(next, [{
    type: "WALL_ATTACKED",
    actorId: command.actorId,
    position: { ...pos },
    destroyed,
    hpAfter: destroyed ? 0 : wall.hp,
    ...(resourceCost > 0 ? { mpCost: resourceCost } : {}),
    ...(oreGained > 0 ? { oreGained, oreAfter: actor.mp } : {})
  }]);
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
    const healedByTarget = {};
    for (const ally of alliesInRadius(state, actor, trigger.allyMpRadius)) {
      const restored = restoreMp(state, actor, ally, trigger.allyMp);
      if (restored.mpRestored > 0) restoredByTarget[ally.id] = restored.mpRestored;
      if (restored.hpRestored > 0) healedByTarget[ally.id] = restored.hpRestored;
    }
    if (Object.keys(restoredByTarget).length || Object.keys(healedByTarget).length) {
      events.push({ type: "STANCE_MP_RESTORED", unitId: actor.id, restoredByTarget, healedByTarget });
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

