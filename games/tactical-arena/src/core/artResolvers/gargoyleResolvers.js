import { getArt, getArtMpCost, getEffectiveStats, isDefending } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits } from "../state.js";
import { getFlightTiles, getPyroclasmTargets } from "../../rules/arts.js";
import { finalizeMagicDamage } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { chebyshevDistance, positionKey } from "../../rules/movement.js";
import { applyMagicDamageReaction } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

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

// Shared Pyroclasm damage: magic damage to every enemy on any of the 8 straight rays within
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

export function resolveFlight(state, command, art) {
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

// Pyroclasm (Gargoyle): a self-centred line burst — magic damage to every enemy standing on
// any of the 8 straight rays within range (a wall/edge stops a ray; a body does NOT).
// Shares the magic-damage math with the free Volcanic-Rage eruption (applyPyroclasmDamage).
export function resolvePyroclasm(state, command, art) {
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
