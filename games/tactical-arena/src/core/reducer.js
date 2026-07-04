import { COMMANDS } from "./commands.js";
import { getArt, getEffectiveStats, getUnitType, isDefending, takesTurns } from "./unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "./state.js";
import { canUseArt, FOOTWORK_DAMAGE, getFirePlacementTiles, getLegalFleeTiles, getSelfBlastRadius, getSummonPlacementTiles, getTilePulseTargets, getVolleyShotCells, getWallPlacementTiles, validateFootworkPath } from "../rules/arts.js";
import { getLineAttackTargets, getProximityBonus, getTeamDamageReduction, isShotBlocked, isWallBetween, resolveBaseStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
import { resolveDamage } from "../rules/damage.js";
import { drawValue } from "./rng.js";
import { chebyshevDistance, getLegalMoves, positionKey } from "../rules/movement.js";
import { applyStatus, isStunned, resolveStatusEffect, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";
import { alliesInRadius, getGlobalHealBonus, getGlobalTrueTick, getStanceEffect, getTeamStatusChanceMultiplier, isDamageTypeImmuneByStance } from "../rules/stances.js";

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
  SUMMON_LIMIT: "SUMMON_LIMIT"
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

export function applyCommand(state, command) {
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
  return accept(next, [{ type: "ACTIVATION_BEGAN", unitId: unit.id }]);
}

function moveUnit(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
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
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  // A wall is attacked by tile (no unit there); it resolves through its own path.
  if (command.targetPosition) return attackWall(state, command, result.unit);
  const target = findUnit(state, command.targetId);
  if (!target || target.hp <= 0 || !areEnemies(result.unit, target)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(result.unit.position, target.position) > getEffectiveStats(result.unit, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // Basic attacks are always physical, so a body between attacker and target blocks
  // the shot (melee never has an intervening tile, so this is a no-op at range 1).
  // A wall between also blocks it (and walls stop everything — see isWallBetween).
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
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll }, ...triggerEvents]);
  }
  const targets = getLineAttackTargets(next, actor, nextTarget);
  const targetIds = [];
  const damageByTarget = {};
  let totalDamageDealt = 0;
  let primaryDamage = null;
  for (const targetUnit of targets) {
    const damage = resolvePhysicalStrike(actor, targetUnit, { proximity: true, critical: swing.critical, state: next });
    const damageDealt = Math.min(targetUnit.hp, damage.damage);
    targetUnit.hp = Math.max(0, targetUnit.hp - damage.damage);
    targetIds.push(targetUnit.id);
    damageByTarget[targetUnit.id] = damage.damage;
    totalDamageDealt += damageDealt;
    if (targetUnit.id === nextTarget.id) primaryDamage = damage;
  }
  const damage = primaryDamage ?? resolvePhysicalStrike(actor, nextTarget, { proximity: true, critical: swing.critical, state: next });
  const healingEvents = resolvePhysicalDamageHealing(next, actor, totalDamageDealt);
  resolveVictory(next);
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, targetIds, damageByTarget, ...damageFields
  }, ...triggerEvents, ...healingEvents]);
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
  // Witch Doctor dances: each fires a one-shot team/global effect then enters its
  // stance (the "Dancing Man" passive). One resolver branches on the art's data.
  ["rain-dance", resolveWitchDance],
  ["fire-dance", resolveWitchDance],
  ["spirit-dance", resolveWitchDance],
  ["misfortune-dance", resolveWitchDance],
  ["black-death-dance", resolveWitchDance]
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
    // Misfortune Stance (a living ally of the caster) doubles the status chance.
    effect = resolveStatusEffect(target, art.effect, roll.value, getTeamStatusChanceMultiplier(next, actor));
    if (effect.statuses) target.statuses = effect.statuses;
    delete effect.statuses;
  } else if (art.effect?.type === "heal") {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const successful = roll.value >= 0 && roll.value < art.effect.chance;
    // Rain Stance's global heal bonus rides on a successful heal.
    const healing = successful ? Math.round(damage.damage / 2) + getGlobalHealBonus(next) : 0;
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
    // trims the final magic number.
    const damage = isDamageTypeImmuneByStance(target, "magic")
      ? 0
      : Math.max(0, result.damage - getTeamDamageReduction(target, next, "magic"));
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

// A summoned piece is a full unit object (same shape createUnit produces) plus a
// `summonerId` so the per-Necromancer summon cap can find it. It spawns already
// `spent` so the turn loop never offers it an activation.
function createSummon(id, type, player, position, summonerId) {
  const definition = getUnitType(type);
  return {
    id,
    player,
    type,
    position: { ...position },
    hp: definition.stats.maxHp,
    mp: definition.stats.maxMp,
    statModifiers: {},
    statuses: [],
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
  const ghoul = createSummon(ghoulId, art.summon.type, actor.player, placement, actor.id);
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
  // Rain Stance's global heal bonus lifts every heal on the board (Pray/Wish too).
  const amount = Math.max(0, Number(art.effect.amount) || 0) + getGlobalHealBonus(next);

  for (const target of livingUnits(next, actor.player)) {
    if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
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
    const amount = Math.max(0, Number(art.effect.amount) || 0) + getGlobalHealBonus(next);
    const healingByTarget = {};
    const targetIds = [];
    for (const target of livingUnits(next, actor.player)) {
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
    for (const target of livingUnits(next, actor.player)) {
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
  }

  if (art.teamMp) {
    const restoredByTarget = {};
    for (const target of livingUnits(next, actor.player)) {
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
  // Misfortune Stance (a living ally of the caster) doubles the status chance.
  const effect = resolveStatusEffect(target, art.effect, roll.value, getTeamStatusChanceMultiplier(next, actor));
  if (effect.statuses) target.statuses = effect.statuses;
  delete effect.statuses;

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
  const base = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (base <= 0) return [];
  // Rain Stance's global heal bonus lifts this heal too ("all HP healing globally").
  const amount = base + getGlobalHealBonus(state);

  const healingByTarget = {};
  for (const target of livingUnits(state, actor.player)) {
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
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
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
    next.currentPlayer = next.currentPlayer === 1 ? 2 : 1;
    next.turnNumber += 1;
    for (const member of livingUnits(next, next.currentPlayer)) if (takesTurns(member)) member.spent = false;
  }
  return accept(next, events);
}

function resolveVictory(state) {
  // Defeat is decided by living COMMANDERS, not raw bodies: a player whose only
  // survivor is a turn-less summon (a lone Ghoul) has lost and cannot stall.
  const livingPlayers = new Set(livingUnits(state).filter(takesTurns).map((unit) => unit.player));
  if (livingPlayers.size === 1) {
    state.winner = [...livingPlayers][0];
    state.phase = "complete";
    state.activation = null;
  }
}
