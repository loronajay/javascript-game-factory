import { COMMANDS } from "./commands.js";
import { getArt, getArtMpCost, getCommandHealBonus, getEffectiveStats, getRageEffectValue, getUnitType, isCommandOnly, isDefending, isRaging, sustainsVictory, takesTurns } from "./unitCatalog.js";
import { areEnemies, areAllies, cloneState, findUnit, getTileAffinity, isWallAt, livingTeamUnits, livingUnits, teamOfUnit, unitAt } from "./state.js";
import { canUseArt, FOOTWORK_DAMAGE, getArtTargetRange, getFirePlacementTiles, getFlightTiles, getLegalFleeTiles, getLineTargets, getProtectLandingTiles, getPyroclasmTargets, getRevivePlacementTiles, getReviveTargets, getSelfBlastRadius, getSummonPlacementTiles, getTilePulseTargets, getVolleyShotCells, getWallPlacementTiles, validateFootworkPath } from "../rules/arts.js";
import { getBasicAttackDamageType, getCritOnHitStatus, getDisplacementRetaliation, getLineAttackTargets, getMeleeDefendRetaliation, getProximityBonus, getSelfMagicVulnerability, getTeamDamageReduction, isHealingDisabled, isShotBlocked, isWallBetween, resistsDisplacement, resolveBaseStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
import { CRIT_MULTIPLIER, resolveDamage } from "../rules/damage.js";
import { drawValue } from "./rng.js";
import { chebyshevDistance, getLegalMoves, positionKey } from "../rules/movement.js";
import { applyStatus, isStunned, reflectsStatus, resolveStatusEffect, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";
import { alliesInRadius, getGlobalHealBonus, getGlobalStatusChanceMultiplier, getGlobalTrueTick, getStanceEffect, isDamageTypeImmuneByStance } from "../rules/stances.js";

const ERR = Object.freeze({
  INVALID_COMMAND: "INVALID_COMMAND",
  NOT_ACTIVE_PLAYER: "NOT_ACTIVE_PLAYER",
  UNIT_NOT_FOUND: "UNIT_NOT_FOUND",
  UNIT_NOT_OWNED: "UNIT_NOT_OWNED",
  UNIT_DEAD: "UNIT_DEAD",
  UNIT_SPENT: "UNIT_SPENT",
  ACTIVATION_ALREADY_OPEN: "ACTIVATION_ALREADY_OPEN",
  NO_ACTIVATION: "NO_ACTIVATION",
  WRONG_ACTIVE_UNIT: "WRONG_ACTIVE_UNIT",
  MOVE_ALREADY_USED: "MOVE_ALREADY_USED",
  MOVE_OUT_OF_RANGE: "MOVE_OUT_OF_RANGE",
  CANCEL_NOT_AVAILABLE: "CANCEL_NOT_AVAILABLE",
  PRIMARY_ALREADY_USED: "PRIMARY_ALREADY_USED",
  INVALID_TARGET: "INVALID_TARGET",
  TARGET_OUT_OF_RANGE: "TARGET_OUT_OF_RANGE",
  ART_NOT_AVAILABLE: "ART_NOT_AVAILABLE",
  TARGET_OBSTRUCTED: "TARGET_OBSTRUCTED",
  INVALID_ART_PATH: "INVALID_ART_PATH",
  FINISH_REQUIRES_ACTION: "FINISH_REQUIRES_ACTION",
  SUMMON_LIMIT: "SUMMON_LIMIT",
  // The King must issue his command before any other unit of his owner may act…
  KING_MUST_ACT_FIRST: "KING_MUST_ACT_FIRST",
  // …and the King himself may only command — never move, attack, or defend.
  COMMANDER_CANNOT_ACT: "COMMANDER_CANNOT_ACT"
});

const reject = (errorCode) => ({ accepted: false, errorCode });
const MAX_STUN_FAST_FORWARD_ROLLOVERS = 32;
// Surface any rollover side-effects (fire-tile burns) the turn flip queued onto the
// state, then clear them so they never persist into the returned state or a clone.
const accept = (nextState, events = []) => {
  // Every accepted command bumps the monotonic revision (the online lockstep
  // sequence key). This is the single increment point — all accepted paths return
  // through here — and it is excluded from the state hash (see core/state-hash.js).
  nextState.revision = (nextState.revision ?? 0) + 1;
  const rollover = nextState.pendingRolloverEvents;
  if (rollover) delete nextState.pendingRolloverEvents;
  return { accepted: true, nextState, events: rollover ? [...events, ...rollover] : events };
};

// Apply a rolled status, honoring Stone Body reflection: a status TARGETED at a
// reflecting unit (Gargoyle) is issued to the OFFENDER instead of the target. One roll,
// one application — `rollValue`/`chanceMultiplier` pass straight through to
// resolveStatusEffect. Returns the effect result plus `reflected` so the caller can
// report it. The recipient's statuses are written here; the caller reads no statuses.
function applyRolledStatus(target, effect, rollValue, offender, chanceMultiplier = 1) {
  const recipient = (offender && offender.id !== target.id && reflectsStatus(target)) ? offender : target;
  const result = resolveStatusEffect(recipient, effect, rollValue, chanceMultiplier);
  if (result.statuses) { recipient.statuses = result.statuses; }
  delete result.statuses;
  // Only tag a reflection when it actually happened, so the common (non-reflect) event
  // shape stays identical to the pre-Stone-Body reducer.
  if (recipient.id !== target.id) result.reflected = true;
  return result;
}

export function applyCommand(state, command) {
  const result = dispatchCommand(state, command);
  // A single reconciliation seam runs after EVERY accepted command, diffing the input
  // state against the result to catch every unit that fell or was revived — regardless
  // of which resolver or turn-rollover hazard (fire/poison/black-death/time-steal) did
  // it — and applies the King's reactive HP swings. Deterministic (no RNG), so online
  // lockstep clients all compute the identical reaction.
  if (result.accepted) applyCommanderReactions(state, result.nextState, result.events);
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

// True while this player owns a living, not-yet-commanded acts-first King (the King).
// He is forced to issue his command before any of his squadmates may begin — so a King
// waiting on his command blocks the rest of his owner's turn. A player with no King is
// never gated. `commandTurn !== turnNumber` means "hasn't commanded THIS turn".
function commanderPending(state, player) {
  return state.units.some((unit) =>
    unit.hp > 0 && unit.player === player &&
    getUnitType(unit.type).actsFirst &&
    unit.commandTurn !== state.turnNumber);
}

function validateOwnedLivingUnit(state, player, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit) return { error: ERR.UNIT_NOT_FOUND };
  if (unit.player !== player) return { error: ERR.UNIT_NOT_OWNED };
  if (unit.hp <= 0) return { error: ERR.UNIT_DEAD };
  return { unit };
}

function validateOpenActivation(state, player, unitId) {
  if (player !== state.currentPlayer) return { error: ERR.NOT_ACTIVE_PLAYER };
  if (!state.activation) return { error: ERR.NO_ACTIVATION };
  if (state.activation.unitId !== unitId) return { error: ERR.WRONG_ACTIVE_UNIT };
  return validateOwnedLivingUnit(state, player, unitId);
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
    bonusActionGroups: []
  };
  // Volcanic Rage (Gargoyle): every Nth raging activation, erupt a free Pyroclasm BEFORE
  // the turn opens. It spends no MP and no action — the Gargoyle still takes its full turn.
  // Fired here (deterministic, no roll — magic AoE) so online lockstep clients all agree.
  const events = [{ type: "ACTIVATION_BEGAN", unitId: unit.id }];
  const freeCast = fresh ? getRageEffectValue(unit, "freePyroclasm", null) : null;
  if (freeCast && isRaging(unit)) {
    unit.volcanicCounter = (unit.volcanicCounter ?? 0) + 1;
    if (unit.volcanicCounter % Math.max(1, freeCast.every ?? 3) === 0) {
      const art = getArt(unit.type, freeCast.artId);
      if (art) {
        const { targetIds, damageByTarget } = applyPyroclasmDamage(next, unit, art);
        resolveVictory(next);
        if (next.phase !== "playing") next.activation = null; // the eruption ended the match
        events.push({ type: "PYROCLASM_ERUPT", actorId: unit.id, targetIds, damageByTarget });
      }
    }
  }
  return accept(next, events);
}

// Shared Pyroclasm damage: 5 magic to every enemy on any of the 8 straight rays within
// range. Magic honors Defend halving, Dead Zone team reduction, Black Death immunity,
// and Bruiser-Mode magic vulnerability — exactly like resolveNuke, so a manual cast and
// the free Volcanic-Rage eruption resolve identically. Mutates `state`; returns the hit
// set for the event. Does NOT resolve victory (the caller does, after).
function applyPyroclasmDamage(state, actor, art) {
  const damageByTarget = {};
  const targetIds = [];
  for (const target of getPyroclasmTargets(state, actor, art)) {
    const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const reduced = isDamageTypeImmuneByStance(target, "magic")
      ? 0
      : Math.max(0, result.damage - getTeamDamageReduction(target, state, "magic"));
    const damage = reduced > 0 ? reduced + getSelfMagicVulnerability(target) : reduced;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    if (dealt > 0 || damage > 0) { targetIds.push(target.id); damageByTarget[target.id] = damage; }
  }
  return { targetIds, damageByTarget };
}

function moveUnit(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.moved) return reject(ERR.MOVE_ALREADY_USED);
  if (!getLegalMoves(state, result.unit).has(positionKey(command.position))) return reject(ERR.MOVE_OUT_OF_RANGE);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const from = { ...unit.position };
  unit.position = { ...command.position };
  next.activation.moved = true;
  return accept(next, [{ type: "UNIT_MOVED", unitId: unit.id, from, to: { ...unit.position } }]);
}

