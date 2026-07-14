import { getArtMpCost, getCommandHealBonus, getGuaranteedStatuses, getPoisonMpRefund, getWeatherCritCreatesFire } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, getTileAffinity, isWallAt, livingUnits, unitAt } from "../state.js";
import { artIsBodyBlocked, artUsesPhysicalStrike, getArtTargetRange, getRushContactDamage, validateRushPath } from "../../rules/arts.js";
import { addDuelMark, duelistTracksMisses, isHealingDisabled, isShotBlocked, isWallBetween, resolveBaseStrike, resolveFixedMagicStrike, rollToHit, shouldApplyAttackRecoil } from "../../rules/combat.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../../rules/movement.js";
import { getGlobalHealBonus, getGlobalStatusChanceMultiplier } from "../../rules/stances.js";
import { applyDarkTreadLifesteal, applyGrowth, applyMagicDamageReaction, applyRockHardDefense, applyRolledStatus, resolvePhysicalDamageHealing, restoreHp, restoreMp } from "../combatEffects.js";
import { consumeOneShotRage } from "../reactions.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { pushDestinationAwayFrom } from "./displacement.js";
import { completeArtUse } from "./artCompletion.js";

export function resolveRushPath(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!validateRushPath(state, actorState, command.path, art)) return reject(ERR.INVALID_ART_PATH);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const harmed = [];
  const damageByTarget = {};
  const damage = getRushContactDamage(actor, art);
  for (const step of command.path) {
    const target = unitAt(next, step);
    if (target && areEnemies(actor, target)) {
      const dealt = Math.min(target.hp, damage);
      target.hp = Math.max(0, target.hp - damage);
      harmed.push(target.id);
      damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    }
  }
  actor.position = { ...command.path.at(-1) };
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: command.path.map((step) => ({ ...step })),
    harmed,
    damageByTarget,
    mpCost: cost
  }]);
}

// Dark Rush (Blacksword): a Footwork clone restricted to a single orthogonal direction
// (validateRushPath honors `straightLine`). Spends HP, deals tile-scaled TRUE damage to
// every enemy passed through (more on dark tiles), heals via Dark Tread on the dark-tile
// hits, and ends on empty ground.
export function resolveDarkRush(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!validateRushPath(state, actorState, command.path, art)) return reject(ERR.INVALID_ART_PATH);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const hpCost = art.hpCost ?? 0;
  const lightDamage = art.contactDamage?.light ?? 3;
  const darkDamage = art.contactDamage?.dark ?? 4;
  const harmed = [];
  const damageByTarget = {};
  const damaged = [];
  for (const step of command.path) {
    const target = unitAt(next, step);
    if (!target || !areEnemies(actor, target)) continue;
    const amount = getTileAffinity(next, target.position) === "dark" ? darkDamage : lightDamage;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    harmed.push(target.id);
    damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    if (dealt > 0) damaged.push(target);
  }
  actor.position = { ...command.path.at(-1) };
  const darkTreadEvents = applyDarkTreadLifesteal(next, actor, damaged);
  actor.hp = Math.max(0, actor.hp - hpCost);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: command.path.map((step) => ({ ...step })),
    harmed,
    damageByTarget,
    mpCost: 0,
    hpCost
  }, ...darkTreadEvents]);
}

// Dark Ether (Blacksword): spend HP to charge a guaranteed crit on the next basic attack
// (getCritChance reads the flag; the reducer's attack() consumes it). A pure self-cast.
export function resolveDarkEther(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const hpCost = art.hpCost ?? 0;
  actor.hp = Math.max(0, actor.hp - hpCost);
  actor.guaranteedCritCharged = true;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpCost: 0, hpCost, charged: true
  }]);
}

export function resolveFart(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = art.targeting?.radius ?? 1;
  const amount = art.damage?.amount ?? 2;
  const originalOccupied = new Set(livingUnits(next).map((unit) => positionKey(unit.position)));
  const pushed = {};
  const blocked = [];
  const damageByTarget = {};

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const destination = pushDestinationAwayFrom(actor, target);
    if (!isOnBoard(next, destination) || isWallAt(next, destination) || originalOccupied.has(positionKey(destination))) {
      const dealt = Math.min(target.hp, amount);
      target.hp = Math.max(0, target.hp - amount);
      blocked.push(target.id);
      damageByTarget[target.id] = dealt;
      continue;
    }
    const from = { ...target.position };
    target.position = destination;
    pushed[target.id] = { from, to: { ...destination } };
  }

  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    pushed,
    blocked,
    damageByTarget,
    mpCost: cost
  }]);
}

