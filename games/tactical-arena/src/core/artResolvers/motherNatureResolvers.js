import { getArtMpCost, getCommandHealBonus, getEffectiveStats, getUnitType, isDefending } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, isWallAt, livingUnits, unitAt } from "../state.js";
import { getArtTargetRange } from "../../rules/arts.js";
import { finalizeMagicDamage, isWallBetween, resistsDisplacement, resolveFixedPhysicalStrike } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { getGlobalHealBonus } from "../../rules/stances.js";
import { applyMagicDamageReaction, applyRockHardDefense, restoreHp } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { formatStatModifierLabel } from "./resolverLabels.js";

function weatherCommanderEffect(unit) {
  const effect = getUnitType(unit.type).passive?.effect;
  return effect?.type === "weatherCommander" ? effect : null;
}

function weatherStatusDuration(target, actor, durationTurns) {
  const duration = Math.max(1, Number(durationTurns) || 1);
  return target.id === actor.id ? duration + 1 : duration;
}

function applyGlobalWeatherStatus(state, actor, art, event) {
  if (!art.globalStatus) return;
  const affected = [];
  for (const target of livingUnits(state)) {
    const result = applyStatus(target, {
      type: art.globalStatus.status,
      duration: weatherStatusDuration(target, actor, art.globalStatus.durationTurns),
      ...(art.globalStatus.statModifiers ? { statModifiers: { ...art.globalStatus.statModifiers } } : {}),
      ...(Number.isFinite(art.globalStatus.magicDamageBonus) ? { magicDamageBonus: art.globalStatus.magicDamageBonus } : {}),
      ignoreResistance: true
    });
    if (!result.applied) continue;
    target.statuses = result.statuses;
    affected.push(target.id);
  }
  event.statusTargets = affected;
  if (art.globalStatus.statModifiers) event.buffLabel = formatStatModifierLabel(art.globalStatus.statModifiers);
  else if (Number.isFinite(art.globalStatus.magicDamageBonus) && art.globalStatus.magicDamageBonus) {
    event.buffLabel = `${art.globalStatus.magicDamageBonus > 0 ? "+" : ""}${art.globalStatus.magicDamageBonus} MAGIC`;
  }
}

function applyGlobalWeatherHeal(state, actor, art, event) {
  if (!art.globalHeal) return;
  const amount = Math.max(0, Number(art.globalHeal.amount) || 0) + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);
  const targetIds = [];
  const healingByTarget = {};
  for (const target of livingUnits(state)) {
    const restored = restoreHp(state, actor, target, amount);
    if (restored.hpRestored <= 0) continue;
    targetIds.push(target.id);
    healingByTarget[target.id] = restored.hpRestored;
  }
  event.targetIds = targetIds;
  event.healingByTarget = healingByTarget;
}

export function resolveWeather(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const event = {
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    weather: art.weather,
    beaconTargetIds: livingUnits(next).map((unit) => unit.id)
  };

  applyGlobalWeatherHeal(next, actor, art, event);
  applyGlobalWeatherStatus(next, actor, art, event);

  for (const unit of next.units) {
    if (unit.id !== actor.id) unit.weather = null;
  }
  next.weather = { id: art.weather, sourceId: actor.id };
  actor.weather = art.weather;
  actor.lastWeather = art.weather;
  const move = Math.max(0, Number(weatherCommanderEffect(actor)?.nextWeatherMove) || 0);
  if (move > 0) actor.weatherMoveCharged = Math.max(actor.weatherMoveCharged ?? 0, move);

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [event]);
}

function landscaperPushDestination(actor, target) {
  return {
    x: target.position.x + Math.sign(target.position.x - actor.position.x),
    y: target.position.y + Math.sign(target.position.y - actor.position.y)
  };
}

export function resolveLandscaper(state, command, art) {
  const actorState = findUnit(state, command.unitId);
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

  const from = { ...target.position };
  const to = landscaperPushDestination(actor, target);
  const blocked = !isOnBoard(next, to) || isWallAt(next, to) || Boolean(unitAt(next, to)) || resistsDisplacement(target);
  const damageByTarget = {};
  let damage = null;
  let pushed = false;
  if (blocked) {
    damage = resolveFixedPhysicalStrike(actor, target, art.damage?.amount ?? 10, { state: next });
    const dealt = Math.min(target.hp, damage.damage);
    target.hp = Math.max(0, target.hp - damage.damage);
    damageByTarget[target.id] = dealt;
  } else {
    target.position = { ...to };
    next.tileObjects[positionKey(from)] = { kind: "wall", hp: art.wall?.hp ?? 1 };
    pushed = true;
  }

  const rockHardEvents = blocked ? applyRockHardDefense(next, target, true) : [];
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    from,
    to: pushed ? { ...to } : { ...from },
    pushed,
    blocked,
    ...(pushed ? { position: { ...from } } : { damage, damageByTarget }),
    mpCost: cost
  }, ...rockHardEvents]);
}

function shufflePositions(state, units) {
  const original = units.map((unit) => ({ ...unit.position }));
  const shuffled = original.map((position) => ({ ...position }));
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const draw = drawValue(state.rngState);
    state.rngState = draw.rngState;
    const j = Math.floor(draw.value * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.length > 1 && shuffled.every((position, index) => positionKey(position) === positionKey(original[index]))) {
    shuffled.push(shuffled.shift());
  }
  units.forEach((unit, index) => { unit.position = { ...shuffled[index] }; });
  return { original, shuffled };
}

export function resolveGreatFlood(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.activation.spellUsed = true;

  const targetIds = [];
  const damageByTarget = {};
  const reactionEvents = [];
  for (const target of livingUnits(next)) {
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage?.amount ?? 7 }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  const healed = restoreHp(next, actor, actor, art.restore?.hp ?? 0);
  const shufflers = livingUnits(next).filter((unit) => unit.id !== actor.id);
  const beforePositions = {};
  const afterPositions = {};
  if (shufflers.length > 1) {
    const { original, shuffled } = shufflePositions(next, shufflers);
    shufflers.forEach((unit, index) => {
      beforePositions[unit.id] = original[index];
      afterPositions[unit.id] = shuffled[index];
    });
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    healingByTarget: healed.hpRestored > 0 ? { [healed.targetId ?? actor.id]: healed.hpRestored } : {},
    restoredByTarget: healed.mpRestored > 0 ? { [healed.targetId ?? actor.id]: healed.mpRestored } : {},
    beforePositions,
    afterPositions,
    mpCost: cost
  }, ...reactionEvents]);
}

// Ronin's Patient Blade / Broken Oath: a self-cast that optionally braces (Defend) and/or
// applies a timed self status (an `empowered` buff). `duration: 2` on the status carries it
// through to Ronin's next turn (it survives this activation's end-of-turn tick). Reuses the
// same status lifecycle as Miner's Ore Harvest haste and the Witch Doctor's Fire Dance.
