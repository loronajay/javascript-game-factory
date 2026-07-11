import { getArt, getArtMpCost, getCommandHealBonus, getEffectiveStats, getGuaranteedStatuses, getInitialMp, getMagicDamageReward, getPoisonMpRefund, getRageAttackStatus, getRageEffectValue, getUnitType, isCommandOnly, isDefending, isRaging, takesTurns } from "./unitCatalog.js";
import { areEnemies, areAllies, cloneState, findUnit, getTileAffinity, isWallAt, livingTeamUnits, livingUnits, teamOfUnit, unitAt } from "./state.js";
import { artIsBodyBlocked, canUseArt, getArtTargetRange, getConeCells, getConeOriginForTarget, getDarkPulseRays, getFirePlacementTiles, getFlightTiles, getLegalFleeTiles, getLineTargets, getProtectLandingTiles, getPyroclasmTargets, getRevivePlacementTiles, getReviveTargets, getRushContactDamage, getSelfBlastRadius, getSummonPlacementTiles, getTargetedBlastAimTiles, getTargetedBlastTargets, getTilePulseTargets, getVolleyShotCells, getVolleyShotOriginForTarget, getWallPlacementTiles, validateRushPath } from "../rules/arts.js";
import { finalizeMagicDamage, getDisplacementRetaliation, getProximityBonus, ignoresCriticalDamage, isFireBasedDamage, isFireDamageImmune, isHealingDisabled, isShotBlocked, isWallBetween, negatesPhysicalWhileDefending, resistsDisplacement, resolveBaseStrike, resolveFixedMagicStrike, resolveFixedPhysicalStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
import { CRIT_MULTIPLIER, resolveDamage } from "../rules/damage.js";
import { drawValue } from "./rng.js";
import { chebyshevDistance, isOnBoard, positionKey } from "../rules/movement.js";
import { applyStatus, isNegativeStatus, NEGATIVE_STATUS_TYPES, reflectsStatus } from "../rules/statuses.js";
import { getGlobalHealBonus, getGlobalStatusChanceMultiplier } from "../rules/stances.js";
import { applyGrowth, applyMagicDamageReaction, applyRockHardDefense, applyRolledStatus, resolvePhysicalDamageHealing, restoreHp, restoreMp } from "./combatEffects.js";
import { validateOpenActivation } from "./commandValidation.js";
import { consumeOneShotRage } from "./reactions.js";
import { accept, ERR, reject } from "./reducerResult.js";
import { resolveVictory, spendAndAdvance } from "./turnEngine.js";

export function resolveVolcanicPyroclasmTick(state, unit, freeCast, events, { trigger, force = false, resetCounter = false } = {}) {
  if (resetCounter) unit.volcanicCounter = 0;
  unit.volcanicCounter = (unit.volcanicCounter ?? 0) + 1;
  // Fires immediately on rage entry / first raging activation, then every Nth tick after
  // that, so the cadence is 1, 1+N, 1+2N, ... rather than N, 2N, ...
  const every = Math.max(1, freeCast.every ?? 3);
  if (!force && (unit.volcanicCounter - 1) % every !== 0) return false;

  const art = getArt(unit.type, freeCast.artId);
  if (!art) return false;
  const { targetIds, damageByTarget } = applyPyroclasmDamage(state, unit, art);
  resolveVictory(state);
  if (state.phase !== "playing") state.activation = null; // the eruption ended the match
  events.push({ type: "PYROCLASM_ERUPT", actorId: unit.id, targetIds, damageByTarget, trigger });
  return true;
}

export function resolveNemesisAutoPulse(state, unit, events, { trigger }) {
  const art = getArt(unit.type, "dark-pulse");
  if (!art || unit.hp <= 0) return false;
  const { targetIds, damageByTarget, healingByTarget, pulseRays } = applyDarkPulse(state, unit, art);
  resolveVictory(state);
  events.push({
    type: "DARK_PULSE_AUTO",
    actorId: unit.id,
    artId: art.id,
    trigger,
    targetIds,
    damageByTarget,
    healingByTarget,
    pulseRays,
    mpCost: 0
  });
  return true;
}

// Shared Pyroclasm damage: 5 magic to every enemy on any of the 8 straight rays within
// range. Magic honors Defend halving, Dead Zone team reduction, Black Death immunity,
// and Bruiser-Mode magic vulnerability — exactly like resolveNuke, so a manual cast and
// the free Volcanic-Rage eruption resolve identically. Mutates `state`; returns the hit
// set for the event. Does NOT resolve victory (the caller does, after).
function applyPyroclasmDamage(state, actor, art) {
  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];
  for (const target of getPyroclasmTargets(state, actor, art)) {
    const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    if (dealt > 0 || damage > 0) { targetIds.push(target.id); damageByTarget[target.id] = damage; }
  }
  return { targetIds, damageByTarget, reactionEvents };
}