function cancelMove(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.moved) return reject(ERR.CANCEL_NOT_AVAILABLE);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const restoredTo = { ...next.activation.origin };
  unit.position = restoredTo;
  next.activation.moved = false;

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
  // A PHYSICAL basic attack is body-blocked by any unit in between (melee never has an
  // intervening tile, so this is a no-op at range 1); a magic basic attack (Angel's
  // Blessed Arrow) reaches through bodies. A wall between blocks EITHER (walls stop
  // everything — see isWallBetween). Read the damage type once, reused for the strike.
  const basicDamageType = getBasicAttackDamageType(result.unit);
  if ((basicDamageType === "physical" && isShotBlocked(state, result.unit.position, target.position, result.unit)) ||
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
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll }, ...triggerEvents]);
  }
  const targets = getLineAttackTargets(next, actor, nextTarget);
  const targetIds = [];
  const damageByTarget = {};
  let totalDamageDealt = 0;
  let primaryDamage = null;
  // Blessed Arrow: a critical basic attack also lands a status (blind) on each surviving
  // target. Immunity is enforced by applyStatus, so a status-immune target simply resists.
  const critStatus = getCritOnHitStatus(actor);
  const blinded = [];
  const strike = (unit) => resolveBaseStrike(actor, unit, { proximity: true, critical: swing.critical, state: next, damageType: basicDamageType });
  for (const targetUnit of targets) {
    const damage = strike(targetUnit);
    const damageDealt = Math.min(targetUnit.hp, damage.damage);
    targetUnit.hp = Math.max(0, targetUnit.hp - damage.damage);
    targetIds.push(targetUnit.id);
    damageByTarget[targetUnit.id] = damage.damage;
    totalDamageDealt += damageDealt;
    if (swing.critical && critStatus && targetUnit.hp > 0) {
      const applied = applyStatus(targetUnit, { type: critStatus.status, duration: critStatus.duration });
      if (applied.applied) { targetUnit.statuses = applied.statuses; blinded.push(targetUnit.id); }
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
  resolveVictory(next);
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, targetIds, damageByTarget,
    ...(blinded.length ? { blinded } : {}), ...damageFields
  }, ...triggerEvents, ...healingEvents, ...retaliationEvents]);
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
  findUnit(next, command.unitId).defending = true;
  next.activation.primaryUsed = true;
  return accept(next, [{ type: "UNIT_DEFENDED", unitId: command.unitId }]);
}

