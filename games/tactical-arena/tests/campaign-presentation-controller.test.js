import test from "node:test";
import assert from "node:assert/strict";

import {
  createCampaignPresentationController,
  finalBattleStageCaption,
} from "../src/campaign/campaignPresentationController.js";
import {
  BROTHERS_MISSION_ID,
  BROTHERS_UNIT_PACK,
  CAMPAIGN_PROGRESS_KEY,
} from "../src/campaign/campaign.js";

function storageAdapter(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

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

test("campaign map entry opens pending unit reward choices", async () => {
  const storage = storageAdapter({
    [CAMPAIGN_PROGRESS_KEY]: JSON.stringify({
      completedMissions: [BROTHERS_MISSION_ID],
      missionStars: { [BROTHERS_MISSION_ID]: 3 },
      seenPostMatchCutscenes: [BROTHERS_MISSION_ID],
    }),
  });
  const runtime = {
    pendingCampaignReward: { missionId: BROTHERS_MISSION_ID, unitPackId: BROTHERS_UNIT_PACK },
  };
  let opened = null;
  const controller = createCampaignPresentationController({
    runtime,
    storage,
    dialogue: { show: async () => {} },
  });

  await controller.onCampaignMapEntered({
    openCampaignRewardChoice: async (request) => {
      opened = request;
      return "little-brother";
    },
  });

  assert.deepEqual(opened, { unitPackId: BROTHERS_UNIT_PACK });
  assert.equal(runtime.pendingCampaignReward, null);
});
