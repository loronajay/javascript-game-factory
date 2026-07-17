// The basic-attack pipeline, extracted from the reducer: validation, the to-hit
// roll, multi-target line strikes, and every data-driven rider (on-hit statuses,
// crit fire/pull/splash, lifesteal, recoil, retaliation, stance triggers), plus
// the no-roll wall attack. Passive-driven and unit-generic: behavior is read off
// unit data through rules/combat.js helpers, never hard-coded per unit here.


import {
  getArt,
  getBasicAttackResourceCost,
  getEffectiveStats,
  getPoisonMpRefund,
  getRageAttackStatus,
  getRageEffectValue,
  getUnitType,
  getWallKillResourceReward,
  getWeatherCritCreatesFire,
  isCommandOnly,
  isDefending,
  isRaging,
} from "./unitCatalog.js";
import {
  areEnemies,
  cloneState,
  findUnit,
  getTileAffinity,
  isWallAt,
  livingUnits,
  unitAt,
} from "./state.js";
import { getConeCells } from "../rules/arts.js";
import { addDuelMark, duelistTracksMisses, getAttackSplashDamage, getBasicAttackDamageType, getCritCreatesFire, getCritOnHitStatus, getCritPullEffect, getCritSplashDamage, getDuelistCritLifesteal, getLineAttackTargets, getMeleeDefendRetaliation, isFireBasedDamage, isFireDamageImmune, isShotBlocked, isStraightRayTarget, isWallBetween, requiresRayBasicAttack, resolveBaseStrike, rollToHit, shouldApplyAttackRecoil } from "../rules/combat.js";
import { chebyshevDistance, positionKey } from "../rules/movement.js";
import { applyStatus } from "../rules/statuses.js";
import { alliesInRadius, getStanceEffect } from "../rules/stances.js";
import { applyDarkTreadLifesteal, applyGrowth, applyMagicDamageReaction, applyRockHardDefense, resolvePhysicalDamageHealing, restoreHp, restoreMp } from "./combatEffects.js";
import { applyBeckonedGhostSacrifice } from "./ghostSacrifice.js";
import { validateOpenActivation } from "./commandValidation.js";
import { consumeOneShotRage } from "./reactions.js";
import { accept, ERR, reject } from "./reducerResult.js";
import { resolveVictory, spendAndAdvance } from "./turnEngine.js";


export function attack(state, command) {
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
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, {
    target: nextTarget,
    state: next,
    basicAttack: true
  });
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
  if (shouldApplyAttackRecoil(actor, next) && totalDamageDealt > 0) {
    const recoil = Math.min(actor.hp, totalDamageDealt);
    actor.hp = Math.max(0, actor.hp - totalDamageDealt);
    if (actor.hp <= 0) applyBeckonedGhostSacrifice(next, actor);
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
  const createdFire = [];
  for (const target of livingUnits(state)) {
    if (!areEnemies(actor, target) || !cellKeys.has(positionKey(target.position))) continue;
    if (fireBased && isFireDamageImmune(target)) continue;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    if (dealt > 0) {
      targetIds.push(target.id);
      damageByTarget[target.id] = dealt;
      if (art.hitTileObject?.kind === "fire") {
        const fire = art.hitTileObject;
        const firePosition = { ...target.position };
        state.tileObjects[positionKey(firePosition)] = fire.permanent
          ? { kind: "fire", permanent: true }
          : { kind: "fire", turnsLeft: Number.isFinite(fire.turnsLeft) ? fire.turnsLeft : 3 };
        createdFire.push(firePosition);
      }
    }
  }
  return [{
    type: "FLAMESPITTER",
    actorId: actor.id,
    artId: art.id,
    targetPosition: origin,
    targetIds,
    damageByTarget,
    ...(createdFire.length ? { createdFire } : {}),
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
