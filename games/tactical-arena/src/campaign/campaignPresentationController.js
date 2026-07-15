import { findUnit } from "../core/state.js";
import { getUnitType } from "../core/unitCatalog.js";
import { createBoardMetrics } from "../ui/isometric.js";
import {
  FINAL_BATTLE_STAGE_LAST_STAND,
  advanceFinalBattleStage,
  finalBattleDuelistType,
  getFinalBattleRules,
} from "./missions/the-final-battle/stages.js";
import {
  FINAL_BATTLE_MISSION_ID,
  MINER_MISSION_ID,
  MONK_MISSION_ID,
  RONIN_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  applyMonkTrialIntroBeat,
  applyVoidCastleIntroBeat,
  applyVoidCastlePartyHeal,
  applyVoidCastleSplit,
  campaignMapCutsceneScript,
  campaignPostMatchCutsceneScript,
  campaignRewardPickedScript,
  markCampaignMapCutsceneSeen,
  markCampaignPostMatchCutsceneSeen,
  shouldShowCampaignMapCutscene,
  shouldShowCampaignPostMatchCutscene,
} from "./campaign.js";

export function finalBattleStageCaption(state, rules) {
  if (!rules) return null;
  if (rules.stage === FINAL_BATTLE_STAGE_LAST_STAND) return "The Last Stand";
  const type = finalBattleDuelistType(state, rules.stage);
  const name = type ? getUnitType(type).name : "Alone";
  return `${name} · Duel ${rules.stage} of 4`;
}

