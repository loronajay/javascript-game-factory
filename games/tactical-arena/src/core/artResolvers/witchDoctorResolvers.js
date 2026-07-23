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
    // A dance is a BONUS ACTION (it does not spend the activation), so the self-buff is
    // live for the Witch Doctor's own follow-up move/attack this same turn and is ticked
    // off at the end of the full activation — exactly "for this turn". A legacy
    // turn-spending dance (no bonusActionGroup) still needs +1 duration so the buff
    // survives its own end-of-turn tick to reach his NEXT turn. Ally buffs (teamBuff) need
    // no bonus: the caster's tick doesn't touch an ally's statuses.
    const result = applyStatus(actor, {
      type: "empowered",
      duration: (art.selfBuff.durationTurns ?? 1) + (art.bonusActionGroup ? 0 : 1),
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
      // The caster is exempt from his own global status: Black Death Dance blinds the whole
      // board, but the Witch Doctor must stay clear-eyed so the self-buff it grants can
      // actually power his own same-turn attack. (Previously the dance spent his turn, so
      // the 1-turn blind ticked off him before he acted; as a bonus action that no longer
      // happens, so the exemption is made explicit here.)
      if (target.id === actor.id) continue;
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
  // A dance is a bonus action (Paladin's seeker pattern): it enters its stance and fires
  // its effect but does NOT spend the activation, so the Witch Doctor can still move and
  // attack this turn. The shared "dance" group is marked used so he can only dance once.
  if (art.bonusActionGroup) {
    next.activation.bonusActionGroups = [
      ...(next.activation.bonusActionGroups ?? []),
      art.bonusActionGroup
    ];
    event.bonusActionGroup = art.bonusActionGroup;
  } else {
    spendAndAdvance(next, actor);
  }
  resolveVictory(next);
  return accept(next, [event]);
}
