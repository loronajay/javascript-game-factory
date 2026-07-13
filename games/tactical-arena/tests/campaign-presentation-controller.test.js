import test from "node:test";
import assert from "node:assert/strict";

import {
  createCampaignPresentationController,
  finalBattleStageCaption,
} from "../src/campaign/campaignPresentationController.js";

test("the final campaign stage has a stable title independent of its duel roster", () => {
  assert.equal(finalBattleStageCaption({}, { stage: 5 }), "The Last Stand");
  assert.equal(finalBattleStageCaption({}, null), null);
});

test("campaign selection ignores an empty mission without opening dialogue", async () => {
  let dialogueShows = 0;
  const controller = createCampaignPresentationController({
    runtime: {},
    dialogue: { show: async () => { dialogueShows += 1; } },
  });

  await controller.onCampaignMissionSelected(null);

  assert.equal(dialogueShows, 0);
});