export function createCampaignPresentationController({
  runtime,
  dialogue,
  blackout,
  effects,
  render = () => {},
  announceTurn = () => {},
  sleep = async () => {},
  startMatch = () => {},
  storage = globalThis.localStorage,
} = {}) {
  async function onCampaignMissionSelected(missionId, selectedSquad = null, options = {}) {
    if (!missionId || !shouldShowCampaignMapCutscene(storage, missionId)) return;
    const script = campaignMapCutsceneScript(missionId, selectedSquad, options);
    if (!script.length) return;
    await dialogue.show(script);
    if (missionId !== MINER_MISSION_ID && missionId !== RONIN_MISSION_ID) {
      markCampaignMapCutsceneSeen(storage, missionId);
    }
  }

  function onStartCampaignMission(config) {
    startMatch(config);
  }

  async function onCampaignMapEntered({ openCampaignRewardChoice } = {}) {
    const pending = runtime.pendingCampaignReward;
    if (!pending) return;
    runtime.pendingCampaignReward = null;
    if (shouldShowCampaignPostMatchCutscene(storage, pending.missionId)) {
      const script = campaignPostMatchCutsceneScript(pending.missionId, runtime.state);
      if (script.length) await dialogue.show(script);
      markCampaignPostMatchCutsceneSeen(storage, pending.missionId);
    }
    const picked = pending.packId
      ? await openCampaignRewardChoice?.({ skinPackId: pending.packId })
      : pending.unitPackId
        ? await openCampaignRewardChoice?.({ unitPackId: pending.unitPackId })
        : null;
    if (picked) {
      const closer = campaignRewardPickedScript(pending.missionId);
      if (closer.length) await dialogue.show(closer);
    }
  }

  async function handleDialogueLineAction(action) {
    if (runtime.matchConfig?.mode !== "campaign") return;
    if (runtime.campaignMissionId === FINAL_BATTLE_MISSION_ID) {
      await handleFinalBattleLineAction(action);
      return;
    }
    if (runtime.campaignMissionId === VOID_CASTLE_MISSION_ID) {
      await handleVoidCastleLineAction(action);
      return;
    }
    if (runtime.campaignMissionId !== MONK_MISSION_ID) return;
    if (action === "monkIntroRevealAndMove") {
      const realMonkId = runtime.state.missionRules?.monkTrial?.realMonkId;
      const from = realMonkId ? findUnit(runtime.state, realMonkId)?.position : null;
      runtime.state = applyMonkTrialIntroBeat(runtime.state, action);
      render();
      const moved = realMonkId ? findUnit(runtime.state, realMonkId) : null;
      if (from && moved) {
        runtime.resolving = true;
        await effects.animateMovement(moved.id, from, moved.position);
        runtime.resolving = false;
        render();
      }
      return;
    }
    if (action === "monkIntroSplitShuffle") {
      runtime.state = applyMonkTrialIntroBeat(runtime.state, action);
      render();
      effects.shake(5);
      await sleep(260);
    }
  }

  async function handleVoidCastleLineAction(action) {
    if (action === "voidCastleNemesisSplit") {
      runtime.state = applyVoidCastleIntroBeat(runtime.state, action);
      render();
      effects.shake(5);
      await sleep(260);
      return;
    }
    if (action === "voidCastleSummonerSplit") {
      runtime.state = applyVoidCastleSplit(runtime.state);
      render();
      effects.shake(9);
      await sleep(420);
      return;
    }
    if (action === "voidCastlePartyHeal") {
      runtime.state = applyVoidCastlePartyHeal(runtime.state);
      render();
      effects.shake(4);
      await sleep(320);
    }
  }

  async function runFinalBattleStageChange({ instant = false } = {}) {
    runtime.resolving = true;
    try {
      if (!instant && !blackout.isActive()) await blackout.enter();
      runtime.state = advanceFinalBattleStage(runtime.state);
      effects.setMetrics(createBoardMetrics(runtime.state.size));
      render();
      if (instant) {
        blackout.clear();
      } else {
        blackout.setCaption(finalBattleStageCaption(runtime.state, getFinalBattleRules(runtime.state)));
        await sleep(1150);
        await blackout.exit();
      }
    } finally {
      runtime.resolving = false;
    }
    render();
    announceTurn(runtime.state.currentPlayer);
  }

  async function handleFinalBattleLineAction(action) {
    if (action === "finalBattleBlackoutHold") {
      runtime.resolving = true;
      await blackout.enter();
      runtime.resolving = false;
      return;
    }
    if (action === "finalBattleBlackoutDuel" || action === "finalBattleBlackoutStand") {
      await runFinalBattleStageChange();
    }
  }

  async function ensureFinalBattleStageAdvanced() {
    if (runtime.matchConfig?.mode !== "campaign" || runtime.campaignMissionId !== FINAL_BATTLE_MISSION_ID) return;
    if (!getFinalBattleRules(runtime.state)?.pendingStage) return;
    await runFinalBattleStageChange({ instant: true });
  }

  function finalizeCampaignOpeningState() {
    if (runtime.matchConfig?.mode !== "campaign") return;
    if (runtime.campaignMissionId === FINAL_BATTLE_MISSION_ID) {
      if (getFinalBattleRules(runtime.state)?.stage !== 0) {
        blackout.clear();
        runtime.resolving = false;
        render();
        return;
      }
      runtime.state = advanceFinalBattleStage(runtime.state);
      effects.setMetrics(createBoardMetrics(runtime.state.size));
      blackout.clear();
      runtime.resolving = false;
      render();
      return;
    }
    if (runtime.campaignMissionId === VOID_CASTLE_MISSION_ID) {
      if (runtime.state.missionRules?.voidCastleTrial?.introComplete) return;
      runtime.state = applyVoidCastleIntroBeat(runtime.state, "voidCastleNemesisSplit");
      runtime.resolving = false;
      render();
      return;
    }
    if (runtime.campaignMissionId !== MONK_MISSION_ID) return;
    if (runtime.state.missionRules?.monkTrial?.introComplete) return;
    runtime.state = applyMonkTrialIntroBeat(runtime.state, "monkIntroComplete");
    runtime.resolving = false;
    render();
  }

  return {
    ensureFinalBattleStageAdvanced,
    finalizeCampaignOpeningState,
    handleDialogueLineAction,
    onCampaignMapEntered,
    onCampaignMissionSelected,
    onStartCampaignMission,
  };
}
