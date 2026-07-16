import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  campaignPendingRewardActionForNode,
  campaignResultsValorLabel,
  campaignValorRewardForNode,
  isCampaignMapPanTarget,
  syncResultsActions,
} from "../src/ui/menuFlow.js";
import { CAMPAIGN_MISSIONS, CLOD_MISSION_ID } from "../src/campaign/campaign.js";
import {
  BROTHERS_UNIT_PACK_ID,
  WANDERING_SKIN_PACK_ID,
  selectCampaignRewardSkin,
  selectCampaignRewardUnit,
} from "../src/progression/unlocks.js";

const outcomeScreensHtml = readFileSync(new URL("../html/outcome-screens.html", import.meta.url), "utf8");

function fakeButton(hidden = false) {
  return { hidden };
}

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("results markup includes a campaign-map action that starts hidden", () => {
  assert.match(
    outcomeScreensHtml,
    /<button[^>]+data-nav="campaign"[^>]+data-results="campaign-map"[^>]+hidden[^>]*>Campaign Map<\/button>/,
  );
});

test("campaign results show Campaign Map and suppress Rematch", () => {
  const rematchBtn = fakeButton();
  const campaignMapBtn = fakeButton(true);

  syncResultsActions({ rematchBtn, campaignMapBtn }, { online: false, campaign: { victory: true } });

  assert.equal(rematchBtn.hidden, true);
  assert.equal(campaignMapBtn.hidden, false);
});

test("non-campaign results hide Campaign Map while preserving normal rematch rules", () => {
  const rematchBtn = fakeButton();
  const campaignMapBtn = fakeButton();

  syncResultsActions({ rematchBtn, campaignMapBtn }, { online: false, campaign: null });

  assert.equal(rematchBtn.hidden, false);
  assert.equal(campaignMapBtn.hidden, true);
});

test("campaign map panning does not capture mission node clicks", () => {
  const host = {};
  const missionNodeTarget = {
    closest: (selector) => selector === "[data-action='selectCampaignMission']" ? {} : null,
  };
  const mapBackgroundTarget = {
    closest: () => null,
  };

  assert.equal(isCampaignMapPanTarget(host, host), true);
  assert.equal(isCampaignMapPanTarget(mapBackgroundTarget, host), true);
  assert.equal(isCampaignMapPanTarget(missionNodeTarget, host), false);
});

test("campaign detail Valor falls back to canonical mission rewards", () => {
  const clodReward = CAMPAIGN_MISSIONS.find((mission) => mission.id === CLOD_MISSION_ID).valorReward;

  assert.equal(campaignValorRewardForNode({ id: CLOD_MISSION_ID }), clodReward);
  assert.equal(campaignValorRewardForNode({ id: CLOD_MISSION_ID, valorReward: 0 }), clodReward);
  assert.equal(campaignValorRewardForNode({ id: CLOD_MISSION_ID, valorReward: 12 }), 12);
});

test("campaign results do not promise already-claimed Valor on losses", () => {
  assert.equal(campaignResultsValorLabel({ victory: false, valorReward: 75, valorGranted: 0 }), "Win to earn 75 Valor");
  assert.equal(campaignResultsValorLabel({ victory: false, valorReward: 75, valorGranted: 0, valorClaimed: true }), "Already claimed");
  assert.equal(campaignResultsValorLabel({ victory: true, valorReward: 75, valorGranted: 0, valorClaimed: true }), "Already claimed");
  assert.equal(campaignResultsValorLabel({ victory: true, valorReward: 75, valorGranted: 75 }), "+75 Valor");
});

test("completed campaign skin rewards stay claimable until the player chooses one", () => {
  const storage = storageAdapter();
  const node = { status: "completed", rewardSkinPack: WANDERING_SKIN_PACK_ID };

  assert.deepEqual(campaignPendingRewardActionForNode(node, storage), {
    kind: "skin",
    packId: WANDERING_SKIN_PACK_ID,
    label: "Choose Reward",
  });

  selectCampaignRewardSkin(storage, WANDERING_SKIN_PACK_ID, { type: "archer", slug: "wandering" });

  assert.equal(campaignPendingRewardActionForNode(node, storage), null);
});

test("completed campaign unit-choice rewards stay claimable until the player chooses one", () => {
  const storage = storageAdapter();
  const node = { status: "completed", rewardUnitChoicePack: BROTHERS_UNIT_PACK_ID };

  assert.deepEqual(campaignPendingRewardActionForNode(node, storage), {
    kind: "unit",
    packId: BROTHERS_UNIT_PACK_ID,
    label: "Choose Recruit",
  });

  selectCampaignRewardUnit(storage, BROTHERS_UNIT_PACK_ID, "little-brother");

  assert.equal(campaignPendingRewardActionForNode(node, storage), null);
});