export function resolveTargetedArt(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // ARTS that resolve as a physical strike are body-blocked like a basic attack unless
  // they explicitly pierce units (Curve Shot). Magic ARTS reach their target directly.
  // A wall, however, blocks BOTH physical and magic ARTS (only the Sniper pierces it).
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }
  if (artIsBodyBlocked(art) &&
      isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  // Every targeted attack ART rolls to-hit like a basic attack (the ART's own status/
  // heal check is a SECOND, separate roll below). Magic casts ignore Blind specifically —
  // Silence, not Blind, is the mage counter — but can still whiff on a bad roll.
  const ignoreBlind = !artUsesPhysicalStrike(art);
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { ignoreBlind });
  next.rngState = swing.rngState;
  if (swing.missed) {
    // Wanderer (Ronin): a foe that whiffs an attack ART on Ronin is marked for +1 next turn.
    if (duelistTracksMisses(target)) addDuelMark(target, actor.id);
    const desperationEvents = consumeOneShotRage(actor);
    completeArtUse(next, actor, art);
    return accept(next, [{ type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost, hit: false, missed: true, roll: swing.hitRoll }, ...desperationEvents]);
  }

  if (art.damageType === "magic") next.activation.spellUsed = true;

  // Targeted attack ARTS resolve via the attacker's base strike type. `art.damageType`
  // overrides to magic for ARTS like Spark and Banish (magic ignores proximity bonuses). A
  // FIXED-amount magic art (Virus's Cough "5 magic") stands its `damage.amount` in for STR
  // via resolveFixedMagicStrike instead of scaling off effective STR.
  const fixedMagic = art.damageType === "magic" && Number.isFinite(art.damage?.amount);
  const damage = fixedMagic
    ? resolveFixedMagicStrike(actor, target, art.damage.amount, { critical: swing.critical, state: next, art })
    : resolveBaseStrike(actor, target, { proximity: true, critical: swing.critical, state: next, damageType: art.damageType ?? null, damageAffinity: art.damageAffinity ?? art.damage?.affinity ?? null });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);
  const magicReaction = damage.type === "magic" ? applyMagicDamageReaction(target, damageDealt) : null;
  const fireTiles = [];
  const weatherCritFire = swing.critical ? getWeatherCritCreatesFire(next) : null;
  if (weatherCritFire) {
    const position = { ...target.position };
    next.tileObjects[positionKey(position)] = { kind: weatherCritFire.kind ?? "fire", permanent: Boolean(weatherCritFire.permanent) };
    fireTiles.push(position);
  }
  // Final Draw (Ronin RAGE): attack ART recoil only applies while enemies remain.
  const recoilEvents = [];
  if (shouldApplyAttackRecoil(actor, next) && damageDealt > 0) {
    const recoil = Math.min(actor.hp, damageDealt);
    actor.hp = Math.max(0, actor.hp - damageDealt);
    recoilEvents.push({ type: "ATTACK_RECOIL", unitId: actor.id, damage: recoil });
  }

  let effect = null;
  let poisonedEnemy = false;
  if (art.effect?.type === "status" && target.hp > 0) {
    // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
    // Virus's Infectious Affinity forces its poison to 100% while raging.
    // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
    const guaranteed = getGuaranteedStatuses(actor).has(art.effect.status) || (art.effect.criticalGuarantees && swing.critical);
    const effectSpec = guaranteed ? { ...art.effect, chance: 1 } : art.effect;
    const attempts = guaranteed ? 1 : Math.max(1, Number(art.effect.rolls) || 1);
    const rolls = [];
    for (let index = 0; index < attempts; index += 1) {
      const override = index === 0 ? command.effectRoll : command[`effectRoll${index + 1}`];
      const roll = guaranteed
        ? { value: 0, rngState: next.rngState }
        : drawValue(next.rngState, override);
      next.rngState = roll.rngState;
      rolls.push(roll.value);
      effect = applyRolledStatus(target, effectSpec, roll.value, actor, getGlobalStatusChanceMultiplier(next));
      if (effect.applied || effect.reflected) break;
    }
    effect = {
      ...effect,
      ...(!guaranteed && attempts > 1 ? { rolls } : {}),
      ...(guaranteed ? { guaranteed: true } : {})
    };
    poisonedEnemy = Boolean(effect.applied && !effect.reflected && art.effect.status === "poison");
  } else if (art.effect?.type === "heal") {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const successful = roll.value >= 0 && roll.value < art.effect.chance;
    // Soul Sap (Treant) drinks MP instead of HP (restore:"mp"); the heal-bonus riders are
    // HP-healing bonuses, so they only apply to an HP drain.
    const drinksMp = art.effect.restore === "mp";
    const base = successful ? Math.round(damage.damage / 2) : 0;
    // Rain Stance's global heal bonus rides on a successful HP heal; a raging Juggernaut's
    // Null Zone shuts all healing off (isHealingDisabled) regardless of the roll.
    const healing = drinksMp ? base : (successful ? base + getGlobalHealBonus(next) + getCommandHealBonus(next, actor) : 0);
    const restored = drinksMp ? restoreMp(next, actor, actor, healing) : restoreHp(next, actor, actor, healing);
    effect = { attempted: true, applied: successful, healing: restored.hpRestored, mpRestored: restored.mpRestored };
  }

  const healingEvents = damage.type === "physical" ? resolvePhysicalDamageHealing(next, actor, damageDealt) : [];
  // Growth (Virus): restore MP when this cast poisons an enemy (Cough).
  const growthEvents = poisonedEnemy ? applyGrowth(next, actor, getPoisonMpRefund(actor)) : [];
  // Rock Hard (Clod): a defending Clod struck by a physical ART refunds MP (its damage
  // was already negated by resolveBaseStrike).
  const rockHardEvents = applyRockHardDefense(next, target, damage.type === "physical");
  const desperationEvents = consumeOneShotRage(actor);
  completeArtUse(next, actor, art);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    hit: true,
    critical: swing.critical,
    roll: swing.hitRoll,
    damage,
    ...(fireTiles.length ? { fireTiles } : {}),
    ...(effect ? { effect } : {})
  }, ...healingEvents, ...growthEvents, ...desperationEvents, ...rockHardEvents, ...recoilEvents, ...(magicReaction ? [magicReaction] : [])]);
}
