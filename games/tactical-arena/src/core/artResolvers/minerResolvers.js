import { getArtMpCost, getEffectiveStats } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits } from "../state.js";
import { getArtTargetRange, getWallPlacementTiles } from "../../rules/arts.js";
import { isWallBetween, rollToHit } from "../../rules/combat.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveBuildCover(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getWallPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "wall", hp: art.wall?.hp ?? 1 };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: cost
  }]);
}

// Throw Cigar: set a tile alight within range (an occupied tile is allowed — fire at
// the target's feet). The fire burns at every rollover via applyFireTick.
function rollOreAmount(state, command, art) {
  if (art.ore?.full) return null;
  const roll = drawValue(state.rngState, command.effectRoll);
  state.rngState = roll.rngState;
  const table = art.ore?.table;
  if (Array.isArray(table) && table.length) {
    return table[Math.min(table.length - 1, Math.floor(roll.value * table.length))];
  }
  const min = Math.max(0, Number(art.ore?.min) || 0);
  const max = Math.max(min, Number(art.ore?.max) || min);
  return min + Math.floor(roll.value * (max - min + 1));
}

export function resolveOreHarvest(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const maxOre = getEffectiveStats(actor, next).maxMp;
  const before = actor.mp;
  const amount = art.ore?.full ? maxOre : rollOreAmount(next, command, art);
  actor.mp = Math.min(maxOre, actor.mp + amount);

  if (art.nextTurnStatus) {
    const result = applyStatus(actor, {
      type: art.nextTurnStatus.type,
      duration: art.nextTurnStatus.duration,
      statModifiers: { ...(art.nextTurnStatus.statModifiers ?? {}) },
      ignoreResistance: true
    });
    if (result.applied) actor.statuses = result.statuses;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    oreGained: actor.mp - before,
    oreAfter: actor.mp,
    mpCost: cost
  }]);
}

function blastPushDestination(center, target) {
  const dx = Math.sign(target.position.x - center.x);
  const dy = Math.sign(target.position.y - center.y);
  if (Math.abs(target.position.x - center.x) >= Math.abs(target.position.y - center.y)) {
    return { x: target.position.x + dx, y: target.position.y };
  }
  return { x: target.position.x, y: target.position.y + dy };
}

function applyBlastingCapSplash(state, actor, art, center, excludeId = null) {
  const radius = Math.max(0, Number(art.splash?.radius) || 1);
  const blockedDamage = Math.max(0, Number(art.splash?.blockedDamage) || 0);
  const originalOccupied = new Set(livingUnits(state).map((unit) => positionKey(unit.position)));
  const targetIds = [];
  const damageByTarget = {};
  const pushed = {};
  const blocked = [];
  for (const victim of livingUnits(state)) {
    if (victim.id === excludeId || !areEnemies(actor, victim)) continue;
    if (chebyshevDistance(center, victim.position) > radius) continue;
    const destination = blastPushDestination(center, victim);
    if (!isOnBoard(state, destination) || isWallAt(state, destination) || originalOccupied.has(positionKey(destination))) {
      const splashDealt = Math.min(victim.hp, blockedDamage);
      victim.hp = Math.max(0, victim.hp - blockedDamage);
      blocked.push(victim.id);
      targetIds.push(victim.id);
      damageByTarget[victim.id] = (damageByTarget[victim.id] ?? 0) + splashDealt;
      continue;
    }
    const from = { ...victim.position };
    victim.position = destination;
    pushed[victim.id] = { from, to: { ...destination } };
  }
  return { targetIds, damageByTarget, pushed, blocked };
}

export function resolveBlastingCap(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (command.targetPosition) return resolveBlastingCapWall(state, command, art, actorState);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {},
      pushed: {}, blocked: [], mpCost: cost
    }]);
  }

  const center = { ...target.position };
  const targetIds = [target.id];
  const damageByTarget = {};
  const initialDamage = Math.max(0, Number(art.damage?.amount) || 0);
  const dealt = Math.min(target.hp, initialDamage);
  target.hp = Math.max(0, target.hp - initialDamage);
  damageByTarget[target.id] = dealt;

  let stunned = false;
  if (swing.critical && target.hp > 0 && art.onCrit?.status) {
    const result = applyStatus(target, { type: art.onCrit.status, duration: art.onCrit.durationTurns ?? 1 });
    if (result.applied) {
      target.statuses = result.statuses;
      stunned = true;
    }
  }

  const splash = applyBlastingCapSplash(next, actor, art, center, target.id);
  for (const id of splash.targetIds) targetIds.push(id);
  for (const [id, amount] of Object.entries(splash.damageByTarget)) damageByTarget[id] = (damageByTarget[id] ?? 0) + amount;

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds, damageByTarget, damage: dealt, hit: true, critical: swing.critical, stunned, center,
    pushed: splash.pushed, blocked: splash.blocked, mpCost: cost
  }]);
}

function resolveBlastingCapWall(state, command, art, actorState) {
  const placement = command.targetPosition;
  if (!placement || !isWallAt(state, placement)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, placement) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, placement, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const center = { ...placement };
  delete next.tileObjects[positionKey(placement)];
  const splash = applyBlastingCapSplash(next, actor, art, center);

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    position: { ...placement },
    center,
    targetIds: splash.targetIds,
    damageByTarget: splash.damageByTarget,
    hit: true,
    rolled: false,
    destroyedWall: true,
    pushed: splash.pushed,
    blocked: splash.blocked,
    mpCost: cost
  }]);
}
