import { getAbilityUsesRemaining, getArtMpCost, getEffectiveStats } from "../unitCatalog.js";
import { areAllies, cloneState, findUnit } from "../state.js";
import { getArtTargetRange } from "../../rules/arts.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { restoreHp, restoreMp } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { spendAbilityUse } from "./abilityUses.js";

// Enrich (Treant): a friendly power transfer — restore MP to an ally within range (never
// self), or HP if that ally is already at full MP.
export function resolveEnrich(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || targetState.id === actorState.id || !areAllies(actorState, targetState)) {
    return reject(ERR.INVALID_TARGET);
  }
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp = Math.max(0, actor.mp - cost);
  const beforeHp = target.hp;
  const beforeMp = target.mp;
  const atFullMp = target.mp >= getEffectiveStats(target, next).maxMp;
  if (atFullMp) restoreHp(next, actor, target, art.effect?.hpIfFull ?? 0);
  else restoreMp(next, actor, target, art.effect?.mp ?? 0);
  const healed = target.hp - beforeHp;
  const restored = target.mp - beforeMp;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    mode: atFullMp ? "hp" : "mp",
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    restoredByTarget: restored > 0 ? { [target.id]: restored } : {}
  }]);
}

// Source Shift (Treant): pay 1 HP + 1 MP, then swap the Treant's current HP and MP pools
// (clamped to each maximum). A finite-use resource (Riot Cop's USES seam).
export function resolveSourceShift(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!actorState) return reject(ERR.INVALID_TARGET);
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  spendAbilityUse(actor, art);
  const cost = getArtMpCost(actor, art, next);
  const hpCost = art.hpCost ?? 0;
  const pooledMp = Math.max(0, actor.mp - cost);
  const pooledHp = Math.max(0, actor.hp - hpCost);
  const stats = getEffectiveStats(actor, next);
  actor.hp = Math.min(stats.maxHp, pooledMp); // HP becomes the (post-cost) MP value
  actor.mp = Math.min(stats.maxMp, pooledHp); // MP becomes the (post-cost) HP value
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    hpCost,
    hpAfter: actor.hp,
    mpAfter: actor.mp,
    usesLeft: getAbilityUsesRemaining(actor, art)
  }]);
}

// Petrify (Treant RAGE): become an invulnerable, dormant statue for a fixed number of
// turns. The per-turn restore/drain aura + the countdown are driven by turnEngine.js's
// auto-spend; this resolver just applies the marker status + the counter and spends the turn.
export function resolvePetrify(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!actorState) return reject(ERR.INVALID_TARGET);
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp = Math.max(0, actor.mp - cost);
  actor.defending = false;
  actor.petrified = Math.max(1, Number(art.petrify?.turns) || 1);
  const applied = applyStatus(actor, { type: "petrified", duration: "permanent", ignoreResistance: true });
  if (applied.applied) actor.statuses = applied.statuses;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    petrified: actor.petrified
  }]);
}

