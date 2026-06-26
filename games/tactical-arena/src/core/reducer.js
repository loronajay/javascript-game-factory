import { COMMANDS } from "./commands.js";
import { getArt, getEffectiveStats, getUnitType, isDefending } from "./unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits, unitAt } from "./state.js";
import { canUseArt, FOOTWORK_DAMAGE, getLegalFleeTiles, getVolleyShotCells, validateFootworkPath } from "../rules/arts.js";
import { getProximityBonus, resolveBaseStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
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
  INVALID_ART_PATH: "INVALID_ART_PATH",
  FINISH_REQUIRES_ACTION: "FINISH_REQUIRES_ACTION"
});

const reject = (errorCode) => ({ accepted: false, errorCode });
const accept = (nextState, events = []) => ({ accepted: true, nextState, events });

export function applyCommand(state, command) {
  if (!command?.type || state.phase !== "playing") return reject(ERR.INVALID_COMMAND);
  switch (command.type) {
    case COMMANDS.BEGIN_ACTIVATION: return beginActivation(state, command);
    case COMMANDS.MOVE_UNIT: return moveUnit(state, command);
    case COMMANDS.ATTACK: return attack(state, command);
    case COMMANDS.DEFEND: return defend(state, command);
    case COMMANDS.USE_ART: return useArt(state, command);
    case COMMANDS.FINISH_ACTIVATION: return finishActivation(state, command);
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
  if (result.unit.spent) return reject(ERR.UNIT_SPENT);
  if (state.activation && state.activation.unitId !== result.unit.id &&
      (state.activation.moved || state.activation.primaryUsed)) return reject(ERR.ACTIVATION_ALREADY_OPEN);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const statusEvents = resolveTurnStartStatuses(unit);
  if (unit.hp <= 0) {
    resolveVictory(next);
    return accept(next, statusEvents);
  }
  unit.defending = false;
  next.activation = {
    unitId: unit.id,
    origin: { ...unit.position },
    moved: false,
    primaryUsed: false,
    spellUsed: false
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
  const target = findUnit(state, command.targetId);
  if (!target || target.hp <= 0 || !areEnemies(result.unit, target)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(result.unit.position, target.position) > getEffectiveStats(result.unit, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

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
  const damage = resolvePhysicalStrike(actor, nextTarget, { proximity: true, critical: swing.critical, state: next });
  nextTarget.hp = Math.max(0, nextTarget.hp - damage.damage);
  resolveVictory(next);
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, ...damageFields
  }]);
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
  ["flee", resolveFlee],
  ["nuke", resolveNuke]
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
  }]);
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
    target.hp = Math.max(0, target.hp - result.damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = result.damage;
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
  if (livingUnits(state, state.currentPlayer).some((member) => !member.spent)) return;
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.turnNumber += 1;
  for (const member of livingUnits(state, state.currentPlayer)) member.spent = false;
}

function resolveVictory(state) {
  const livingPlayers = new Set(livingUnits(state).map((unit) => unit.player));
  if (livingPlayers.size === 1) {
    state.winner = [...livingPlayers][0];
    state.phase = "complete";
    state.activation = null;
  }
}
