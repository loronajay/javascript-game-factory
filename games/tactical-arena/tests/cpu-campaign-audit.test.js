import test from "node:test";
import assert from "node:assert/strict";

import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { applyCommand } from "../src/core/reducer.js";
import { findUnit, openAutomaticFirstActivation } from "../src/core/state.js";
import { createMatchState } from "../src/match/matchBuilder.js";
import {
  CAMPAIGN_MISSIONS,
  FINAL_BATTLE_MISSION_ID,
  MONK_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  applyMonkTrialIntroBeat,
  applyVoidCastleIntroBeat,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import { advanceFinalBattleStage } from "../src/campaign/missions/the-final-battle/stages.js";

const AUDIT_PLAYER_SQUAD = Object.freeze(["swordsman", "archer", "mystic", "magician"]);
const MAX_CPU_ACTIVATIONS = 64;

function stateAfterOpeningStaging(missionId) {
  let state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(missionId, AUDIT_PLAYER_SQUAD)),
    missionId,
  );
  if (missionId === MONK_MISSION_ID) {
    state = applyMonkTrialIntroBeat(state, "monkIntroRevealAndMove");
    state = applyMonkTrialIntroBeat(state, "monkIntroSplitShuffle");
  } else if (missionId === VOID_CASTLE_MISSION_ID) {
    state = applyVoidCastleIntroBeat(state, "voidCastleNemesisSplit");
  } else if (missionId === FINAL_BATTLE_MISSION_ID) {
    state = advanceFinalBattleStage(state);
  }
  return { ...state, currentPlayer: 2, activation: null };
}

test("every authored campaign enemy squad completes a legal CPU turn after opening staging", () => {
  for (const mission of CAMPAIGN_MISSIONS.filter((entry) => !entry.comingSoon)) {
    let state = stateAfterOpeningStaging(mission.id);
    let activations = 0;

    while (
      state.phase === "playing" &&
      state.currentPlayer === 2 &&
      activations < MAX_CPU_ACTIVATIONS
    ) {
      activations += 1;
      const commands = chooseActivation(state, {
        difficulty: "normal",
        cpuPlayer: 2,
        rng: cpuRng(state),
      });
      assert.ok(commands.length > 0, `${mission.id}: CPU produced no commands`);

      for (const command of commands) {
        const result = applyCommand(state, command);
        assert.ok(
          result.accepted,
          `${mission.id}: ${command.type} rejected (${result.errorCode})`,
        );
        state = result.nextState;
      }
    }

    assert.ok(activations < MAX_CPU_ACTIVATIONS, `${mission.id}: CPU turn exceeded the activation guard`);
    assert.ok(
      state.phase === "complete" || state.currentPlayer !== 2,
      `${mission.id}: CPU turn did not hand control off`,
    );
  }
});

test("Spirit of the Woods CPU resumes auto-open Mother Nature without a begin command", () => {
  let state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(SPIRIT_WOODS_MISSION_ID, AUDIT_PLAYER_SQUAD)),
    SPIRIT_WOODS_MISSION_ID,
  );
  state.currentPlayer = 2;
  state.activation = null;
  openAutomaticFirstActivation(state);

  assert.equal(state.activation?.unitId, "p2-0-mother-nature");
  const commands = chooseActivation(state, {
    difficulty: "normal",
    cpuPlayer: 2,
    rng: cpuRng(state),
  });
  assert.ok(commands.length > 0);
  assert.equal(commands.some((command) => command.type === "BEGIN_ACTIVATION"), false);

  for (const command of commands) {
    const result = applyCommand(state, command);
    assert.ok(
      result.accepted,
      `${command.type} rejected (${result.errorCode})`,
    );
    state = result.nextState;
  }
  assert.equal(findUnit(state, "p2-0-mother-nature").spent, true);
});
