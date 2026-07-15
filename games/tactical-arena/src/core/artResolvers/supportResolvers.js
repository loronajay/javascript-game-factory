import { getArtMpCost, getCommandHealBonus, getEffectiveStats } from "../unitCatalog.js";
import { areEnemies, areAllies, cloneState, findUnit, getTileAffinity, livingTeamUnits } from "../state.js";
import { getArtTargetRange, getTilePulseTargets } from "../../rules/arts.js";
import { isHealingDisabled, isWallBetween, rollToHit } from "../../rules/combat.js";
import { drawValue } from "../rng.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus, isNegativeStatus, NEGATIVE_STATUS_TYPES } from "../../rules/statuses.js";
import { getGlobalHealBonus, getGlobalStatusChanceMultiplier } from "../../rules/stances.js";
import { applyRolledStatus, restoreHp } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { artKeepsActivationOpen, completeArtUse } from "./artCompletion.js";

export function resolveTilePulse(state, command, art) {
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

export function resolveHealAllies(state, command, art) {
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
    const targetId = restored.targetId ?? target.id;
    if (!targetIds.includes(targetId)) targetIds.push(targetId);
    if (healed > 0) healingByTarget[targetId] = (healingByTarget[targetId] ?? 0) + healed;
    if (restored.mpRestored > 0) restoredByTarget[targetId] = (restoredByTarget[targetId] ?? 0) + restored.mpRestored;
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
export function resolveAnoint(state, command, art) {
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
export function resolveCleanseAlly(state, command, art) {
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
export function resolveFocusPrayer(state, command, art) {
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

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
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

export function resolveStatusCast(state, command, art) {
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