const ART_RESOLVERS = new Map([
  ["footwork", resolveRushPath],
  ["stumble", resolveRushPath],
  ["fart", resolveFart],
  ["volley-shot", resolveVolleyShot],
  ["cannon-fire", resolveCannonFire],
  ["flamethrower", resolveConeArt],
  ["pray", resolveHealAllies],
  ["wish", resolveHealAllies],
  ["silence", resolveStatusCast],
  ["smoke-bomb", resolveStatusCast],
  ["headlamp", resolveStatusCast],
  ["flee", resolveFlee],
  ["nuke", resolveNuke],
  ["dark-bomb", resolveNuke],
  ["summon-ghoul", resolveSummonGhoul],
  ["build-cover", resolveBuildCover],
  ["shaft-prop", resolveBuildCover],
  ["throw-cigar", resolveThrowCigar],
  ["lightseeker", resolveTilePulse],
  ["darkseeker", resolveTilePulse],
  ["heavenseeker", resolveTilePulse],
  // Angel: a friendly-only buff cast and a white-tile team heal.
  ["anoint", resolveAnoint],
  ["elevate", resolveHealAllies],
  // Mystic: friendly-only single-target cleanse.
  ["purify", resolveCleanseAlly],
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
  ["pyroclasm", resolvePyroclasm],
  // Nemesis: all-ray first-contact magic and the move+Pulse next-turn setup.
  ["dark-pulse", resolveDarkPulse],
  ["realm-traversal", resolveRealmTraversal],
  // Virus: a self-centred blind cloud and the two poison detonations (Poison Tick + Explosion).
  ["smog", resolveSmog],
  ["poison-tick", resolvePoisonBurst],
  ["explosion", resolvePoisonBurst],
  // Clod: a self-centred quake (variable magic + MP refund on a full-team hit), a STR-
  // scaling boulder throw with a guaranteed slow/crit-stun, and the RAGE targeted blast.
  ["quake", resolveQuake],
  ["stone-throw", resolveStoneThrow],
  ["thunderous-charge", resolveThunderousCharge],
  // Fat Wizard: Study mark, Clumsy splash casts, and direct HP/MP transfer.
  ["zap", resolveFatWizardZap],
  ["study", resolveStudy],
  ["surge", resolveFatWizardSurge],
  ["relay-power", resolveRelayPower],
  // Fat Cleric: a random-value team heal, a negative-only ally cleanse, and a roll-or-
  // backfire single-ally heal.
  ["hope", resolveHealAllies],
  ["cleanse", resolveCleanseAlly],
  ["focus-prayer", resolveFocusPrayer],
  // Miner: ore economy and a small demolition charge.
  ["ore-harvest", resolveOreHarvest],
  ["ore-abundance", resolveOreHarvest],
  ["blasting-cap", resolveBlastingCap],
  // Big Brother: targeted true/status attack, ally+enemy shove aura, global restore swap.
  ["force-tug", resolveForceTug],
  ["force-push", resolveForcePush],
  ["polarity-shift", resolvePolarityShift]
]);

export function useArt(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!canUseArt(state, result.unit, command.artId)) return reject(ERR.ART_NOT_AVAILABLE);
  const art = getArt(result.unit.type, command.artId);
  const resolver = ART_RESOLVERS.get(art.id) ?? resolveTargetedArt;
  return resolver(state, command, art);
}

function artKeepsActivationOpen(actor, art) {
  return Boolean(!art?.bonusActionGroup && getRageEffectValue(actor, "moveAndUseArts", false));
}

function completeArtUse(state, actor, art, keepsActivationOpen = artKeepsActivationOpen(actor, art)) {
  if (keepsActivationOpen) {
    state.activation.primaryUsed = true;
    return;
  }
  spendAndAdvance(state, actor);
}

