import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isCampaignMapPanTarget, syncResultsActions } from "../src/ui/menuFlow.js";

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function fakeButton(hidden = false) {
  return { hidden };
}

test("results markup includes a campaign-map action that starts hidden", () => {
  assert.match(
    indexHtml,
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
