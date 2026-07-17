import {
  getArtMpCost,
  getCommandHealBonus,
  getMagicDamageReward,
  getRageEffectValue,
  getUnitType,
} from "../unitCatalog.js";
import { areAllies, areEnemies, cloneState, findUnit, livingUnits } from "../state.js";
import { getArtTargetRange } from "../../rules/arts.js";
import { isWallBetween, resolveFixedMagicStrike, rollToHit } from "../../rules/combat.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus, isTargetable } from "../../rules/statuses.js";
import { getGlobalHealBonus } from "../../rules/stances.js";
import { applyMagicDamageReaction, restoreHp, restoreMp } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

function clumsyEffect(actor) {
  return getUnitType(actor.type).passive?.effect?.type === "clumsyCast"
    ? getUnitType(actor.type).passive.effect
    : null;
}

function validateTargetedEnemyCast(state, actor, target, art) {
  if (!isTargetable(target) || !areEnemies(actor, target)) return ERR.INVALID_TARGET;
  if (chebyshevDistance(actor.position, target.position) > getArtTargetRange(state, actor, art)) return ERR.TARGET_OUT_OF_RANGE;
  if (isWallBetween(state, actor.position, target.position, actor)) return ERR.TARGET_OBSTRUCTED;
  return null;
}

function applyStudyLeech(state, actor, target, damageDealt, events) {
  if (damageDealt <= 0) return;
  const reward = getMagicDamageReward(actor, target);
  if (!reward) return;
  const hp = restoreHp(state, actor, actor, reward.hp);
  const mp = restoreMp(state, actor, actor, reward.mp);
  const hpRestored = hp.hpRestored;
  const mpRestored = mp.mpRestored;
  if (hpRestored > 0 || mpRestored > 0) {
    events.push({ type: "STUDY_LEECH", actorId: hp.targetId ?? mp.targetId ?? actor.id, sourceId: actor.id, targetId: target.id, hpRestored, mpRestored });
  }
}

function applyMagicSplash(state, actor, center, { amount, excludeId, art, damageByTarget, targetIds, reactionEvents, leechEvents }) {
  if (!(amount > 0)) return;
  for (const target of livingUnits(state)) {
    if (target.id === excludeId) continue;
    if (chebyshevDistance(center.position, target.position) > (clumsyEffect(actor)?.radius ?? 1)) continue;
    const damage = resolveFixedMagicStrike(actor, target, amount, { state, art });
    const dealt = Math.min(target.hp, damage.damage);
    target.hp = Math.max(0, target.hp - damage.damage);
    if (dealt <= 0) continue;
    targetIds.push(target.id);
    damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    applyStudyLeech(state, actor, target, dealt, leechEvents);
  }
}

function applyAreaHeal(state, actor, center, { amount, excludeId, healingByTarget, targetIds }) {
  if (!(amount > 0)) return;
  const boosted = amount + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);
  for (const target of livingUnits(state)) {
    if (target.id === excludeId) continue;
    if (chebyshevDistance(center.position, target.position) > (clumsyEffect(actor)?.radius ?? 1)) continue;
    const restored = restoreHp(state, actor, target, boosted);
    const healed = restored.hpRestored;
    if (healed <= 0) continue;
    targetIds.push(target.id);
    healingByTarget[target.id] = (healingByTarget[target.id] ?? 0) + healed;
  }
}

