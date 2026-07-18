// Turn/results announcement + end-of-match orchestration, extracted from main.js.
// Owns the turn flash on player change and everything that happens between the
// final blow and the results screen: online Valor claiming, campaign mission
// completion, reward-pack gating (which routes the results screen back through
// the map), and the per-mission defeat/loss dialogue beats.
//
// Runtime contract: `state`, `matchConfig`, `campaignMissionId`, `campaignMeta`,
// `matchStartedAt`, `initialHpByPlayer`, `mySeat`, `net` gets; `resultsTimer`
// get/set; `pendingCampaignReward` set.

import {
  BROTHERS_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  voidCastleDefeatScript,
  finalBattleBanishScript,
  finalBattleDefeatScript,
  brothersDefeatScript,
  completeCampaignMission,
  getCampaignMission,
  hasbeenHeroesDefeatScript,
  minerDefeatScript,
  notMyKingDefeatScript,
  outOfRetirementDefeatScript,
  paladinDefeatScript,
  showdownDefeatScript,
  shouldShowCampaignPostMatchCutscene,
  voidwoodDefeatScript,
} from "../campaign/campaign.js";
import { isCampaignSkinRewardGranted, isCampaignUnitRewardGranted } from "../progression/unlocks.js";
import { claimOnlineMatchValorReward } from "../progression/valorRewards.js";
import { buildSummary, teamColor } from "../match/matchBuilder.js";
import { isTempoBattle } from "../core/tempoBattle.js";
import { shouldShowTurnAnnouncement, turnAnnouncementSub } from "./turnAnnouncement.js";

// Missions that play a beat from the losing side between the final blow and the results
// screen. Keyed by mission id; `flag` is the campaignMeta latch that keeps the beat from
// replaying if victory resolves more than once in a match.
const CAMPAIGN_DEFEAT_BEATS = Object.freeze({
  [NOT_MY_KING_MISSION_ID]: { flag: "notMyKingDefeatDialogueShown", script: notMyKingDefeatScript },
  [SHOWDOWN_MISSION_ID]: { flag: "showdownDefeatDialogueShown", script: showdownDefeatScript },
  [VOIDWOOD_MISSION_ID]: { flag: "voidwoodDefeatDialogueShown", script: voidwoodDefeatScript },
  [OUT_OF_RETIREMENT_MISSION_ID]: { flag: "outOfRetirementDefeatDialogueShown", script: outOfRetirementDefeatScript },
  [PALADIN_MISSION_ID]: { flag: "paladinDefeatDialogueShown", script: paladinDefeatScript },
  [MINER_MISSION_ID]: { flag: "minerDefeatDialogueShown", script: minerDefeatScript },
  [HASBEEN_HEROES_MISSION_ID]: { flag: "hasbeenDefeatDialogueShown", script: hasbeenHeroesDefeatScript },
  [BROTHERS_MISSION_ID]: { flag: "brothersDefeatDialogueShown", script: brothersDefeatScript },
  [VOID_CASTLE_MISSION_ID]: { flag: "voidCastleDefeatDialogueShown", script: voidCastleDefeatScript },
  [FINAL_BATTLE_MISSION_ID]: { flag: "finalBattleDefeatDialogueShown", script: finalBattleDefeatScript },
});

