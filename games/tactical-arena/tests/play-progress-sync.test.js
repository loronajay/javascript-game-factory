import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAY_PROGRESS_BACKFILL_FLAG,
  applyServerPlayProgress,
  backfillLocalPlayProgress,
  buildPlayProgressBackfillClaims,
  mergeServerCampaignProgress,
  mergeServerTutorialProgress,
} from "../src/platform/playProgressSync.js";
import { readPendingGameProgressClaims } from "../src/platform/gameProgressClient.js";
import { readCampaignProgress, writeCampaignProgress } from "../src/campaign/campaignProgress.js";
import { CLOD_MISSION_ID, NECROMANCER_MISSION_ID } from "../src/campaign/campaignConstants.js";
import {
  TUTORIAL_JUGGERNAUT_REWARD_UNIT,
  readUnlockProgress,
  writeUnlockProgress,
} from "../src/progression/unlocks.js";
import { TUTORIAL_IDS } from "../src/tutorials/tutorialContent.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("server campaign rows restore missions and stars a fresh device has never seen", () => {
  const storage = storageAdapter();
  const merged = mergeServerCampaignProgress(storage, {
    campaignProgress: [
      { missionId: CLOD_MISSION_ID, stars: 3 },
      { missionId: NECROMANCER_MISSION_ID, stars: 2 },
    ],
  });

  assert.deepEqual([...merged.completedMissions].sort(), [CLOD_MISSION_ID, NECROMANCER_MISSION_ID].sort());
  assert.equal(merged.missionStars[CLOD_MISSION_ID], 3);
  assert.equal(merged.missionStars[NECROMANCER_MISSION_ID], 2);
  assert.deepEqual(readCampaignProgress(storage), merged);
});

test("campaign merge is forward-only: a worse server row never lowers a local best", () => {
  const storage = storageAdapter();
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3 },
  });

  const merged = mergeServerCampaignProgress(storage, {
    campaignProgress: [{ missionId: CLOD_MISSION_ID, stars: 1 }],
  });

  assert.equal(merged.missionStars[CLOD_MISSION_ID], 3);
});

test("unknown mission ids from the server are dropped", () => {
  const storage = storageAdapter();
  const merged = mergeServerCampaignProgress(storage, {
    campaignProgress: [{ missionId: "not-a-real-mission", stars: 3 }],
  });

  assert.deepEqual(merged.completedMissions, []);
});

test("server tutorial completions restore local tutorial progress", () => {
  const storage = storageAdapter();
  const merged = mergeServerTutorialProgress(storage, { completedTutorials: [TUTORIAL_IDS[0], "bogus"] });

  assert.deepEqual(merged.completedTutorials, [TUTORIAL_IDS[0]]);
  assert.equal(merged.allTutorialsComplete, false);
});

test("a server list covering every tutorial grants the completion reward unit", () => {
  const storage = storageAdapter();
  const merged = mergeServerTutorialProgress(storage, { completedTutorials: [...TUTORIAL_IDS] });

  assert.equal(merged.allTutorialsComplete, true);
  assert.ok(merged.unlockedUnits.includes(TUTORIAL_JUGGERNAUT_REWARD_UNIT));
});

test("the backfill claims local campaign clears, tutorials, and reward picks", () => {
  const storage = storageAdapter();
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 2 },
  });
  const base = readUnlockProgress(storage);
  writeUnlockProgress(storage, {
    ...base,
    completedTutorials: [...TUTORIAL_IDS],
    allTutorialsComplete: true,
    selectedRewardSkin: { type: "magician", slug: "summer-vibes" },
    rewardGranted: true,
  });

  const claims = buildPlayProgressBackfillClaims(storage);
  const byKind = (kind) => claims.filter((claim) => claim.kind === kind);

  assert.deepEqual(byKind("campaign-progress").map((claim) => claim.claimId), [
    `campaign-progress:${CLOD_MISSION_ID}:2`,
  ]);
  assert.equal(byKind("tutorial-complete").length, TUTORIAL_IDS.length);
  // The tutorial reward skin is a player PICK with no other record — losing it is
  // exactly how a skin disappears when signing in on a second device.
  assert.deepEqual(byKind("tutorial-skin-choice").map((claim) => claim.payload.entitlementId), [
    "skin:magician:summer-vibes",
  ]);
  assert.deepEqual(byKind("tutorial-unit-reward").map((claim) => claim.payload.entitlementId), [
    `unit:${TUTORIAL_JUGGERNAUT_REWARD_UNIT}`,
  ]);
});

test("the backfill queues real pending claims once and then stops", () => {
  const storage = storageAdapter();
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 1 },
  });

  const first = backfillLocalPlayProgress(storage);
  assert.ok(first.queued > 0);
  assert.equal(first.alreadyBackfilled, false);
  assert.equal(storage.getItem(PLAY_PROGRESS_BACKFILL_FLAG), "1");
  assert.ok(readPendingGameProgressClaims(storage).some((claim) => claim.kind === "campaign-progress"));

  const second = backfillLocalPlayProgress(storage);
  assert.deepEqual(second, { queued: 0, alreadyBackfilled: true });
});

test("no snapshot leaves local play progress untouched", () => {
  const storage = storageAdapter();
  assert.deepEqual(applyServerPlayProgress(storage, null), { campaignProgress: null, unlockProgress: null });
});