function resolveRushPath(state, command, art) {
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

function fartPushDestination(actor, target) {
  const dx = Math.sign(target.position.x - actor.position.x);
  const dy = Math.sign(target.position.y - actor.position.y);
  if (Math.abs(target.position.x - actor.position.x) >= Math.abs(target.position.y - actor.position.y)) {
    return { x: target.position.x + dx, y: target.position.y };
  }
  return { x: target.position.x, y: target.position.y + dy };
}

function resolveFart(state, command, art) {
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
    const destination = fartPushDestination(actor, target);
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

function resolveTargetedArt(state, command, art) {
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

  // ART attacks roll to-hit like a basic attack (the ART's own status/heal check is
  // a SECOND, separate roll below). A missed swing deals no damage and lands no
  // effect, but the ART is still spent — you committed the activation and the MP.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    const desperationEvents = consumeOneShotRage(actor);
    spendAndAdvance(next, actor);
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
    // Rain Stance's global heal bonus rides on a successful heal; a raging Juggernaut's
    // Null Zone shuts all healing off (isHealingDisabled) regardless of the roll.
    const healing = successful ? Math.round(damage.damage / 2) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor) : 0;
    const restored = restoreHp(next, actor, actor, healing);
    effect = { attempted: true, applied: successful, healing: restored.hpRestored, mpRestored: restored.mpRestored };
  }

  const healingEvents = damage.type === "physical" ? resolvePhysicalDamageHealing(next, actor, damageDealt) : [];
  // Growth (Virus): restore MP when this cast poisons an enemy (Cough).
  const growthEvents = poisonedEnemy ? applyGrowth(next, actor, getPoisonMpRefund(actor)) : [];
  // Rock Hard (Clod): a defending Clod struck by a physical ART refunds MP (its damage
  // was already negated by resolveBaseStrike).
  const rockHardEvents = applyRockHardDefense(next, target, damage.type === "physical");
  const desperationEvents = consumeOneShotRage(actor);
  spendAndAdvance(next, actor);
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
    ...(effect ? { effect } : {})
  }, ...healingEvents, ...growthEvents, ...desperationEvents, ...rockHardEvents, ...(magicReaction ? [magicReaction] : [])]);
}

function clumsyEffect(actor) {
  return getUnitType(actor.type).passive?.effect?.type === "clumsyCast"
    ? getUnitType(actor.type).passive.effect
    : null;
}

function validateTargetedEnemyCast(state, actor, target, art) {
  if (!target || target.hp <= 0 || !areEnemies(actor, target)) return ERR.INVALID_TARGET;
  if (chebyshevDistance(actor.position, target.position) > getArtTargetRange(state, actor, art)) return ERR.TARGET_OUT_OF_RANGE;
  if (isWallBetween(state, actor.position, target.position, actor)) return ERR.TARGET_OBSTRUCTED;
  return null;
}

function applyStudyLeech(state, actor, target, damageDealt, events) {
  if (damageDealt <= 0) return;
  const reward = getMagicDamageReward(actor, target);
  if (!reward) return;
  const beforeHp = actor.hp;
  const beforeMp = actor.mp;
  restoreHp(state, actor, actor, reward.hp);
  restoreMp(state, actor, actor, reward.mp);
  const hpRestored = actor.hp - beforeHp;
  const mpRestored = actor.mp - beforeMp;
  if (hpRestored > 0 || mpRestored > 0) {
    events.push({ type: "STUDY_LEECH", actorId: actor.id, targetId: target.id, hpRestored, mpRestored });
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

function resolveFatWizardZap(state, command, art) {
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

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
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

function resolveStudy(state, command, art) {
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

function resolveFatWizardSurge(state, command, art) {
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
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
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

function resolveRelayPower(state, command, art) {
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: [from, { ...command.targetPosition }],
    mpCost: cost
  }]);
}

function resolveNuke(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const radius = getSelfBlastRadius(next, actor, art);
  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    mpCost: cost
  }, ...reactionEvents]);
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

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
    path: [from, { ...placement }], targetIds, damageByTarget, mpCost: cost
  }]);
}

// Pyroclasm (Gargoyle): a self-centred line burst — 5 magic to every enemy standing on
// any of the 8 straight rays within range (a wall/edge stops a ray; a body does NOT).
// Shares the magic-damage math with the free Volcanic-Rage eruption (applyPyroclasmDamage).
function resolvePyroclasm(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const { targetIds, damageByTarget, reactionEvents } = applyPyroclasmDamage(next, actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget, mpCost: cost
  }, ...reactionEvents]);
}

