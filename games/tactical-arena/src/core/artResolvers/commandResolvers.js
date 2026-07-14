import { getArtMpCost, getEffectiveStats } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit, livingUnits } from "../state.js";
import { getSelfBlastRadius } from "../../rules/arts.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { restoreHp, restoreMp } from "../combatEffects.js";
import { accept } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { applyBeckonedGhostSacrifice } from "../ghostSacrifice.js";

// Recharge: vent the reactor. Restore MP up to full; if already at full MP, mend 1 HP
// instead — the mend is a heal, so a board-wide healing lockout (a raging Juggernaut's
// own Null Zone) shuts it off. Spends the activation like any ART.
export function resolveRecharge(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const stats = getEffectiveStats(actor, next);
  let mpRestored = 0;
  let hpHealed = 0;
  let recipientId = actor.id;
  if (actor.mp < stats.maxMp) {
    const restored = restoreMp(next, actor, actor, art.restore?.mp ?? 0, { bypassPolarity: Boolean(art.restore?.bypassPolarity) });
    mpRestored = restored.mpRestored;
    hpHealed = restored.hpRestored;
    recipientId = restored.targetId ?? actor.id;
  } else {
    const restored = restoreHp(next, actor, actor, art.restore?.hpIfFull ?? 0, { bypassPolarity: Boolean(art.restore?.bypassPolarity) });
    hpHealed = restored.hpRestored;
    mpRestored = restored.mpRestored;
    recipientId = restored.targetId ?? actor.id;
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
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpRestored, hpHealed, recipientId, mpCost: getArtMpCost(actor, art, next)
  }]);
}

// Self Destruct (RAGE): overload the core for 10 TRUE damage to every enemy within the
// blast radius — ignoring DEF, Defend, and team reduction — at the cost of the
// Juggernaut's own life. Reuses the nukeAura targeting/preview; the caster is set to 0 HP.
export function resolveSelfDestruct(state, command, art) {
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
  applyBeckonedGhostSacrifice(next, actor);
  resolveVictory(next, { actionTakerTeam: actor.player });
  if (next.phase === "playing") {
    spendAndAdvance(next, actor);
    resolveVictory(next, { actionTakerTeam: actor.player });
  }
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
export function resolveKingCommand(state, command, art) {
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
