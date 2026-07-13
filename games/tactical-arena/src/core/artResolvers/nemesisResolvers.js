import { getArt, getArtMpCost, getCommandHealBonus, getEffectiveStats, isDefending } from "../unitCatalog.js";
import { areAllies, cloneState, findUnit } from "../state.js";
import { getDarkPulseRays } from "../../rules/arts.js";
import { finalizeMagicDamage, isHealingDisabled } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { getGlobalHealBonus } from "../../rules/stances.js";
import { applyMagicDamageReaction } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

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

function serializePulseRays(rays) {
  return rays.map((ray) => ({
    dir: { ...ray.dir },
    distance: ray.distance,
    stopKind: ray.stopKind,
    position: { ...ray.position },
    ...(ray.targetId ? { targetId: ray.targetId } : {})
  }));
}

export function applyDarkPulse(state, actor, art) {
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

export function resolveDarkPulse(state, command, art) {
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

export function resolveRealmTraversal(state, command, art) {
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
