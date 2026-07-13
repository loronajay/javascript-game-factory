import test from "node:test";
import assert from "node:assert/strict";

import { BROTHERS_MISSION_ID } from "../src/campaign/campaign.js";
import { createCampaignMeta } from "../src/campaign/campaignMeta.js";
import {
  nextCampaignDialogueBeat,
  recordCampaignProgress,
} from "../src/campaign/campaignRuntime.js";

test("campaign progress ignores non-campaign matches and missing reducer results", () => {
  const campaignMeta = createCampaignMeta();
  const state = { phase: "playing", units: [] };

  assert.doesNotThrow(() => recordCampaignProgress({
    matchMode: "versus",
    campaignMissionId: BROTHERS_MISSION_ID,
    campaignMeta,
    state,
    result: null,
  }));
  assert.equal(campaignMeta.brothersEnteredRage, false);
});

test("campaign progress latches the brothers' rage objective failure", () => {
  const campaignMeta = createCampaignMeta();
  const state = {
    phase: "playing",
    units: [
      { id: "p2-0-big-brother", type: "big-brother", player: 2, hp: 5 },
      { id: "p2-1-little-brother", type: "little-brother", player: 2, hp: 8 },
    ],
  };

  recordCampaignProgress({
    matchMode: "campaign",
    campaignMissionId: BROTHERS_MISSION_ID,
    campaignMeta,
    state,
    result: { events: [] },
  });

  assert.equal(campaignMeta.brothersEnteredRage, true);
});

test("dialogue selection returns a once-only brothers rage beat", () => {
  const campaignMeta = createCampaignMeta();
  const state = {
    phase: "playing",
    units: [{ id: "p2-0-big-brother", type: "big-brother", player: 2, hp: 5 }],
  };

  const beat = nextCampaignDialogueBeat({ campaignMissionId: BROTHERS_MISSION_ID, campaignMeta, state });
  assert.equal(typeof beat?.script, "function");
  beat.markShown();
  assert.equal(campaignMeta.brothersRageWarned["big-brother"], true);
  assert.equal(nextCampaignDialogueBeat({ campaignMissionId: BROTHERS_MISSION_ID, campaignMeta, state }), null);
});
