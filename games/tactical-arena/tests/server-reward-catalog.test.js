import test from "node:test";
import assert from "node:assert/strict";

import { CAMPAIGN_MISSIONS } from "../src/campaign/campaignContent.js";
import {
  buildCampaignProgressClaim,
  buildCampaignSkinChoiceClaim,
  buildCampaignSkinRewardClaim,
  buildCampaignUnitChoiceClaim,
  buildCampaignUnitRewardClaim,
  buildCampaignValorClaim,
  buildTutorialCompleteClaim,
  buildTutorialSkinChoiceClaim,
  buildTutorialUnitRewardClaim,
  buildTutorialValorClaim,
} from "../src/platform/gameProgressClient.js";
import {
  CAMPAIGN_SKIN_PACKS,
  CAMPAIGN_UNIT_PACKS,
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  TUTORIAL_REWARD_SKIN_CHOICES,
  TUTORIAL_VALOR_REWARD,
} from "../src/progression/unlocks.js";
import { TUTORIAL_IDS } from "../src/tutorials/tutorialContent.js";
import {
  TACTICAL_ARENA_GAME_SLUG,
  validateTacticalArenaPublicClaim,
} from "../../../platform-api/src/services/tactical-arena-reward-catalog.mjs";

function validate(claim) {
  return validateTacticalArenaPublicClaim({ gameSlug: TACTICAL_ARENA_GAME_SLUG, ...claim });
}

test("the server reward catalog matches every authored campaign mission reward", () => {
  for (const mission of CAMPAIGN_MISSIONS) {
    const valor = validate(buildCampaignValorClaim({
      missionId: mission.id,
      amount: mission.valorReward,
      stars: 3,
    }));
    assert.equal(valor.ok, true, `${mission.id} Valor claim is cataloged`);
    assert.equal(valor.valorBase, mission.valorReward, `${mission.id} Valor amount matches`);

    const progress = validate(buildCampaignProgressClaim({ missionId: mission.id, stars: 3 }));
    assert.equal(progress.ok, true, `${mission.id} progress claim is cataloged`);

    for (const type of mission.rewardUnits ?? []) {
      assert.equal(validate(buildCampaignUnitRewardClaim({ missionId: mission.id, type, stars: 3 })).ok, true,
        `${mission.id} unit ${type} is cataloged`);
    }
    for (const skin of mission.rewardSkins ?? []) {
      assert.equal(validate(buildCampaignSkinRewardClaim({ missionId: mission.id, skin, stars: 3 })).ok, true,
        `${mission.id} skin ${skin.type}:${skin.slug} is cataloged`);
    }
  }
});

test("the server accepts every authored campaign choice-pack claim", () => {
  for (const [packId, choices] of Object.entries(CAMPAIGN_UNIT_PACKS)) {
    const mission = CAMPAIGN_MISSIONS.find((entry) => entry.rewardUnitChoicePack === packId);
    assert.ok(mission, `${packId} has a mission`);
    for (const choice of choices) {
      assert.equal(validate(buildCampaignUnitChoiceClaim({ packId, choice, missionId: mission.id })).ok, true);
    }
  }
  for (const [packId, choices] of Object.entries(CAMPAIGN_SKIN_PACKS)) {
    const mission = CAMPAIGN_MISSIONS.find((entry) => entry.rewardSkinPack === packId);
    assert.ok(mission, `${packId} has a mission`);
    for (const choice of choices) {
      assert.equal(validate(buildCampaignSkinChoiceClaim({ packId, choice, missionId: mission.id })).ok, true);
    }
  }
});

test("the server accepts every authored tutorial completion and reward claim", () => {
  for (const tutorialId of TUTORIAL_IDS) {
    assert.equal(validate(buildTutorialCompleteClaim({ tutorialId })).ok, true);
  }
  assert.equal(validate(buildTutorialValorClaim({
    amount: TUTORIAL_VALOR_REWARD,
    completedTutorials: TUTORIAL_IDS,
  })).ok, true);
  assert.equal(validate(buildTutorialUnitRewardClaim({ type: TUTORIAL_JUGGERNAUT_REWARD_UNIT })).ok, true);
  for (const choice of TUTORIAL_REWARD_SKIN_CHOICES) {
    assert.equal(validate(buildTutorialSkinChoiceClaim({ choice })).ok, true);
  }
});
