// Mission-scoped CPU ART denylists, threaded into chooseActivation's `excludeArtIds`.
//
// Two missions restrict what the CPU is allowed to reach for, and both are about the shape
// of the encounter rather than about balance numbers:
//
//   Mission 3 (Witch Doctor) — a heal-stall cap, so Rain Dance cannot turn the fight into
//   an unwinnable clock once it has been cast WITCH_DOCTOR_HEAL_CAST_CAP times.
//
//   Mission 22 (The Final Battle) — the Banish gate, below.
//
// Pure functions over a state: no runtime, no presentation, so each rule is testable on its
// own and the hooks module stays wiring.

import { getTileAffinity } from "../core/state.js";
import { FINAL_BATTLE_MISSION_ID, WITCH_DOCTOR_HEAL_CAST_CAP, WITCH_DOCTOR_MISSION_ID } from "./campaign.js";

// Banish kills every enemy on a dark tile and costs Blacksword every point of HP he has
// left — he does not survive casting it. Spending his life to take out one or two of you is
// a bad trade he would never make, and the engine's own gate (any enemy on a dark tile) is
// far too eager. So he only reaches for it when it takes the WHOLE party with him. That
// makes it a real threat with a real answer: the party is never wiped by it unless all four
// were standing on the dark, which is a thing the player controls.
export function finalBattleExcludedArtIds(state) {
  const party = (state?.units ?? []).filter((unit) => unit.player === 1 && unit.hp > 0);
  const wipesParty = party.length > 0 &&
    party.every((unit) => getTileAffinity(state, unit.position) === "dark");
  return wipesParty ? null : ["banish-dark"];
}

export function witchDoctorExcludedArtIds(healCastCount) {
  return (healCastCount ?? 0) < WITCH_DOCTOR_HEAL_CAST_CAP ? null : ["rain-dance"];
}

export function campaignCpuExcludedArtIds({ matchMode, campaignMissionId, campaignMeta, state } = {}) {
  if (matchMode !== "campaign") return null;
  if (campaignMissionId === FINAL_BATTLE_MISSION_ID) return finalBattleExcludedArtIds(state);
  if (campaignMissionId === WITCH_DOCTOR_MISSION_ID) {
    return witchDoctorExcludedArtIds(campaignMeta?.witchDoctorHealCastCount);
  }
  return null;
}