// New art mechanics register here instead of adding branches to useArt.
// Default (targeted attack + optional status/heal effect) needs no entry.
const ART_RESOLVERS = new Map([
  ["footwork", resolveFootwork],
  ["volley-shot", resolveVolleyShot],
  ["pray", resolveHealAllies],
  ["wish", resolveHealAllies],
  ["silence", resolveStatusCast],
  ["smoke-bomb", resolveStatusCast],
  ["flee", resolveFlee],
  ["nuke", resolveNuke],
  ["dark-bomb", resolveNuke],
  ["summon-ghoul", resolveSummonGhoul],
  ["build-cover", resolveBuildCover],
  ["throw-cigar", resolveThrowCigar],
  ["lightseeker", resolveTilePulse],
  ["darkseeker", resolveTilePulse],
  ["heavenseeker", resolveTilePulse],
  // Angel: a friendly-only buff cast and a white-tile team heal.
  ["anoint", resolveAnoint],
  ["elevate", resolveHealAllies],
  // Witch Doctor dances: each fires a one-shot team/global effect then enters its
  // stance (the "Dancing Man" passive). One resolver branches on the art's data.
  ["rain-dance", resolveWitchDance],
  ["fire-dance", resolveWitchDance],
  ["spirit-dance", resolveWitchDance],
  ["misfortune-dance", resolveWitchDance],
  ["black-death-dance", resolveWitchDance],
  // Father Time: ally-OR-enemy utility casts + a revive.
  ["age", resolveAge],
  ["time-stretch", resolveTimeStretch],
  ["rewind", resolveRewind],
  // Juggernaut: line grab/strike, a self MP vent, and a self-sacrifice blast.
  ["tether-grab", resolveTetherGrab],
  ["rocket-punch", resolveRocketPunch],
  ["recharge", resolveRecharge],
  ["self-destruct", resolveSelfDestruct],
  // King: the four global commands all record the command and spend the activation; the
  // buff itself is a live fold (getCommandBuffStats), so the resolver stores no numbers.
  ["strike", resolveKingCommand],
  ["hold", resolveKingCommand],
  ["pursue", resolveKingCommand],
  ["higher-ground", resolveKingCommand],
  // Monk: fixed-power kick with conditional knockback, and an ally guard reposition.
  ["front-kick", resolveFrontKick],
  ["protect", resolveProtect],
  // Gargoyle: fly-then-blast reposition, and a self-centred line burst.
  ["flight", resolveFlight],
  ["pyroclasm", resolvePyroclasm]
]);

function useArt(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!canUseArt(state, result.unit, command.artId)) return reject(ERR.ART_NOT_AVAILABLE);
  const art = getArt(result.unit.type, command.artId);
  const resolver = ART_RESOLVERS.get(art.id) ?? resolveTargetedArt;
  return resolver(state, command, art);
}

function resolveFootwork(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!validateFootworkPath(state, actorState, command.path)) return reject(ERR.INVALID_ART_PATH);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const harmed = [];
  for (const step of command.path) {
    const target = unitAt(next, step);
    if (target && areEnemies(actor, target)) {
      target.hp = Math.max(0, target.hp - FOOTWORK_DAMAGE);
      harmed.push(target.id);
    }
  }
  actor.position = { ...command.path.at(-1) };
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: command.path.map((step) => ({ ...step })),
    harmed,
    mpCost: art.mpCost
  }]);
}

function resolveTargetedArt(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // ARTS that resolve as a physical strike (Poison Arrow, Leg Shot) are body-blocked
  // just like a basic attack; magic ARTS (Spark, Banish) reach their target directly.
  // A wall, however, blocks BOTH physical and magic ARTS (only the Sniper pierces it).
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }
  if ((art.damageType ?? "physical") === "physical" && isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.mp -= art.mpCost;

  // ART attacks roll to-hit like a basic attack (the ART's own status/heal check is
  // a SECOND, separate roll below). A missed swing deals no damage and lands no
  // effect, but the ART is still spent — you committed the activation and the MP.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    return accept(next, [{ type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: art.mpCost, hit: false, missed: true, roll: swing.hitRoll }]);
  }

  if (art.damageType === "magic") next.activation.spellUsed = true;

  // Targeted attack ARTS resolve via the attacker's base strike type. `art.damageType`
  // overrides to magic for ARTS like Spark and Banish (magic ignores proximity bonuses).
  const damage = resolveBaseStrike(actor, target, { proximity: true, critical: swing.critical, state: next, damageType: art.damageType ?? null });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);

  let effect = null;
  if (art.effect?.type === "status" && target.hp > 0) {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
    // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
    effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));
  } else if (art.effect?.type === "heal") {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const successful = roll.value >= 0 && roll.value < art.effect.chance;
    // Rain Stance's global heal bonus rides on a successful heal; a raging Juggernaut's
    // Null Zone shuts all healing off (isHealingDisabled) regardless of the roll.
    const healing = (successful && !isHealingDisabled(next)) ? Math.round(damage.damage / 2) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor) : 0;
    actor.hp = Math.min(getEffectiveStats(actor, next).maxHp, actor.hp + healing);
    effect = { attempted: true, applied: successful, healing };
  }

  const healingEvents = damage.type === "physical" ? resolvePhysicalDamageHealing(next, actor, damageDealt) : [];
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: art.mpCost,
    hit: true,
    critical: swing.critical,
    roll: swing.hitRoll,
    damage,
    ...(effect ? { effect } : {})
  }, ...healingEvents]);
}

function resolveFlee(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const legal = getLegalFleeTiles(state, actorState);
  if (!command.targetPosition || !legal.has(positionKey(command.targetPosition))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  actor.position = { ...command.targetPosition };
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: [from, { ...command.targetPosition }],
    mpCost: art.mpCost
  }]);
}

function resolveNuke(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const damageByTarget = {};
  const targetIds = [];

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    // Black Death Stance nulls magic damage; otherwise Dead Zone-style team reduction
    // trims the final magic number, and Bruiser Mode adds +1 to a landed hit.
    const reduced = isDamageTypeImmuneByStance(target, "magic")
      ? 0
      : Math.max(0, result.damage - getTeamDamageReduction(target, next, "magic"));
    const damage = reduced > 0 ? reduced + getSelfMagicVulnerability(target) : reduced;
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  actor.mp -= art.mpCost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    mpCost: art.mpCost
  }]);
}

// Flight (Gargoyle): fly onto a chosen empty tile within (Move + 1) Chebyshev spaces,
// then deal a small TRUE blast to every enemy within `blastRadius` of the landing tile
// (true damage ignores DEF and Defend). Spends MP + the whole activation like any ART.
function resolveFlight(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFlightTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  actor.position = { ...placement };
  actor.mp -= art.mpCost;

  const radius = art.blastRadius ?? 1;
  const amount = art.damage?.amount ?? 0;
  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id,
    path: [from, { ...placement }], targetIds, damageByTarget, mpCost: art.mpCost
  }]);
}

