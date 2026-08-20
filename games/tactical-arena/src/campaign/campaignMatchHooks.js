// Per-command campaign glue for a live match, extracted from main.js: records campaign
// observations after every applied command and surfaces condition-triggered dialogue beats.
// Presentation-free except for driving the shared dialogue system. The mission-scoped CPU
// ART rules live in campaignCpuRestrictions.js; this module only reads them.
//
// Runtime contract: `state`, `matchConfig`, `campaignMissionId`, `campaignMeta` gets.

import { WITCH_DOCTOR_MISSION_ID } from "./campaign.js";
import { campaignCpuExcludedArtIds as selectCampaignCpuExcludedArtIds } from "./campaignCpuRestrictions.js";
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
  // Mission-scoped CPU ART denylist. The rules themselves live in campaignCpuRestrictions.js;
  // this is just the runtime read.
  function campaignCpuExcludedArtIds() {
    return selectCampaignCpuExcludedArtIds({
      matchMode: runtime.matchConfig?.mode,
      campaignMissionId: runtime.campaignMissionId,
      campaignMeta: runtime.campaignMeta,
      state: runtime.state,
    });
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

  // A multi-stage campaign battle parks the match in a state that ONLY a dialogue beat can
  // leave: the stage has been won, the board has no opponent left on it, and `pendingStage`
  // is waiting for the beat whose afterAction rebuilds the next board. Campaign has no
  // concede button, so a beat that fails to run there is not a missed line — it is a stuck
  // match with nothing to press.
  //
  // So every path out of this function that does not open a dialogue hands the advance back.
  // `ensureFinalBattleStageAdvanced` is a no-op unless a stage really is pending, which makes
  // this free on the overwhelmingly common "no beat right now" path.
  //
  // It swallows its own failure on purpose: this is a best-effort backstop, and a recovery
  // that threw would mask whatever went wrong in the first place.
  function settleWithoutDialogue() {
    try {
      const settled = ensureFinalBattleStageAdvanced();
      if (settled && typeof settled.catch === "function") settled.catch(() => {});
    } catch {
      // nothing further to try; the beat path stays available for the next command
    }
  }

  function maybeShowCampaignDialogue() {
    if (runtime.matchConfig?.mode !== "campaign") return;
    // An open dialogue already owns the advance — its own continuation runs the same settle
    // when it closes — so bailing here is safe rather than merely convenient.
    if (dialogue.isOpen()) return;
    // A won stage normally reaches us already reopened, because recordCampaignProgress
    // reverts the engine's win the moment it sees `pendingStage`. Settling here anyway is
    // what keeps the recovery from depending on that having happened — advancing the stage
    // rebuilds the board with `phase: "playing"`, so it is also the correct repair.
    if (runtime.state.phase !== "playing") {
      settleWithoutDialogue();
      return;
    }

    const beat = nextCampaignDialogueBeat();
    if (!beat) {
      settleWithoutDialogue();
      return;
    }

    // Built BEFORE the beat is latched. `markShown()` is one-way, so burning the flag on a
    // script that then turns out to be empty — or that throws while being built — would
    // retire the only beat that can rebuild the board, with no way to ask for it again.
    let script;
    try {
      script = beat.script(runtime.state);
    } catch (error) {
      settleWithoutDialogue();
      throw error;
    }
    if (!script.length) {
      settleWithoutDialogue();
      return;
    }
    beat.markShown();

    // Beats can chain: a Final Battle stage change is a beat whose afterAction builds the NEXT
    // stage, which immediately has a beat of its own (the duel introducing itself). Re-asking
    // after each script closes is safe — every beat latches its own shown-flag, so this settles.
    void dialogue.show(script).then(
      async () => {
        await ensureFinalBattleStageAdvanced();
        maybeShowCampaignDialogue();
        maybeStartCpuTurn();
      },
      async () => {
        // A dialogue that fails to open or advance must not take the stage change with it.
        await ensureFinalBattleStageAdvanced();
        maybeStartCpuTurn();
      },
    );
  }

  return {
    campaignCpuExcludedArtIds,
    maybeShowCampaignDialogue,
    recordCampaignProgressHooks,
    recordCampaignRejection,
  };
}