// Smog (Virus): a self-centred blind CLOUD — every enemy within the blast radius is
// blinded with no roll. A board-wide AoE status, so it applies directly (immunity
// respected) and is NOT reflected the way a single-target cast is (mirrors the Witch
// Doctor's global blind). Shares the nukeAura radius plumbing for its preview + reach.
function resolveSmog(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const statusTargets = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const applied = applyStatus(target, { type: art.effect.status, duration: art.effect.durationTurns });
    if (applied.applied) { target.statuses = applied.statuses; statusTargets.push(target.id); }
  }
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, statusTargets, mpCost: cost
  }]);
}

// Poison Tick / Explosion (Virus): a global detonation of poisoned enemies. Every
// poisoned enemy takes `damage.amount` TRUE damage (ignores DEF, Defend, team reduction);
// an optional `splash` also hits enemies within `splash.radius` of a poisoned enemy.
// `selfKill` consumes Virus (Explosion). No target, no roll.
function resolvePoisonBurst(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const amount = Math.max(0, Number(art.damage?.amount) || 0);
  const splash = art.splash ?? null;
  const poisoned = livingUnits(next).filter((unit) =>
    areEnemies(actor, unit) && (unit.statuses ?? []).some((status) => status.type === "poison"));
  const poisonedIds = new Set(poisoned.map((unit) => unit.id));

  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    let dealt = 0;
    if (poisonedIds.has(target.id)) {
      dealt = amount;
    } else if (splash && poisoned.some((p) => chebyshevDistance(p.position, target.position) <= splash.radius)) {
      dealt = Math.max(0, Number(splash.amount) || 0);
    }
    if (dealt <= 0) continue;
    const applied = Math.min(target.hp, dealt);
    target.hp = Math.max(0, target.hp - dealt);
    targetIds.push(target.id);
    damageByTarget[target.id] = applied;
  }

  if (art.selfKill) actor.hp = 0; // Explosion consumes Virus
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    ...(art.selfKill ? { selfDestruct: true } : {}), mpCost: cost
  }]);
}

// Quake (Clod): a self-centred ground slam. Every enemy within the radius takes the SAME
// (base + number caught) magic damage — magic honors Defend halving / Dead Zone / immunity
// like every self-centred blast. If the quake catches the ENTIRE enemy team, the MP is
// refunded (mirrors the Nemesis Dark Pulse refund).
function resolveQuake(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const enemies = livingUnits(next).filter((u) => areEnemies(actor, u) && chebyshevDistance(actor.position, u.position) <= radius);
  const totalEnemies = livingUnits(next).filter((u) => areEnemies(actor, u)).length;
  const amount = (art.damage?.amount ?? 3) + enemies.length;

  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];
  for (const target of enemies) {
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }

  const refunded = enemies.length > 0 && enemies.length === totalEnemies;
  const cost = getArtMpCost(actor, art, next);
  if (!refunded) actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    mpCost: cost, refunded, quakeAmount: amount
  }, ...reactionEvents]);
}

// Stone Throw (Clod): a STR-scaling physical boulder (fixed power that rises with STR above
// Clod's base, like Front Kick) that rolls to-hit/crit. On a LANDED hit it also applies a
// guaranteed status with NO roll — a crit stuns, otherwise it slows. A defending Rock-Hard
// target negates the damage but still eats the status; Stone Body reflects the status.
function resolveStoneThrow(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A thrown boulder is a physical ranged strike: a body OR a wall between blocks it.
  if (isShotBlocked(state, actorState.position, targetState.position, actorState) ||
      isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const actorStats = getEffectiveStats(actor, next);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 8) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical", critical: swing.critical && !ignoresCriticalDamage(target)
  });
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  let appliedStatus = null;
  if (target.hp > 0) {
    const spec = swing.critical ? art.onCrit : art.onHit;
    const res = applyRolledStatus(target, { ...spec, chance: 1 }, 0, actor);
    if (res.applied && !res.reflected) appliedStatus = spec.status;
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, roll: swing.hitRoll, damage, appliedStatus, mpCost: cost
  }, ...healingEvents, ...rockHardEvents]);
}