// Pyroclasm (Gargoyle): a self-centred line burst — 5 magic to every enemy standing on
// any of the 8 straight rays within range (a wall/edge stops a ray; a body does NOT).
// Shares the magic-damage math with the free Volcanic-Rage eruption (applyPyroclasmDamage).
function resolvePyroclasm(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const { targetIds, damageByTarget } = applyPyroclasmDamage(next, actor, art);
  actor.mp -= art.mpCost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget, mpCost: art.mpCost
  }]);
}

// A summoned piece is a full unit object (same shape createUnit produces) plus a
// `summonerId` so the per-Necromancer summon cap can find it. It spawns already
// `spent` so the turn loop never offers it an activation.
function createSummon(id, type, player, team, position, summonerId) {
  const definition = getUnitType(type);
  return {
    id,
    player,
    team,
    type,
    position: { ...position },
    hp: definition.stats.maxHp,
    mp: definition.stats.maxMp,
    statModifiers: {},
    statuses: [],
    linkedStatMods: [],
    defending: false,
    spent: true,
    mageChargeCount: 0,
    stance: null,
    rainCharged: 0,
    summonerId
  };
}

function resolveSummonGhoul(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getSummonPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const maxActive = art.summon?.maxActive ?? 1;
  const activeSummons = state.units.filter((unit) => unit.hp > 0 && unit.summonerId === actorState.id).length;
  if (activeSummons >= maxActive) {
    return reject(ERR.SUMMON_LIMIT);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  // Unique id across this Necromancer's whole summon history (dead Ghouls stay in
  // the units array), so findUnit never collides with a previous corpse.
  const seq = next.units.filter((unit) => unit.summonerId === actor.id).length;
  const ghoulId = `${actor.id}-${art.summon.type}-${seq}`;
  const ghoul = createSummon(ghoulId, art.summon.type, actor.player, teamOfUnit(actor), placement, actor.id);
  next.units.push(ghoul);
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    summonedUnitId: ghoulId,
    position: { ...placement },
    mpCost: art.mpCost
  }]);
}

// Build Cover: drop a destructible wall on a clear tile within range. Spends the
// activation and MP like any active ART; the wall lives in state.tileObjects.
function resolveBuildCover(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getWallPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "wall", hp: art.wall?.hp ?? 1 };
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: art.mpCost
  }]);
}

// Throw Cigar: set a tile alight within range (an occupied tile is allowed — fire at
// the target's feet). The fire burns at every rollover via applyFireTick.
function resolveThrowCigar(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFirePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "fire", turnsLeft: art.fire?.turns ?? 3 };
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: art.mpCost
  }]);
}

function resolveTilePulse(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targets = getTilePulseTargets(next, actor, art);
  const targetIds = [];
  const damageByTarget = {};
  const amount = Math.max(0, Number(art.effect.amount) || 0);

  for (const target of targets) {
    const damage = Math.min(target.hp, amount);
    if (damage <= 0) continue;
    target.hp = Math.max(0, target.hp - amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  // Optional heal rider (Angel's Heavenseeker): allies standing on the pulse's affinity
  // tile also restore HP. Reuses the same tile-affinity + heal plumbing as the damage
  // side, and honors the global heal bonus / healing lockout like every other heal site.
  const healTargetIds = [];
  const healingByTarget = {};
  if (art.effect.heal) {
    const healAmount = isHealingDisabled(next)
      ? 0
      : Math.max(0, Number(art.effect.heal.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    if (healAmount > 0) {
      for (const ally of livingTeamUnits(next, actor)) {
        if (getTileAffinity(next, ally.position) !== art.effect.affinity) continue;
        if (!art.effect.global && chebyshevDistance(actor.position, ally.position) > (art.effect.range ?? 0)) continue;
        const before = ally.hp;
        ally.hp = Math.min(getEffectiveStats(ally, next).maxHp, ally.hp + healAmount);
        const healed = ally.hp - before;
        if (healed <= 0) continue;
        healTargetIds.push(ally.id);
        healingByTarget[ally.id] = healed;
      }
    }
  }

  actor.mp -= art.mpCost;
  if (art.bonusActionGroup) {
    next.activation.bonusActionGroups = [
      ...(next.activation.bonusActionGroups ?? []),
      art.bonusActionGroup
    ];
  } else {
    spendAndAdvance(next, actor);
  }
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    ...(healTargetIds.length ? { healTargetIds, healingByTarget } : {}),
    mpCost: art.mpCost,
    bonusActionGroup: art.bonusActionGroup ?? null
  }]);
}

function resolveHealAllies(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  actor.mp -= art.mpCost;
  const healingByTarget = {};
  const targetIds = [];
  // Rain Stance's global heal bonus lifts every heal on the board (Pray/Wish too); a
  // raging Juggernaut's Null Zone zeroes all healing.
  const amount = isHealingDisabled(next) ? 0 : Math.max(0, Number(art.effect.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);

  for (const target of livingTeamUnits(next, actor)) {
    if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
    // Tile-affinity-gated heal (Angel's Elevate: only allies on a white/light tile).
    if (art.effect.affinity && getTileAffinity(next, target.position) !== art.effect.affinity) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (healed <= 0) continue;
    targetIds.push(target.id);
    healingByTarget[target.id] = healed;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    healingByTarget,
    mpCost: art.mpCost
  }]);
}