export function createMatchOutcomeController({
  runtime,
  turnFlash,
  menu,
  dialogue,
  setMessage,
  isCpu,
  storage = globalThis.localStorage,
  clock = globalThis,
  syncGameProgress = () => {},
} = {}) {
  // The mirror image: a beat that plays when the PLAYER loses, between the final blow and the
  // results screen. Only the finale has one, and only for one specific way of losing —
  // Blacksword's Banish, which spends his own life to take the whole party with him. It is the
  // one loss in the game that is a deliberate, earned play by the enemy rather than a grind,
  // and it deserves to be acknowledged instead of dumped straight onto a defeat screen.
  // `when` gates it so an ordinary defeat still goes quietly to results.
  const CAMPAIGN_LOSS_BEATS = Object.freeze({
    [FINAL_BATTLE_MISSION_ID]: {
      flag: "finalBattleBanishDialogueShown",
      script: finalBattleBanishScript,
      when: () => runtime.campaignMeta.finalBattleBanished,
    },
  });

  function announceTurn(player, { hold = false } = {}) {
    const state = runtime.state;
    if (state.phase === "complete") {
      const summary = buildSummary(state, { matchStartedAt: runtime.matchStartedAt, initialHpByPlayer: runtime.initialHpByPlayer });
      turnFlash.announce({ title: `${summary.winnerLabel ?? `Player ${state.winner}`} wins`, sub: "Victory", color: summary.winnerColor ?? teamColor(state.winner, state), hold: true });
      return;
    }
    turnFlash.announce({
      title: `Player ${player} squad turn`,
      sub: turnAnnouncementSub({ matchMode: runtime.matchConfig?.mode, player, mySeat: runtime.mySeat, isCpu: isCpu(player) }),
      color: teamColor(player, state),
      hold
    });
  }

  function announceTurnChange(prevPlayer) {
    const state = runtime.state;
    if (!shouldShowTurnAnnouncement({
      tempo: isTempoBattle(state),
      phase: state.phase,
      currentPlayer: state.currentPlayer,
      prevPlayer
    })) return;
    if (state.phase === "complete") {
      runtime.net?.endMatch(); // clean finish: let the session keep the socket alive briefly for the peer
      announceTurn(state.winner);
      const summary = buildSummary(state, { matchStartedAt: runtime.matchStartedAt, initialHpByPlayer: runtime.initialHpByPlayer });
      claimOnlineMatchValorReward(storage, summary, { matchConfig: runtime.matchConfig, match: state, mySeat: runtime.mySeat });
      const campaignMissionId = runtime.campaignMissionId;
      if (runtime.matchConfig?.mode === "campaign" && campaignMissionId) {
        summary.campaign = completeCampaignMission(storage, campaignMissionId, state, { ...runtime.campaignMeta });
        void syncGameProgress();
        // Choice-reward missions run their reward pick on the map AFTER results.
        // Only queue it on a win whose reward hasn't already been
        // granted, and force the results screen to route back through the map so the
        // post-match cutscene + reward pick can't be skipped.
        const mission = getCampaignMission(campaignMissionId);
        const rewardPack = mission?.rewardSkinPack ?? null;
        const rewardUnitPack = mission?.rewardUnitChoicePack ?? null;
        if (
          rewardPack &&
          state.winner === 1 &&
          !isCampaignSkinRewardGranted(storage, rewardPack)
        ) {
          runtime.pendingCampaignReward = { missionId: campaignMissionId, packId: rewardPack };
          summary.campaign.forceMapReturn = true;
        } else if (
          rewardUnitPack &&
          state.winner === 1 &&
          !isCampaignUnitRewardGranted(storage, rewardUnitPack)
        ) {
          runtime.pendingCampaignReward = { missionId: campaignMissionId, unitPackId: rewardUnitPack };
          summary.campaign.forceMapReturn = true;
        } else if (
          state.winner === 1 &&
          shouldShowCampaignPostMatchCutscene(storage, campaignMissionId)
        ) {
          runtime.pendingCampaignReward = { missionId: campaignMissionId, packId: null };
          summary.campaign.forceMapReturn = true;
        }
      }
      const showResults = () => {
        clock.clearTimeout(runtime.resultsTimer);
        runtime.resultsTimer = clock.setTimeout(() => menu.showResults(summary), 1600);
      };
      const beat = state.winner === 1
        ? CAMPAIGN_DEFEAT_BEATS[campaignMissionId]
        : CAMPAIGN_LOSS_BEATS[campaignMissionId];
      if (beat && !runtime.campaignMeta[beat.flag] && (beat.when ? beat.when() : true)) {
        runtime.campaignMeta[beat.flag] = true;
        const script = beat.script(state);
        if (script.length) {
          void dialogue.show(script).then(showResults);
        } else {
          showResults();
        }
      } else {
        showResults();
      }
    } else if (state.currentPlayer !== prevPlayer) {
      announceTurn(state.currentPlayer);
      if (runtime.net && state.currentPlayer !== runtime.mySeat) setMessage(`Player ${state.currentPlayer}'s turn — please wait.`);
    }
  }

  return { announceTurn, announceTurnChange };
}
