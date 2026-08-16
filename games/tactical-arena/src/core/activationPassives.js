// Start-of-activation lifecycle passives, extracted from the reducer: Soul
// Shuffle's per-turn preview, the Fat Cleric's raging Emergency Snacks regen,
// and the Riot Cop's finite-ability refill/recharge. All deterministic (no
// rolls) and fired only on a FRESH activation, so online lockstep clients agree.


import {
  getRageEffectValue,
  getSoulShuffleChoices,
  getUnitType,
  initialAbilityUses,
  isRaging,
} from "./unitCatalog.js";


import { restoreHp, restoreMp } from "./combatEffects.js";


export function refreshSoulShuffle(state, unit) {
  if (getUnitType(unit.type).passive?.effect?.type !== "soulShuffle") return;
  const preview = getSoulShuffleChoices(unit, state.rngState);
  state.rngState = preview.rngState;
  unit.soulShuffleChoices = [...preview.choices];
}

// Passive resource income at the start of a unit's fresh activation. Miner uses this
// for natural ore generation; keeping the amount in unit data makes the lifecycle hook
// reusable and ensures re-selecting an already-open activation cannot pay twice.
export function applyTurnStartResourceGain(unit, events) {
  const definition = getUnitType(unit.type);
  const effect = definition.passive?.effect;
  const amount = Math.max(0, Number(effect?.turnStartResourceGain) || 0);
  if (amount <= 0) return false;
  const resource = effect.resource ?? "mp";
  const maxResource = resource === "mp" ? definition.stats.maxMp : Number.POSITIVE_INFINITY;
  const before = Math.max(0, Number(unit[resource]) || 0);
  unit[resource] = Math.min(maxResource, before + amount);
  const gained = unit[resource] - before;
  if (gained <= 0) return false;
  events.push({
    type: effect.type === "oreHarvester" ? "ORE_HARVESTER_GAIN" : "PASSIVE_RESOURCE_GAIN",
    unitId: unit.id,
    passiveId: definition.passive.id,
    resource,
    resourceGained: gained,
    resourceAfter: unit[resource],
    ...(effect.type === "oreHarvester" ? { oreGained: gained, oreAfter: unit[resource] } : {})
  });
  return true;
}

// Emergency Snacks (a `rageRegen` ragePassive): while raging, nibble `hp` HP back at the
// start of the turn. The turn that nibble lifts her back above the 5-HP rage threshold she
// also restores `exitMp`. Capped at `maxProcs` procs per battle (unit.emergencySnackCount,
// a hashed field). A board-wide healing lockout (a raging Juggernaut's Null Zone) shuts it
// off — and does NOT burn a proc. Returns true when it actually restored something.
function getRageRegen(unit) {
  if (!isRaging(unit)) return null;
  const effect = getUnitType(unit.type).ragePassive?.effect;
  return effect?.type === "rageRegen" ? effect : null;
}

export function applyRageRegen(state, unit, events) {
  const regen = getRageRegen(unit);
  if (!regen) return false;
  if ((unit.emergencySnackCount ?? 0) >= (regen.maxProcs ?? Infinity)) return false;
  const beforeHp = unit.hp;
  const beforeMp = unit.mp;
  const wasBelowThreshold = beforeHp <= 5;
  restoreHp(state, unit, unit, regen.hp ?? 0);
  unit.emergencySnackCount = (unit.emergencySnackCount ?? 0) + 1;
  if (wasBelowThreshold && unit.hp > 5) {
    restoreMp(state, unit, unit, regen.exitMp ?? 0);
  }
  events.push({ type: "EMERGENCY_SNACK", unitId: unit.id, hpRestored: unit.hp - beforeHp, mpRestored: unit.mp - beforeMp });
  return true;
}

// Riot Cop's finite ability uses. Fired at the start of each fresh activation: the
// RAGE entry refill (Lockdown), and the one-full-turn-empty recharge for any depleted
// pool. Data-first off `art.uses` + the ragePassive `refreshResources` flag, so it is a
// no-op for every unit without finite-use arts.
export function applyAbilityRecharge(unit) {
  const definition = getUnitType(unit.type);
  const useArts = (definition.arts ?? []).filter((art) => Number.isFinite(art.uses));
  if (!useArts.length) return;
  if (!unit.abilityUses) unit.abilityUses = initialAbilityUses(definition);
  if (!unit.abilityRecharge) unit.abilityRecharge = {};

  // Lockdown (RAGE): the instant Riot Cop rages, refill every finite pool to full — once
  // per rage window, re-armable if he ever climbs back above the threshold.
  if (isRaging(unit) && getRageEffectValue(unit, "refreshResources", false)) {
    if (!unit.lockdownRefreshed) {
      unit.abilityUses = initialAbilityUses(definition);
      unit.abilityRecharge = {};
      unit.lockdownRefreshed = true;
    }
  } else if (!isRaging(unit)) {
    unit.lockdownRefreshed = false;
  }

  // A pool at 0 must experience one FULL turn empty before it restores: the turn it hits
  // 0 doesn't count, the next turn it is empty (counter → 1), and the turn after that it
  // restores to full (counter reaches the 2 threshold at this turn's start).
  for (const art of useArts) {
    const remaining = Number.isFinite(unit.abilityUses[art.id]) ? unit.abilityUses[art.id] : art.uses;
    if (remaining > 0) { delete unit.abilityRecharge[art.id]; continue; }
    const waited = (unit.abilityRecharge[art.id] ?? 0) + 1;
    if (waited >= 2) {
      unit.abilityUses[art.id] = art.uses;
      delete unit.abilityRecharge[art.id];
    } else {
      unit.abilityRecharge[art.id] = waited;
    }
  }
}