// Thunderous Charge (Clod, RAGE): Clod CHARGES to a clear tile within range and quakes a
// Chebyshev radius on landing: 10 physical (DEF + Defend still apply; a defending Rock Hard
// enemy negates it) and a guaranteed 1-turn stun to every enemy caught. He ends the turn
// standing on that tile. The stun is an AoE application (immunity respected, never reflected),
// like Smog.
function resolveThunderousCharge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const center = command.targetPosition;
  if (!center || !getTargetedBlastAimTiles(state, actorState, art).has(positionKey(center))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  // The blast is centered on where Clod lands; move him there first so the footprint (and
  // his committed position) agree. The tile is a validated clear landing spot.
  actor.position = { ...center };

  const radius = art.targeting?.radius ?? 2;
  const damageByTarget = {};
  const targetIds = [];
  const stunnedIds = [];
  const rockHardEvents = [];
  for (const target of getTargetedBlastTargets(next, actor, center, radius)) {
    const result = resolveDamage({
      attacker: { strength: art.damage.amount },
      defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
      type: "physical"
    });
    const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
    rockHardEvents.push(...applyRockHardDefense(next, target, true));
    if (target.hp > 0) {
      const applied = applyStatus(target, { type: "stun", duration: art.stun?.durationTurns ?? 1 });
      if (applied.applied) { target.statuses = applied.statuses; stunnedIds.push(target.id); }
    }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, from, center: { ...center },
    targetIds, damageByTarget, stunnedIds, mpCost: cost
  }, ...rockHardEvents]);
}

function serializePulseRays(rays) {
  return rays.map((ray) => ({
    dir: { ...ray.dir },
    distance: ray.distance,
    stopKind: ray.stopKind,
    position: { ...ray.position },
    ...(ray.targetId ? { targetId: ray.targetId } : {})
  }));
}

function applyDarkPulse(state, actor, art) {
  const targetIds = [];
  const damageByTarget = {};
  const healingByTarget = {};
  const reactionEvents = [];
  const pulseRays = getDarkPulseRays(state, actor);
  for (const { unit: targetRef } of pulseRays) {
    if (!targetRef) continue;
    const target = findUnit(state, targetRef.id);
    if (!target || target.hp <= 0) continue;
    targetIds.push(target.id);
    if (areAllies(actor, target)) {
      if (isHealingDisabled(state)) continue;
      const before = target.hp;
      target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + 1 + getGlobalHealBonus(state) + getCommandHealBonus(state, actor));
      const healed = target.hp - before;
      if (healed > 0) healingByTarget[target.id] = healed;
      continue;
    }

    const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    damageByTarget[target.id] = damage;
  }
  return { targetIds, damageByTarget, healingByTarget, pulseRays: serializePulseRays(pulseRays), reactionEvents };
}

function resolveDarkPulse(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const { targetIds, damageByTarget, healingByTarget, pulseRays, reactionEvents } = applyDarkPulse(next, actor, art);
  const refunded = targetIds.length >= (art.refundTargets ?? 4);
  if (!refunded) actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    healingByTarget,
    pulseRays,
    mpCost: cost,
    refunded
  }, ...reactionEvents]);
}

function resolveRealmTraversal(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  if (actor.realmTraversalLocked) return reject(ERR.ART_NOT_AVAILABLE);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.realmTraversalCharged = true;
  actor.realmTraversalLocked = true;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    realmTraversalCharged: true
  }]);
}

// A summoned piece is a full unit object (same shape createUnit produces) plus a
// `summonerId` so the per-Necromancer summon cap can find it. It spawns already
// `spent` so the turn loop never offers it an activation.
function createSummon(id, type, player, team, position, summonerId, skin = null) {
  const definition = getUnitType(type);
  return {
    id,
    player,
    team,
    type,
    skin,
    position: { ...position },
    hp: definition.stats.maxHp,
    mp: getInitialMp(definition),
    statModifiers: {},
    statuses: [],
    linkedStatMods: [],
    defending: false,
    spent: true,
    mageChargeCount: 0,
    stance: null,
    rainCharged: 0,
    realmTraversalCharged: false,
    realmTraversalLocked: false,
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
  const ghoul = createSummon(ghoulId, art.summon.type, actor.player, teamOfUnit(actor), placement, actor.id, actor.skin ?? null);
  next.units.push(ghoul);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    summonedUnitId: ghoulId,
    position: { ...placement },
    mpCost: cost
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

function resolveOreHarvest(state, command, art) {
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

function resolveBlastingCap(state, command, art) {
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

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
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

function resolveForceTug(state, command, art) {
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

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, damage: 0, mpCost: cost
    }]);
  }

  const damage = resolveBaseStrike(actor, target, { critical: swing.critical, state: next, damageType: art.damageType ?? "true" });
  const dealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);

  let effect = null;
  if (target.hp > 0) {
    const spec = swing.critical ? art.critEffect : art.effect;
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    effect = applyRolledStatus(target, spec, roll.value, actor, getGlobalStatusChanceMultiplier(next));
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    targetIds: [target.id],
    damageByTarget: { [target.id]: dealt },
    damage,
    hit: true,
    critical: swing.critical,
    roll: swing.hitRoll,
    ...(effect ? { effect } : {}),
    mpCost: cost
  }]);
}

