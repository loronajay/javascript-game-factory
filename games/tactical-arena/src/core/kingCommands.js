// The King's command buffs, extracted from unitCatalog: which commands are live
// for a unit's squad and the stat/heal/range bonuses they grant. unitCatalog
// re-exports the public surface.

import { areAllies } from "./state.js";

import { isCommandOnly, getUnitType, getArt, isRaging } from "./unitRegistry.js";

export function activeCommandData(king) {
  if (!king.command) return null;
  return getArt(king.type, king.command)?.command ?? null;
}
export function activeCommanderKings(unit, state) {
  if (!state?.units) return [];
  return state.units.filter((king) =>
    king.hp > 0 &&
    getUnitType(king.type).actsFirst &&
    king.command &&
    king.commandTurn === state.turnNumber &&
    areAllies(king, unit));
}
export function ragingAllyCount(state, ref) {
  if (!state?.units) return 0;
  return state.units.filter((u) => u.hp > 0 && areAllies(u, ref) && isRaging(u)).length;
}

// The live stat buff an active allied King grants `unit` this turn ({} if none). The
// King never buffs himself (a Pursue +MOVE must not make the immobile King mobile), so
// commandOnly units are excluded. Every buffed value gains +1 per allied unit in RAGE;
// Strike's base is lifted when the King's previous command matches `prevOverride`.
export function getCommandBuffStats(unit, state) {
  if (isCommandOnly(unit)) return {};
  const totals = {};
  for (const king of activeCommanderKings(unit, state)) {
    const cmd = activeCommandData(king);
    if (!cmd?.stats) continue;
    const base = (cmd.prevOverride && king.previousCommand && cmd.prevOverride[king.previousCommand]) || cmd.stats;
    const rage = ragingAllyCount(state, king);
    for (const [name, value] of Object.entries(base)) {
      if (!Number.isFinite(value)) continue;
      const scaled = value + rage;
      // Two Kings on one team don't stack — take the strongest per stat.
      totals[name] = name in totals ? Math.max(totals[name], scaled) : scaled;
    }
  }
  return totals;
}

// Hold's "+1 to all healing this turn" (+1 per raging ally). Team-scoped, so it takes
// the healed unit's actor/team context. 0 when no allied King holds Hold this turn.
export function getCommandHealBonus(state, actor) {
  let bonus = 0;
  for (const king of activeCommanderKings(actor, state)) {
    const cmd = activeCommandData(king);
    if (!Number.isFinite(cmd?.healBonus) || cmd.healBonus <= 0) continue;
    bonus = Math.max(bonus, cmd.healBonus + ragingAllyCount(state, king));
  }
  return bonus;
}

// Higher Ground's "+1 range, area ARTS included" (+1 per raging ally). The attack/
// targeted-ART range rides on the attackRange stat buff (getCommandBuffStats); this is
// the extra reach folded into the AOE/placement/line geometry in rules/arts.js.
export function getCommandRangeBonus(state, actor) {
  let bonus = 0;
  for (const king of activeCommanderKings(actor, state)) {
    const cmd = activeCommandData(king);
    if (!Number.isFinite(cmd?.rangeBonus) || cmd.rangeBonus <= 0) continue;
    bonus = Math.max(bonus, cmd.rangeBonus + ragingAllyCount(state, king));
  }
  return bonus;
}

// Runtime modifiers are deliberately numeric and additive. Status effects,
// map auras, and future ARTS can feed this same seam without teaching every
// ability about one another. Per-unit passives apply after external modifiers.
