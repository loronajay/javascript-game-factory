import { getArtMpCost, getCommandHealBonus, getEffectiveStats } from "../unitCatalog.js";
import { cloneState, findUnit, livingTeamUnits, livingUnits } from "../state.js";
import { isHealingDisabled } from "../../rules/combat.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { applyStatus } from "../../rules/statuses.js";
import { getGlobalHealBonus } from "../../rules/stances.js";
import { accept } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";
import { formatStatModifierLabel } from "./resolverLabels.js";

export function resolveWitchDance(state, command, art) {
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