function resolveForcePush(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = art.targeting?.radius ?? 1;
  const amount = art.damage?.amount ?? 2;
  const originalOccupied = new Set(livingUnits(next).map((unit) => positionKey(unit.position)));
  const pushed = {};
  const blocked = [];
  const damageByTarget = {};

  for (const target of livingUnits(next)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const destination = fartPushDestination(actor, target);
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

function resolvePolarityShift(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.restorePolarityShift = !Boolean(next.restorePolarityShift);
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    restorePolarityShift: next.restorePolarityShift,
    mpCost: cost
  }]);
}

function resolveThrowCigar(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFirePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "fire", turnsLeft: art.fire?.turns ?? 3 };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: cost
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
    const healAmount = Math.max(0, Number(art.effect.heal.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    if (healAmount > 0) {
      for (const ally of livingTeamUnits(next, actor)) {
        if (getTileAffinity(next, ally.position) !== art.effect.affinity) continue;
        if (!art.effect.global && chebyshevDistance(actor.position, ally.position) > (art.effect.range ?? 0)) continue;
        const restored = restoreHp(next, actor, ally, healAmount);
        const healed = restored.hpRestored;
        if (healed <= 0) continue;
        healTargetIds.push(ally.id);
        healingByTarget[ally.id] = healed;
      }
    }
  }

  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
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
    mpCost: cost,
    bonusActionGroup: art.bonusActionGroup ?? null
  }]);
}

function resolveHealAllies(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const keepsActivationOpen = artKeepsActivationOpen(actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const healingByTarget = {};
  const restoredByTarget = {};
  const targetIds = [];
  // A randomAmount heal (Fat Cleric's Hope) rolls ONE shared value in [min,max] from the
  // authoritative RNG and applies it to every ally — deterministic, so online clients agree.
  let base = Math.max(0, Number(art.effect.amount) || 0);
  if (art.effect.randomAmount) {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const min = Math.max(0, Number(art.effect.randomAmount.min) || 0);
    const max = Math.max(min, Number(art.effect.randomAmount.max) || 0);
    base = min + Math.floor(roll.value * (max - min + 1));
  }
  // Rain Stance's global heal bonus lifts every heal on the board (Pray/Wish too); a
  // raging Juggernaut's Null Zone zeroes all healing.
  const amount = base + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);

  for (const target of livingTeamUnits(next, actor)) {
    if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
    // Tile-affinity-gated heal (Angel's Elevate: only allies on a white/light tile).
    if (art.effect.affinity && getTileAffinity(next, target.position) !== art.effect.affinity) continue;
    const restored = restoreHp(next, actor, target, amount);
    const healed = restored.hpRestored;
    if (healed <= 0 && restored.mpRestored <= 0) continue;
    targetIds.push(target.id);
    if (healed > 0) healingByTarget[target.id] = healed;
    if (restored.mpRestored > 0) restoredByTarget[target.id] = restored.mpRestored;
  }

  completeArtUse(next, actor, art, keepsActivationOpen);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    healingByTarget,
    restoredByTarget,
    mpCost: cost
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
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const result = applyStatus(target, {
    type: art.effect.status,
    duration: art.effect.durationTurns,
    ...(art.effect.statModifiers ? { statModifiers: { ...art.effect.statModifiers } } : {})
  });
  if (result.applied) target.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
    effect: { status: art.effect.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

// "+1 STR" / "+2 STR / +1 DEF / +1 MOVE" — turns a statModifiers object into the
// label the view floats over a buffed unit. Kept here (not in the view layer) so
// the wording can never drift from the actual numbers applied above.
function resolveCleanseAlly(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const keepsActivationOpen = artKeepsActivationOpen(actor, art);
  const cost = getArtMpCost(actor, art, next);
  const target = findUnit(next, command.targetId);
  actor.mp -= cost;

  // A scoped cleanse (Fat Cleric's Cleanse) strips only the NEGATIVE statuses, leaving
  // friendly buffs intact; the default (Mystic's Purify) wipes the whole status stack.
  const before = target.statuses ?? [];
  const kept = art.effect?.scope === "negative" ? before.filter((status) => !isNegativeStatus(status)) : [];
  const hadStatuses = before.length > kept.length;
  target.statuses = kept;

  completeArtUse(next, actor, art, keepsActivationOpen);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    cleansed: hadStatuses ? [target.id] : []
  }]);
}

