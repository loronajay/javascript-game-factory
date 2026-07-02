import { COMMANDS } from "./commands.js";
import { getArt, getEffectiveStats, getUnitType, isDefending, takesTurns } from "./unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "./state.js";
import { canUseArt, FOOTWORK_DAMAGE, getFirePlacementTiles, getLegalFleeTiles, getSummonPlacementTiles, getTilePulseTargets, getVolleyShotCells, getWallPlacementTiles, validateFootworkPath } from "../rules/arts.js";
import { getLineAttackTargets, getProximityBonus, getTeamDamageReduction, isShotBlocked, isWallBetween, resolveBaseStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
import { resolveDamage } from "../rules/damage.js";
import { drawValue } from "./rng.js";
import { chebyshevDistance, getLegalMoves, positionKey } from "../rules/movement.js";
import { resolveStatusEffect, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";

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
  if (!takesTurns(result.unit) || result.unit.spent) return reject(ERR.UNIT_SPENT);
  if (state.activation && state.activation.unitId !== result.unit.id &&
      (state.activation.moved || state.activation.primaryUsed)) return reject(ERR.ACTIVATION_ALREADY_OPEN);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const statusEvents = resolveTurnStartStatuses(unit);
  if (unit.hp <= 0) {
    // The activating unit died to its own turn-start poison before opening an
    // activation. Resolve victory, then hand off the turn if this was the player's
    // last unspent commander (otherwise the match would soft-lock — see
    // advanceTurnIfExhausted).
    next.activation = null;
    resolveVictory(next);
    advanceTurnIfExhausted(next);
    return accept(next, statusEvents);
  }
  unit.defending = false;
  next.activation = {
    unitId: unit.id,
    origin: { ...unit.position },
    moved: false,
    primaryUsed: false,
    spellUsed: false,
    bonusActionGroups: []
  };
  return accept(next, [...statusEvents, { type: "ACTIVATION_BEGAN", unitId: unit.id }]);
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

  // To-hit roll first (miss/crit). Blind and the raging Archer's never-miss are
  // folded into the chance, so a guaranteed miss reads through the same path.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll }]);
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
  }, ...healingEvents]);
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
  ["darkseeker", resolveTilePulse]
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
    effect = resolveStatusEffect(target, art.effect, roll.value);
    if (effect.statuses) target.statuses = effect.statuses;
    delete effect.statuses;
  } else if (art.effect?.type === "heal") {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const successful = roll.value >= 0 && roll.value < art.effect.chance;
    const healing = successful ? Math.round(damage.damage / 2) : 0;
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
  const radius = art.targeting.radius;
  const damageByTarget = {};
  const targetIds = [];

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    // Dead Zone (and any future magic-reduction host) trims the final magic number.
    const damage = Math.max(0, result.damage - getTeamDamageReduction(target, next, "magic"));
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
// `summonerId` so the one-Ghoul-per-Necromancer cap can find it. It spawns already
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
    summonerId
  };
}

function resolveSummonGhoul(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getSummonPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  // One living Ghoul per Necromancer (legacy petPlaced). Re-summon is blocked
  // until the current one dies.
  if (state.units.some((unit) => unit.hp > 0 && unit.summonerId === actorState.id)) {
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
  const amount = Math.max(0, Number(art.effect.amount) || 0);

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
  const effect = resolveStatusEffect(target, art.effect, roll.value);
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
  const amount = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (amount <= 0) return [];

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

// Pass the turn to the other player once the current one has no unspent living
// commander left. Shared by the normal end-of-activation path AND the rare
// turn-start death: a unit that dies to poison on BEGIN never opens an activation,
// so if it was the player's last unspent commander the turn must still hand off here
// — otherwise that player soft-locks the match with no legal move. Summons never
// take turns, so they neither keep the turn open nor get their spent flag reset.
function advanceTurnIfExhausted(state) {
  if (state.phase !== "playing") return;
  if (livingUnits(state, state.currentPlayer).some((member) => takesTurns(member) && !member.spent)) return;
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.turnNumber += 1;
  for (const member of livingUnits(state, state.currentPlayer)) if (takesTurns(member)) member.spent = false;
  // Board hazards resolve at the rollover, after the turn flips: fire burns whoever
  // stands on it and counts down. A burn can be lethal, so re-check victory. Burn
  // events are stashed on the state for accept() to surface (presentation only).
  const fireEvents = [];
  applyFireTick(state, fireEvents);
  resolveVictory(state);
  if (fireEvents.length) state.pendingRolloverEvents = fireEvents;
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
