// Per-command campaign glue for a live match, extracted from main.js: records
// campaign observations after every applied command, surfaces condition-triggered
// dialogue beats, and owns the mission-scoped CPU ART denylist. Presentation-free
// except for driving the shared dialogue system.
//
// Runtime contract: `state`, `matchConfig`, `campaignMissionId`, `campaignMeta` gets.

import { getTileAffinity } from "../core/state.js";
import {
  FINAL_BATTLE_MISSION_ID,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  WITCH_DOCTOR_MISSION_ID,
} from "./campaign.js";
import {
  nextCampaignDialogueBeat as selectCampaignDialogueBeat,
  recordCampaignProgress,
} from "./campaignRuntime.js";

export function createCampaignMatchHooks({
  runtime,
  dialogue,
  ensureFinalBattleStageAdvanced = async () => {},
  maybeStartCpuTurn = () => {},
} = {}) {
  // Mission-scoped CPU ART denylist, threaded into chooseActivation's excludeArtIds. Two
  // missions use it: Mission 3's Rain Dance heal-stall cap (see WITCH_DOCTOR_HEAL_CAST_CAP),
  // and the finale's Banish gate.
  function campaignCpuExcludedArtIds() {
    if (runtime.matchConfig?.mode !== "campaign") return null;
    if (runtime.campaignMissionId === FINAL_BATTLE_MISSION_ID) return finalBattleExcludedArtIds();
    if (runtime.campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return null;
    if (runtime.campaignMeta.witchDoctorHealCastCount < WITCH_DOCTOR_HEAL_CAST_CAP) return null;
    return ["rain-dance"];
  }

  // Banish kills every enemy on a dark tile and costs Blacksword every point of HP he has
  // left — he does not survive casting it. Spending his life to take out one or two of you is
  // a bad trade he would never make, and the engine's own gate (any enemy on a dark tile) is
  // far too eager. So he only reaches for it when it takes the WHOLE party with him. That
  // makes it a real threat with a real answer: the party is never wiped by it unless all four
  // were standing on the dark, which is a thing the player controls.
  function finalBattleExcludedArtIds() {
    const state = runtime.state;
    const party = state.units.filter((unit) => unit.player === 1 && unit.hp > 0);
    const wipesParty = party.length > 0 &&
      party.every((unit) => getTileAffinity(state, unit.position) === "dark");
    return wipesParty ? null : ["banish-dark"];
  }

  function recordCampaignRejection(command, result) {
    if (runtime.matchConfig?.mode !== "campaign") return;
    if (runtime.campaignMissionId !== WITCH_DOCTOR_MISSION_ID) return;
    if (result?.errorCode !== "TARGET_OBSTRUCTED") return;
    if (command?.player !== 1) return;
    runtime.campaignMeta.blockedShotQueued = true;
    maybeShowCampaignDialogue();
  }

  function recordCampaignProgressHooks(command, result, beforeState = null) {
    recordCampaignProgress({
      matchMode: runtime.matchConfig?.mode,
      campaignMissionId: runtime.campaignMissionId,
      campaignMeta: runtime.campaignMeta,
      state: runtime.state,
      command,
      result,
      beforeState,
    });
    maybeShowCampaignDialogue();
  }

  function nextCampaignDialogueBeat() {
    return selectCampaignDialogueBeat({
      campaignMissionId: runtime.campaignMissionId,
      campaignMeta: runtime.campaignMeta,
      state: runtime.state,
    });
  }

  function maybeShowCampaignDialogue() {
    if (runtime.matchConfig?.mode !== "campaign" || dialogue.isOpen() || runtime.state.phase !== "playing") return;
    const beat = nextCampaignDialogueBeat();
    if (!beat) return;
    beat.markShown();
    const script = beat.script(runtime.state);
    if (!script.length) return;
    // Beats can chain: a Final Battle stage change is a beat whose afterAction builds the NEXT
    // stage, which immediately has a beat of its own (the duel introducing itself). Re-asking
    // after each script closes is safe — every beat latches its own shown-flag, so this settles.
    void dialogue.show(script).then(async () => {
      await ensureFinalBattleStageAdvanced();
      maybeShowCampaignDialogue();
      maybeStartCpuTurn();
    });
  }

  return {
    campaignCpuExcludedArtIds,
    maybeShowCampaignDialogue,
    recordCampaignProgressHooks,
    recordCampaignRejection,
  };
}