// Deterministically pick a status from a WEIGHTED misfire table using a [0,1) roll: an
// entry's chance is its weight over the total. Falls back to a uniform draw across the
// standard negative statuses when no table is authored. Higher weight → more likely.
function pickMisfireStatus(pool, roll) {
  if (!Array.isArray(pool) || !pool.length) {
    return NEGATIVE_STATUS_TYPES[Math.min(NEGATIVE_STATUS_TYPES.length - 1, Math.floor(roll * NEGATIVE_STATUS_TYPES.length))];
  }
  const total = pool.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
  if (total <= 0) return pool[0].status;
  let threshold = roll * total;
  for (const entry of pool) {
    threshold -= Math.max(0, Number(entry.weight) || 0);
    if (threshold < 0) return entry.status;
  }
  return pool[pool.length - 1].status;
}

// Focus Prayer (Fat Cleric): a friendly heal that ROLLS to-hit. A landed prayer heals the
// ally (heal bonuses + the global healing lockout apply, like every heal site); a MISS makes
// the prayer backfire and inflict ONE random NEGATIVE status on the ally for a turn (immunity
// respected centrally). Cannot self-cast. A blinded Cleric always misses, so she always
// backfires — the gamble is real. No "hit" key on the event, so the CPU/online routers treat
// it as an instant (non-combat) art.
function resolveFocusPrayer(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;

  const event = {
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    missed: swing.missed,
    critical: swing.critical
  };
  if (!swing.missed) {
    const heal = isHealingDisabled(next) ? 0 : Math.max(0, Number(art.heal?.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    const beforeHp = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + heal);
    const healed = target.hp - beforeHp;
    event.healingByTarget = healed > 0 ? { [target.id]: healed } : {};
  } else {
    // Pick one random negative status from a seeded draw and try to apply it for a turn.
    // A weighted misfire table (art.misfire.pool) biases the pick — Fat Cleric's stun is
    // rare; with no table it falls back to a uniform draw over the standard negatives.
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const status = pickMisfireStatus(art.misfire?.pool, roll.value);
    const result = applyStatus(target, { type: status, duration: art.misfire?.durationTurns ?? 1 });
    if (result.applied) target.statuses = result.statuses;
    event.effect = { attempted: true, applied: result.applied, status, ...(result.reason ? { reason: result.reason } : {}) };
  }

  spendAndAdvance(next, actor);
  return accept(next, [event]);
}

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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const event = {
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
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
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks a pure cast (Silence) just like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const keepsActivationOpen = artKeepsActivationOpen(actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const roll = drawValue(next.rngState, command.effectRoll);
  next.rngState = roll.rngState;
  // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
  // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
  const effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));

  completeArtUse(next, actor, art, keepsActivationOpen);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    effect: { ...effect, status: art.effect.status }
  }]);
}

function applyTrueSplashDamage(state, actor, center, { amount = 0, radius = 1 } = {}, excludeId = null) {
  const damageByTarget = {};
  const targetIds = [];
  const damage = Math.max(0, Number(amount) || 0);
  if (damage <= 0) return { targetIds, damageByTarget };
  for (const target of livingUnits(state)) {
    if (target.id === excludeId || !areEnemies(actor, target)) continue;
    if (chebyshevDistance(center, target.position) > radius) continue;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    if (dealt > 0) {
      targetIds.push(target.id);
      damageByTarget[target.id] = dealt;
    }
  }
  return { targetIds, damageByTarget };
}

function resolveCannonFire(state, command, art) {
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const damage = resolveFixedPhysicalStrike(actor, target, art.damage?.amount ?? 10, { critical: swing.critical, state: next });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);

  let stunned = false;
  if (swing.critical && target.hp > 0 && art.onCrit?.status) {
    const result = applyStatus(target, { type: art.onCrit.status, duration: art.onCrit.durationTurns ?? 1 });
    if (result.applied) {
      target.statuses = result.statuses;
      stunned = true;
    }
  }

  const splash = swing.critical
    ? applyTrueSplashDamage(next, actor, target.position, art.onCrit?.splash, target.id)
    : { targetIds: [], damageByTarget: {} };
  const rockHardEvents = applyRockHardDefense(next, target, true);
  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    hit: true,
    critical: swing.critical,
    stunned,
    roll: swing.hitRoll,
    damage,
    targetIds: [target.id, ...splash.targetIds],
    damageByTarget: { [target.id]: damageDealt, ...splash.damageByTarget },
    mpCost: cost
  }, ...healingEvents, ...rockHardEvents]);
}