// Anoint: a friendly-only buff (Angel grants an ally +1 range for 1 turn). Cannot target
// self or an enemy; a wall does NOT block a friendly cast (same as a friendly Time
// Stretch haste). Reuses the `empowered` status lifecycle.
function resolveAnoint(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.mp -= art.mpCost;

  const result = applyStatus(target, {
    type: art.effect.status,
    duration: art.effect.durationTurns,
    ...(art.effect.statModifiers ? { statModifiers: { ...art.effect.statModifiers } } : {})
  });
  if (result.applied) target.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: art.mpCost,
    effect: { status: art.effect.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

// "+1 STR" / "+2 STR / +1 DEF / +1 MOVE" — turns a statModifiers object into the
// label the view floats over a buffed unit. Kept here (not in the view layer) so
// the wording can never drift from the actual numbers applied above.
const STAT_MODIFIER_ABBR = Object.freeze({ strength: "STR", defense: "DEF", moveRange: "MOVE", attackRange: "RNG", maxHp: "HP", maxMp: "MP" });
function formatStatModifierLabel(statModifiers) {
  return Object.entries(statModifiers ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${value > 0 ? "+" : ""}${value} ${STAT_MODIFIER_ABBR[key] ?? key.toUpperCase()}`)
    .join(" / ");
}

function resolveWitchDance(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  actor.mp -= art.mpCost;
  const event = {
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: art.mpCost,
    stance: art.stance
  };

  if (art.effect?.type === "healAllies") {
    const amount = isHealingDisabled(next) ? 0 : Math.max(0, Number(art.effect.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    const healingByTarget = {};
    const targetIds = [];
    for (const target of livingTeamUnits(next, actor)) {
      if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
      const before = target.hp;
      target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + amount);
      const healed = target.hp - before;
      if (healed <= 0) continue;
      targetIds.push(target.id);
      healingByTarget[target.id] = healed;
    }
    event.targetIds = targetIds;
    event.healingByTarget = healingByTarget;
  }

  if (art.teamBuff) {
    const buffed = [];
    for (const target of livingTeamUnits(next, actor)) {
      const result = applyStatus(target, {
        type: "empowered",
        duration: art.teamBuff.durationTurns,
        statModifiers: { ...(art.teamBuff.statModifiers ?? {}) }
      });
      if (!result.applied) continue;
      target.statuses = result.statuses;
      buffed.push(target.id);
    }
    event.buffed = buffed;
    event.buffLabel = formatStatModifierLabel(art.teamBuff.statModifiers);
  }

  if (art.teamMp) {
    const restoredByTarget = {};
    for (const target of livingTeamUnits(next, actor)) {
      const before = target.mp;
      target.mp = Math.min(getEffectiveStats(target, next).maxMp, target.mp + art.teamMp.amount);
      const restored = target.mp - before;
      if (restored > 0) restoredByTarget[target.id] = restored;
    }
    event.restoredByTarget = restoredByTarget;
  }

  if (art.cleanse?.scope === "all") {
    const cleansed = [];
    for (const target of livingUnits(next)) {
      if (!target.statuses?.length) continue;
      target.statuses = [];
      cleansed.push(target.id);
    }
    event.cleansed = cleansed;
  }

  if (art.selfBuff) {
    // +1 duration so the buff SURVIVES this activation's own end-of-turn tick (the
    // dance spends the Witch Doctor's turn) and is live on his NEXT turn — otherwise
    // "+2 STR / +1 DEF / +1 MOVE for 1 turn" would be ticked to nothing before it
    // could ever be used. Ally buffs (teamBuff) need no bonus: the caster's tick
    // doesn't touch an ally's statuses, so they already get one buffed activation.
    const result = applyStatus(actor, {
      type: "empowered",
      duration: (art.selfBuff.durationTurns ?? 1) + 1,
      statModifiers: { ...(art.selfBuff.statModifiers ?? {}) }
    });
    if (result.applied) {
      actor.statuses = result.statuses;
      event.selfBuffed = true;
      event.selfBuffLabel = formatStatModifierLabel(art.selfBuff.statModifiers);
    }
  }

  if (art.globalStatus) {
    const statusTargets = [];
    for (const target of livingUnits(next)) {
      const result = applyStatus(target, {
        type: art.globalStatus.status,
        duration: art.globalStatus.durationTurns
      });
      if (!result.applied) continue;
      target.statuses = result.statuses;
      statusTargets.push(target.id);
    }
    event.statusTargets = statusTargets;
  }

  // Every dance is a global effect (team-wide or board-wide, never a single-target
  // cast), so the view sweeps a beacon pulse across every unit the ritual actually
  // reaches — a cleanse/global-status dance reaches everyone on the board, a
  // team-scoped dance (heal/buff/MP) reaches only the caster's living squad — so
  // the animation's reach can never drift from what the effect actually touched.
  event.beaconTargetIds = (art.cleanse?.scope === "all" || art.globalStatus
    ? livingUnits(next)
    : livingTeamUnits(next, actor)
  ).map((unit) => unit.id);

  actor.stance = art.stance ?? null;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [event]);
}

function resolveStatusCast(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks a pure cast (Silence) just like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.mp -= art.mpCost;

  const roll = drawValue(next.rngState, command.effectRoll);
  next.rngState = roll.rngState;
  // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
  // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
  const effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: art.mpCost,
    effect: { ...effect, status: art.effect.status }
  }]);
}

function resolveVolleyShot(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const cells = getVolleyShotCells(state, actorState, command.targetPosition);
  if (!cells) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targetIds = [];
  const damageByTarget = {};
  for (const position of cells) {
    const target = unitAt(next, position);
    if (!target || !areEnemies(actor, target)) continue;
    const damage = art.damage.amount + getProximityBonus(actor, target);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetPosition: { ...command.targetPosition },
    targetIds,
    damageByTarget,
    mpCost: art.mpCost
  }]);
}

// Age: place a SOURCE-LINKED persistent stat modifier on a target in range. On an ally
// it's a buff (+amount), on an enemy a debuff (-amount); the stat (strength|defense)
// rides on the command from the stat-picker UI (defaults to strength). The modifier
// lives on the target's `linkedStatMods` and is folded by getEffectiveStats only while
// Father Time is alive — so it "lasts until Father Time is defeated" with no cleanup.
function resolveAge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks the cast like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const stat = command.stat === "defense" ? "defense" : "strength";
  const amount = Math.max(1, Number(art.effect?.amount) || 1);
  const delta = areEnemies(actorState, targetState) ? -amount : amount;

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  target.linkedStatMods = [...(target.linkedStatMods ?? []), { sourceId: actor.id, stats: { [stat]: delta } }];
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: art.mpCost, stat, delta
  }]);
}

// Time Stretch: an ally-OR-enemy timed status. Ally → an `empowered` +MOVE buff; enemy
// → a `slow` -MOVE debuff. No damage and no roll — it always attempts (immunity is
// still respected centrally, so a Slow-immune enemy simply resists).
function resolveTimeStretch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const enemy = areEnemies(actorState, targetState);
  // Slowing an enemy is a ranged ability, so a wall blocks it; a friendly haste is not
  // shot-gated.
  if (enemy && isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.mp -= art.mpCost;

  const spec = enemy ? art.enemy : art.ally;
  // Stone Body reflects a slow (the enemy branch) back onto Father Time; a friendly
  // haste is never reflected.
  const recipient = (enemy && reflectsStatus(target)) ? actor : target;
  const result = applyStatus(recipient, {
    type: spec.status,
    duration: spec.durationTurns,
    ...(spec.statModifiers ? { statModifiers: { ...spec.statModifiers } } : {})
  });
  if (result.applied) recipient.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: art.mpCost,
    effect: { status: spec.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

// Rewind (RAGE): return a fallen ally to the board on a chosen tile within range, fully
// healed with statuses cleared. Its MP is NOT restored. The revived unit is placed
// already `spent` so the revival doesn't hand its owner a bonus activation this round.
function resolveRewind(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const target = getReviveTargets(state, actorState).find((unit) => unit.id === command.targetId);
  if (!target) return reject(ERR.INVALID_TARGET);
  const placement = command.targetPosition;
  if (!placement || !getRevivePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const revived = findUnit(next, command.targetId);
  revived.position = { ...placement };
  revived.statuses = [];
  revived.defending = false;
  revived.hp = getEffectiveStats(revived, next).maxHp;
  revived.spent = true;
  actor.mp -= art.mpCost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, revivedUnitId: revived.id, position: { ...placement }, mpCost: art.mpCost
  }]);
}

// Tether Grab: grab the first ally OR enemy on a straight ray within range and haul them
// to the tile one step from the Juggernaut along that ray. An enemy also takes 3 magic
// damage; an ally is only repositioned. The tiles between are empty (it was the first
// contact), so the pull destination is always clear.
function resolveTetherGrab(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const line = getLineTargets(state, actorState, art.targeting.range, { includeAllies: true });
  const hit = line.find((entry) => entry.unit.id === command.targetId);
  if (!hit) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art);
  actor.mp -= cost;

  const grabsEnemy = areEnemies(actor, target);

  // Grabbing an ENEMY rolls to-hit like any attacking ART: a whiff hauls no one and
  // deals no damage (the tether misses), though the ART is still spent. An ally grab is
  // pure repositioning — allies are never rolled against, so it always lands.
  let swing = null;
  if (grabsEnemy) {
    swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
    next.rngState = swing.rngState;
    if (swing.missed) {
      spendAndAdvance(next, actor);
      resolveVictory(next);
      return accept(next, [{
        type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
        hit: false, missed: true, rolled: true, roll: swing.hitRoll, damage: 0, targetIds: [], damageByTarget: {}, mpCost: cost
      }]);
    }
  }

  // Stone Body: a displacement-immune target (Gargoyle) cannot be hauled — it stays put
  // and the grabber takes displacement-recoil TRUE damage. The grab's magic hit (below)
  // still lands; only the pull is negated.
  const immobile = resistsDisplacement(target);
  const destination = immobile
    ? { ...target.position }
    : { x: actor.position.x + hit.dir.x, y: actor.position.y + hit.dir.y };
  const from = { ...target.position };
  target.position = { ...destination };

  const damageByTarget = {};
  const targetIds = [];
  let damage = 0;
  if (grabsEnemy) {
    // A landed grab crits like any strike — the fixed 3 scales ×1.5 before the reduction
    // fold (magic ignores DEF; Tether Grab does not halve under Defend).
    const baseAmount = swing.critical ? Math.ceil(art.damage.amount * CRIT_MULTIPLIER) : art.damage.amount;
    const reduced = isDamageTypeImmuneByStance(target, "magic")
      ? 0
      : Math.max(0, baseAmount - getTeamDamageReduction(target, next, "magic"));
    damage = reduced > 0 ? reduced + getSelfMagicVulnerability(target) : reduced;
    if (damage > 0) {
      target.hp = Math.max(0, target.hp - damage);
      damageByTarget[target.id] = damage;
      targetIds.push(target.id);
    }
  }

  const stoneEvents = [];
  if (immobile && target.hp > 0) {
    const retaliation = getDisplacementRetaliation(target);
    if (retaliation > 0) {
      const dealt = Math.min(actor.hp, retaliation);
      actor.hp = Math.max(0, actor.hp - retaliation);
      if (dealt > 0) stoneEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: target.id, damage: dealt });
    }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, damage, hit: true, rolled: grabsEnemy, critical: Boolean(swing?.critical),
    displaced: !immobile, targetIds, damageByTarget, mpCost: cost
  }, ...stoneEvents]);
}

// Rocket Punch: a fixed-power physical strike on the first ENEMY on a straight ray within
// range (an ally on the ray blocks the shot, so the plan is never legal). It rolls to-hit
// like any attacking ART — a miss deals no damage AND rolls no stun (the whole punch
// whiffs), though the ART is still spent. On a landing hit Defense reduces it and Defend
// halves it (a crit scales ×1.5 first), then a SEPARATE 30% roll stuns a survivor 1 turn.
function resolveRocketPunch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const line = getLineTargets(state, actorState, art.targeting.range, { includeAllies: false });
  const hit = line.find((entry) => entry.unit.id === command.targetId);
  if (!hit) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, stunned: false, mpCost: cost
    }]);
  }

  const result = resolveDamage({
    attacker: { strength: art.damage.amount },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical",
    critical: swing.critical
  });
  const damage = result.damage;
  target.hp = Math.max(0, target.hp - damage);

  let effect = null;
  if (target.hp > 0) {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    // Stone Body reflects the stun back onto the Juggernaut (applyRolledStatus).
    effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, stunned: Boolean(effect?.applied && !effect.reflected), mpCost: cost
  }]);
}

function knockbackDestination(state, target, direction, distance) {
  let destination = { ...target.position };
  for (let step = 1; step <= distance; step += 1) {
    const next = { x: target.position.x + direction.x * step, y: target.position.y + direction.y * step };
    if (next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size) break;
    if (isWallAt(state, next) || unitAt(state, next)) break;
    destination = next;
  }
  return destination;
}

function resolveFrontKick(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState) ||
      isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, knockedBack: false, mpCost: cost
    }]);
  }

  const actorStats = getEffectiveStats(actor, next);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 10) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical",
    critical: swing.critical
  });
  const damage = result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);

  const direction = {
    x: Math.sign(targetState.position.x - actorState.position.x),
    y: Math.sign(targetState.position.y - actorState.position.y)
  };
  const shouldKnockback = target.hp > 0 && (swing.critical || getRageEffectValue(actor, "frontKickAlwaysKnockback", false));
  // Stone Body: a displacement-immune target (Gargoyle) is never knocked back — the kick
  // still deals its damage, but the recoil TRUE damage lands on the kicker instead.
  const immobile = resistsDisplacement(target);
  const stoneEvents = [];
  const from = { ...target.position };
  let to = { ...target.position };
  if (shouldKnockback && (direction.x !== 0 || direction.y !== 0)) {
    if (immobile) {
      const retaliation = getDisplacementRetaliation(target);
      if (retaliation > 0) {
        const dealt = Math.min(actor.hp, retaliation);
        actor.hp = Math.max(0, actor.hp - retaliation);
        if (dealt > 0) stoneEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: target.id, damage: dealt });
      }
    } else {
      to = knockbackDestination(next, target, direction, art.knockback?.distance ?? 3);
      target.position = { ...to };
    }
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, damage: { ...result, damage },
    knockedBack: shouldKnockback && (from.x !== to.x || from.y !== to.y),
    from, to, mpCost: cost
  }, ...healingEvents, ...stoneEvents]);
}

function resolveProtect(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areAllies(actorState, targetState) || targetState.id === actorState.id) {
    return reject(ERR.INVALID_TARGET);
  }
  const landing = [...getProtectLandingTiles(state, actorState, targetState, art)][0];
  if (!landing) return reject(ERR.INVALID_TARGET);
  const [x, y] = landing.split(",").map(Number);
  const destination = { x, y };

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const from = { ...actor.position };
  const cost = getArtMpCost(actor, art);
  actor.position = destination;
  actor.defending = true;
  target.defending = true;
  actor.mp -= cost;

  let healed = 0;
  const healAmount = Number(getRageEffectValue(actor, "protectHeal", 0)) || 0;
  if (healAmount > 0 && !isHealingDisabled(next)) {
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + healAmount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
    healed = target.hp - before;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, defended: [actor.id, target.id],
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    mpCost: cost
  }]);
}

// Recharge: vent the reactor. Restore MP up to full; if already at full MP, mend 1 HP
// instead — the mend is a heal, so a board-wide healing lockout (a raging Juggernaut's
// own Null Zone) shuts it off. Spends the activation like any ART.
function resolveRecharge(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const stats = getEffectiveStats(actor, next);
  let mpRestored = 0;
  let hpHealed = 0;
  if (actor.mp < stats.maxMp) {
    const before = actor.mp;
    actor.mp = Math.min(stats.maxMp, actor.mp + (art.restore?.mp ?? 0));
    mpRestored = actor.mp - before;
  } else if (!isHealingDisabled(next)) {
    const before = actor.hp;
    actor.hp = Math.min(stats.maxHp, actor.hp + (art.restore?.hpIfFull ?? 0));
    hpHealed = actor.hp - before;
  }
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpRestored, hpHealed, mpCost: getArtMpCost(actor, art)
  }]);
}

// Self Destruct (RAGE): overload the core for 10 TRUE damage to every enemy within the
// blast radius — ignoring DEF, Defend, and team reduction — at the cost of the
// Juggernaut's own life. Reuses the nukeAura targeting/preview; the caster is set to 0 HP.
function resolveSelfDestruct(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const dealt = Math.min(target.hp, art.damage.amount);
    target.hp = Math.max(0, target.hp - art.damage.amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }
  actor.mp -= getArtMpCost(actor, art);
  actor.hp = 0; // the core is spent — the Juggernaut is consumed
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    selfDestruct: true, mpCost: getArtMpCost(actor, art)
  }]);
}

// A King command (Strike/Hold/Pursue/Higher Ground): record which command is now active
// (and remember the one it replaced — Strike reads it for its Pursue bonus), stamp the
// turn it was issued on, and spend the activation. The actual team buff is folded live by
// getEffectiveStats/getCommandHealBonus/getCommandRangeBonus off this stored command, so
// nothing about the buff's magnitude is baked here — it tracks the board until the turn ends.
function resolveKingCommand(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  actor.previousCommand = actor.command ?? null;
  actor.command = art.command.id;
  actor.commandTurn = next.turnNumber;
  actor.mp -= getArtMpCost(actor, art); // 0 — commands are free
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, command: art.command.id, mpCost: 0
  }]);
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

function resolvePhysicalDamageHealing(state, actor, damageDealt) {
  const effect = getUnitType(actor.type).passive?.effect;
  if (effect?.type !== "physicalDamageHealAura" || damageDealt <= 0) return [];
  if (isHealingDisabled(state)) return []; // a raging Juggernaut's Null Zone shuts it off
  const base = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (base <= 0) return [];
  // Rain Stance's global heal bonus lifts this heal too ("all HP healing globally").
  const amount = base + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);

  const healingByTarget = {};
  for (const target of livingTeamUnits(state, actor)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > effect.radius) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (healed > 0) healingByTarget[target.id] = healed;
  }

  return Object.keys(healingByTarget).length
    ? [{ type: "HAND_OF_LIFE", actorId: actor.id, healingByTarget }]
    : [];
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

function spendAndAdvance(state, unit) {
  unit.statuses = tickStatuses(unit.statuses);
  unit.spent = true;

  const spellUsed = state.activation?.spellUsed ?? false;
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

function playerHasUnspentUnits(state, player) {
  return livingUnits(state, player).some((member) => takesTurns(member) && !member.spent);
}

function playerHasLivingTurnUnits(state, player) {
  return livingUnits(state, player).some(takesTurns);
}

function nextActivePlayer(state, fromPlayer) {
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
    // Board hazards resolve at the rollover, after the turn flips: fire burns whoever
    // stands on it and counts down. A burn can be lethal, so re-check victory. Burn
    // events are stashed on the state for accept() to surface (presentation only).
    const fireEvents = [];
    applyFireTick(state, fireEvents);
    // Black Death Stance burns EVERY living unit (allies and foes, the Witch Doctor
    // included) for 1 true damage at the same rollover. Lethal, so re-check victory.
    applyBlackDeathTick(state, fireEvents);
    // Father Time's Time Steal: each living Father Time drains nearby enemies and is
    // refunded MP for it, at the same rollover. Also lethal.
    applyTimeStealTick(state, fireEvents);
    resolveVictory(state);
    appendPendingRolloverEvents(state, fireEvents);
    appendPendingRolloverEvents(state, autoSpendStunnedUnits(state, state.currentPlayer));
  }
}

const FIRE_DAMAGE = 1;

// Throw Cigar fire: at every turn rollover, any unit (friend OR foe) standing on a
// fire tile takes 1 TRUE damage — it ignores DEF and Defend, so this subtracts HP
// directly. The fire then counts down and is removed once its turns run out. Board
// level, so it lives beside the rollover rather than in the per-unit status tick.
// Pushes a FIRE_DAMAGE event per burn so the view can voice + float it.
function applyFireTick(state, events) {
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const occupant = unitAt(state, { x, y });
    if (occupant) {
      const dealt = Math.min(occupant.hp, FIRE_DAMAGE);
      occupant.hp = Math.max(0, occupant.hp - FIRE_DAMAGE);
      if (dealt > 0) events.push({ type: "FIRE_DAMAGE", unitId: occupant.id, position: { x, y }, damage: dealt });
    }
    obj.turnsLeft -= 1;
    if (obj.turnsLeft <= 0) delete state.tileObjects[key];
  }
}

// Black Death Stance (Witch Doctor): while any living unit holds the stance, every
// living unit on the board — allies, foes, and the Witch Doctor himself — takes 1
// TRUE damage at each turn rollover. Board-level like the fire tick, and lethal, so
// the caller re-resolves victory after.
function applyBlackDeathTick(state, events) {
  const amount = getGlobalTrueTick(state);
  if (amount <= 0) return;
  for (const unit of livingUnits(state)) {
    const dealt = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (dealt > 0) events.push({ type: "BLACK_DEATH_DAMAGE", unitId: unit.id, damage: dealt });
  }
}

// Father Time's Time Steal (a `damageAura` passive): at every rollover, each living
// source deals its aura damage (true) to every enemy within its Chebyshev radius, then
// is refunded MP for the TOTAL damage it dealt (refundMpPerDamage per point). Board-
// level like the fire/black-death ticks, and lethal, so the caller re-resolves victory.
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

function resolveVictory(state) {
  // Defeat is decided by living units that can actually WIN, not raw bodies: a player
  // whose only survivor is a turn-less summon (a lone Ghoul) or a non-combatant commander
  // (a lone King) has lost and cannot stall — see unitCatalog.sustainsVictory.
  const livingTeams = new Set(livingUnits(state).filter(sustainsVictory).map(teamOfUnit));
  if (livingTeams.size === 1) {
    state.winner = [...livingTeams][0];
    state.phase = "complete";
    state.activation = null;
  }
}

// The King's Dictator/Spectator passive, applied centrally after every command. Diffs the
// pre-command state against the result: for each of the King's squadmates that newly FELL,
// the King loses `damagePerAllyFallen` and the rest of the squad rallies for `allyRallyHeal`
// (the King excluded); for each fallen ally REVIVED (Father Time's Rewind), the King regains
// `healPerAllyRevived`. Reactions are driven by Kings that were ALIVE when the falls happened
// (the pre-command snapshot), so a King finished off by the same blast still mourns his squad.
// Summons and other Kings don't count as "an allied unit"; a global healing lockout (a raging
// Juggernaut's Null Zone) suppresses the King's HP gains but never the damage.
function applyCommanderReactions(prevState, next, events) {
  const reactingKings = prevState.units.filter((u) => u.hp > 0 && isCommandOnly(u));
  if (!reactingKings.length) return;

  const wasAlive = new Map(prevState.units.map((u) => [u.id, u.hp > 0]));
  const isAlly = (unit) => takesTurns(unit) && !isCommandOnly(unit); // a real squad unit
  const fell = [];
  const revived = [];
  for (const unit of next.units) {
    if (!isAlly(unit) || !wasAlive.has(unit.id)) continue;
    const before = wasAlive.get(unit.id);
    if (before && unit.hp <= 0) fell.push(unit);
    else if (!before && unit.hp > 0) revived.push(unit);
  }
  if (!fell.length && !revived.length) return;

  const healingOff = isHealingDisabled(next);
  for (const kingBefore of reactingKings) {
    const king = findUnit(next, kingBefore.id);
    if (!king) continue;
    const effect = getUnitType(king.type).passive?.effect;
    const teamFell = fell.filter((u) => areAllies(u, king));
    const teamRevived = revived.filter((u) => areAllies(u, king));

    if (teamFell.length && effect?.damagePerAllyFallen) {
      const total = effect.damagePerAllyFallen * teamFell.length;
      const dealt = Math.min(king.hp, total);
      king.hp = Math.max(0, king.hp - total);
      if (dealt > 0) events.push({ type: "KING_MOURNS", kingId: king.id, damage: dealt, fallen: teamFell.map((u) => u.id) });
    }
    if (teamRevived.length && effect?.healPerAllyRevived && !healingOff) {
      const before = king.hp;
      king.hp = Math.min(getEffectiveStats(king, next).maxHp, king.hp + effect.healPerAllyRevived * teamRevived.length);
      const healed = king.hp - before;
      if (healed > 0) events.push({ type: "KING_RESTORED", kingId: king.id, healing: healed });
    }
  }

  // Rally: once per team that had a living King, heal the rest of that squad (Kings and
  // summons excluded) by allyRallyHeal for every ally that fell. Not a "heal ART", so
  // Hold's heal bonus doesn't touch it — it's the passive's own flat number.
  if (!healingOff) {
    const teamsWithKing = new Map(); // team -> allyRallyHeal
    for (const king of reactingKings) {
      const rally = getUnitType(king.type).passive?.effect?.allyRallyHeal ?? 0;
      const team = teamOfUnit(king);
      teamsWithKing.set(team, Math.max(teamsWithKing.get(team) ?? 0, rally));
    }
    for (const [team, rally] of teamsWithKing) {
      const falls = fell.filter((u) => teamOfUnit(u) === team).length;
      if (!falls || rally <= 0) continue;
      const rallied = [];
      for (const ally of next.units) {
        if (ally.hp <= 0 || teamOfUnit(ally) !== team || !isAlly(ally)) continue;
        const before = ally.hp;
        ally.hp = Math.min(getEffectiveStats(ally, next).maxHp, ally.hp + rally * falls);
        if (ally.hp > before) rallied.push(ally.id);
      }
      if (rallied.length) events.push({ type: "SQUAD_RALLY", team, healing: rally * falls, rallied });
    }
  }

  // A King finished off by his own mourning doesn't change victory (he never sustained
  // it), but re-resolve so a rally that outlives the last fighter can't be missed.
  resolveVictory(next);
}