export function resolveFatWizardZap(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  const invalid = validateTargetedEnemyCast(state, actorState, targetState, art);
  if (invalid) return reject(invalid);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.activation.spellUsed = true;

  const splashDamageByTarget = {};
  const splashTargetIds = [];
  const reactionEvents = [];
  const leechEvents = [];
  const clumsy = clumsyEffect(actor);

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { ignoreBlind: true, target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    applyMagicSplash(next, actor, target, {
      amount: clumsy?.missMagicDamage ?? 0,
      excludeId: target.id,
      art,
      damageByTarget: splashDamageByTarget,
      targetIds: splashTargetIds,
      reactionEvents,
      leechEvents
    });
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      mpCost: cost, hit: false, missed: true, roll: swing.hitRoll,
      splashTargetIds, splashDamageByTarget
    }, ...reactionEvents, ...leechEvents]);
  }

  const amount = (art.damage?.amount ?? 0) + Math.max(0, Number(getRageEffectValue(actor, "zapDamageBonus", 0)) || 0);
  const damage = resolveFixedMagicStrike(actor, target, amount, { critical: swing.critical, state: next, art });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);
  const magicReaction = applyMagicDamageReaction(target, damageDealt);
  if (magicReaction) reactionEvents.push(magicReaction);
  applyStudyLeech(next, actor, target, damageDealt, leechEvents);

  let effect = null;
  if (swing.critical && target.hp > 0) {
    const rageStatus = getRageEffectValue(actor, "zapCritStatus", null);
    const spec = rageStatus ?? { status: art.effect?.status, durationTurns: art.effect?.durationTurns ?? 1 };
    const applied = applyStatus(target, { type: spec.status, duration: spec.durationTurns });
    if (applied.applied) target.statuses = applied.statuses;
    effect = { status: spec.status, applied: applied.applied, ...(applied.reason ? { reason: applied.reason } : {}) };
  }

  const rageSplash = getRageEffectValue(actor, "zapSplashOnHit", null);
  const splashAmount = swing.critical
    ? (rageSplash?.critAmount ?? clumsy?.critMagicDamage ?? 0)
    : (rageSplash?.amount ?? 0);
  applyMagicSplash(next, actor, target, {
    amount: splashAmount,
    excludeId: target.id,
    art,
    damageByTarget: splashDamageByTarget,
    targetIds: splashTargetIds,
    reactionEvents,
    leechEvents
  });

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    mpCost: cost, hit: true, critical: swing.critical, roll: swing.hitRoll, damage,
    ...(effect ? { effect } : {}),
    ...(splashTargetIds.length ? { splashTargetIds, splashDamageByTarget } : {})
  }, ...reactionEvents, ...leechEvents]);
}

export function resolveStudy(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  const invalid = validateTargetedEnemyCast(state, actorState, targetState, art);
  if (invalid) return reject(invalid);
  if (actorState.studiedTargetId && state.units.some((unit) => unit.id === actorState.studiedTargetId && unit.hp > 0)) {
    return reject(ERR.ART_NOT_AVAILABLE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.studiedTargetId = target.id;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, studiedTargetId: target.id, mpCost: cost
  }]);
}

export function resolveFatWizardSurge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const healingByTarget = {};
  const splashHealingByTarget = {};
  const healTargetIds = [];
  const splashTargetIds = [];
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { ignoreBlind: true, target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;

  const clumsy = clumsyEffect(actor);
  if (swing.missed) {
    applyAreaHeal(next, actor, target, {
      amount: clumsy?.surgeHeal ?? 0,
      excludeId: target.id,
      healingByTarget: splashHealingByTarget,
      targetIds: splashTargetIds
    });
  } else {
    const amount = swing.critical ? (art.heal?.critAmount ?? art.heal?.amount ?? 0) : (art.heal?.amount ?? 0);
    const boosted = amount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    const restored = restoreHp(next, actor, target, boosted);
    if (restored.hpRestored > 0) {
      healTargetIds.push(target.id);
      healingByTarget[target.id] = restored.hpRestored;
    }
    const rageSplash = getRageEffectValue(actor, "surgeSplashOnHit", null);
    const splashAmount = swing.critical ? (clumsy?.surgeHeal ?? 0) : (rageSplash?.amount ?? 0);
    applyAreaHeal(next, actor, target, {
      amount: splashAmount,
      excludeId: target.id,
      healingByTarget: splashHealingByTarget,
      targetIds: splashTargetIds
    });
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    mpCost: cost, hit: !swing.missed, missed: swing.missed, critical: swing.critical, roll: swing.hitRoll,
    healTargetIds, healingByTarget,
    ...(splashTargetIds.length ? { splashTargetIds, splashHealingByTarget } : {})
  }]);
}

export function resolveRelayPower(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || targetState.id === actorState.id || !areAllies(actorState, targetState)) {
    return reject(ERR.INVALID_TARGET);
  }
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const hp = Math.max(0, Number(art.effect?.hp) || 0);
  const mp = Math.max(0, Number(art.effect?.mp) || 0);
  if (actorState.hp <= hp || actorState.mp < mp) return reject(ERR.ART_NOT_AVAILABLE);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.hp = Math.max(0, actor.hp - hp);
  actor.mp = Math.max(0, actor.mp - mp);
  const beforeHp = target.hp;
  const beforeMp = target.mp;
  restoreHp(next, actor, target, hp + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
  restoreMp(next, actor, target, mp);
  const healed = target.hp - beforeHp;
  const restored = target.mp - beforeMp;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: 0,
    hpPaid: hp,
    mpPaid: mp,
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    restoredByTarget: restored > 0 ? { [target.id]: restored } : {}
  }]);
}