function resolveConeArt(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const origin = getConeOriginForTarget(state, actorState, command.targetPosition, art);
  if (!origin) return reject(ERR.INVALID_TARGET);
  const cells = getConeCells(state, actorState, origin, art);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targetIds = [];
  const damageByTarget = {};
  const fireBased = isFireBasedDamage({ art });
  for (const position of cells) {
    const target = unitAt(next, position);
    if (!target || !areEnemies(actor, target)) continue;
    if (fireBased && isFireDamageImmune(target)) continue;
    const damage = art.damage.amount + (art.id === "volley-shot" ? getProximityBonus(actor, target) : 0);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetPosition: { ...origin },
    targetIds,
    damageByTarget,
    mpCost: cost
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost, stat, delta
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

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
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, revivedUnitId: revived.id, position: { ...placement }, mpCost: cost
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
  const cost = getArtMpCost(actor, art, next);
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
    const critical = swing.critical && !ignoresCriticalDamage(target);
    const baseAmount = critical ? Math.ceil(art.damage.amount * CRIT_MULTIPLIER) : art.damage.amount;
    const rawDamage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: baseAmount, art });
    if (rawDamage > 0) {
      const dealt = Math.min(target.hp, rawDamage);
      target.hp = Math.max(0, target.hp - rawDamage);
      applyMagicDamageReaction(target, dealt);
      damage = dealt;
      damageByTarget[target.id] = dealt;
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
    from, to: { ...destination }, damage, hit: true, rolled: grabsEnemy, critical: Boolean(swing?.critical && !ignoresCriticalDamage(target)),
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
  const cost = getArtMpCost(actor, art, next);
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
  // Rock Hard (Clod): a defending Clod negates this physical hit entirely.
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

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
    targetIds: [target.id], damageByTarget: { [target.id]: damage }, damage,
    hit: true, critical: swing.critical, stunned: Boolean(effect?.applied && !effect.reflected), mpCost: cost
  }, ...rockHardEvents]);
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
  const cost = getArtMpCost(actor, art, next);
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
  // Rock Hard (Clod): a defending Clod negates the kick's damage (the knockback below
  // is still governed by displacement rules, which Clod does not resist).
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

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
  }, ...healingEvents, ...stoneEvents, ...rockHardEvents]);
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
  const cost = getArtMpCost(actor, art, next);
  actor.position = destination;
  actor.defending = true;
  target.defending = true;
  actor.mp -= cost;

  let healed = 0;
  let mpRestored = 0;
  const healAmount = Number(getRageEffectValue(actor, "protectHeal", 0)) || 0;
  if (healAmount > 0) {
    const restored = restoreHp(next, actor, target, healAmount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
    healed = restored.hpRestored;
    mpRestored = restored.mpRestored;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, defended: [actor.id, target.id],
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    restoredByTarget: mpRestored > 0 ? { [target.id]: mpRestored } : {},
    mpCost: cost
  }]);
}

function resolveVolleyShot(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const origin = getVolleyShotOriginForTarget(state, actorState, command.targetPosition);
  if (!origin) return reject(ERR.INVALID_TARGET);
  return resolveConeArt(state, { ...command, targetPosition: origin }, art);
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
    const restored = restoreMp(next, actor, actor, art.restore?.mp ?? 0, { bypassPolarity: Boolean(art.restore?.bypassPolarity) });
    mpRestored = restored.mpRestored;
    hpHealed = restored.hpRestored;
  } else {
    const restored = restoreHp(next, actor, actor, art.restore?.hpIfFull ?? 0, { bypassPolarity: Boolean(art.restore?.bypassPolarity) });
    hpHealed = restored.hpRestored;
    mpRestored = restored.mpRestored;
    if ((hpHealed > 0 || mpRestored > 0) && art.nextTurnStatus) {
      const result = applyStatus(actor, {
        type: art.nextTurnStatus.type,
        duration: art.nextTurnStatus.duration,
        statModifiers: { ...(art.nextTurnStatus.statModifiers ?? {}) }
      });
      if (result.applied) actor.statuses = result.statuses;
    }
  }
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpRestored, hpHealed, mpCost: getArtMpCost(actor, art, next)
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
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.hp = 0; // the core is spent — the Juggernaut is consumed
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    selfDestruct: true, mpCost: cost
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
  const cost = getArtMpCost(actor, art, next); // 0 — commands are free
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, command: art.command.id, mpCost: 0
  }]);
}

