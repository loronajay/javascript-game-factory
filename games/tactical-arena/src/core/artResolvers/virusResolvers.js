import { getArtMpCost } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, getTileAffinity, livingUnits } from "../state.js";
import { getSelfBlastRadius } from "../../rules/arts.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { applyDarkTreadLifesteal } from "../combatEffects.js";
import { accept } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveSmog(state, command, art) {
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
export function resolvePoisonBurst(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const hpCost = art.hpCost ?? 0;
  // Dark Tick (Blacksword) pays HP; Virus's Poison Tick / Explosion (and Banish's all-HP
  // cost, which rides on selfKill below) keep paying MP.
  if (hpCost > 0) actor.hp = Math.max(0, actor.hp - hpCost);
  else actor.mp -= cost;

  const amount = Math.max(0, Number(art.damage?.amount) || 0);
  const splash = art.splash ?? null;
  // The "affected" set: enemies carrying a status (poison / blind) OR standing on a given
  // tile affinity (Banish's dark tiles). Defaults to poison so Virus stays unchanged.
  const condition = art.condition ?? { status: "poison" };
  const matches = (unit) => condition.status
    ? (unit.statuses ?? []).some((status) => status.type === condition.status)
    : getTileAffinity(next, unit.position) === condition.affinity;
  const affected = livingUnits(next).filter((unit) => areEnemies(actor, unit) && matches(unit));
  const affectedIds = new Set(affected.map((unit) => unit.id));

  const damageByTarget = {};
  const targetIds = [];
  const damaged = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    let dealt = 0;
    if (affectedIds.has(target.id)) {
      dealt = amount;
    } else if (splash && affected.some((p) => chebyshevDistance(p.position, target.position) <= splash.radius)) {
      dealt = Math.max(0, Number(splash.amount) || 0);
    }
    if (dealt <= 0) continue;
    const applied = Math.min(target.hp, dealt);
    target.hp = Math.max(0, target.hp - dealt);
    targetIds.push(target.id);
    damageByTarget[target.id] = applied;
    if (applied > 0) damaged.push(target);
  }

  // Dark Tread lifesteal on Dark Tick's dark-tile hits (skipped for a self-killing Banish,
  // which consumes Blacksword anyway).
  const darkTreadEvents = art.selfKill ? [] : applyDarkTreadLifesteal(next, actor, damaged);
  if (art.selfKill) actor.hp = 0; // Explosion consumes Virus / Banish consumes Blacksword
  if (art.selfKill) {
    resolveVictory(next, { actionTakerTeam: actor.player });
    if (next.phase === "playing") {
      spendAndAdvance(next, actor);
      resolveVictory(next, { actionTakerTeam: actor.player });
    }
  } else {
    spendAndAdvance(next, actor);
    resolveVictory(next);
  }
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    ...(art.selfKill ? { selfDestruct: true } : {}),
    mpCost: hpCost > 0 ? 0 : cost,
    ...(hpCost > 0 ? { hpCost } : {})
  }, ...darkTreadEvents]);
}

// Quake (Clod): a self-centred ground slam. Every enemy within the radius takes the SAME
// (base + number caught) magic damage — magic honors Defend halving / Dead Zone / immunity
// like every self-centred blast. If the quake catches the ENTIRE enemy team, the MP is
// refunded (mirrors the Nemesis Dark Pulse refund).
