import { getArtMpCost, getEffectiveStats, isDefending } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits } from "../state.js";
import { getLegalFleeTiles, getSelfBlastRadius } from "../../rules/arts.js";
import { finalizeMagicDamage } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { chebyshevDistance, positionKey } from "../../rules/movement.js";
import { applyMagicDamageReaction } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveFlee(state, command, art) {
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

export function resolveNuke(state, command, art) {
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

