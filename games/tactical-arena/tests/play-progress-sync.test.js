import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAY_PROGRESS_BACKFILL_FLAG,
  applyCampaignResetEpoch,
  applyServerPlayProgress,
  backfillLocalPlayProgress,
  buildPlayProgressBackfillClaims,
  mergeServerCampaignProgress,
  mergeServerTutorialProgress,
  readCampaignEpoch,
  writeCampaignEpoch,
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

// --- Campaign reset epoch -------------------------------------------------------------
//
// A campaign reset is the one progress change that moves BACKWARD, which a forward-only
// union cannot express. The server's epoch is what tells this device the difference
// between "the server has never seen these missions" and "the player cleared them".

test("a newer server epoch replaces local campaign progress instead of unioning it", () => {
  const storage = storageAdapter();
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID, NECROMANCER_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3, [NECROMANCER_MISSION_ID]: 2 },
  });

  // The player reset on their other device: the server has no campaign rows and an epoch
  // ahead of ours. Unioning here is what used to silently undo the reset.
  const merged = mergeServerCampaignProgress(storage, { campaignProgress: [], campaignEpoch: 1 });

  assert.deepEqual(merged.completedMissions, []);
  assert.deepEqual(merged.missionStars, {});
  assert.equal(readCampaignEpoch(storage), 1);
  assert.deepEqual(readCampaignProgress(storage), merged);
});

test("a reset that happened partway through keeps only what the server still holds", () => {
  const storage = storageAdapter();
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID, NECROMANCER_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3, [NECROMANCER_MISSION_ID]: 2 },
  });

  // Reset elsewhere, then that device replayed one mission before this device synced.
  const merged = mergeServerCampaignProgress(storage, {
    campaignProgress: [{ missionId: CLOD_MISSION_ID, stars: 1 }],
    campaignEpoch: 1,
  });

  assert.deepEqual(merged.completedMissions, [CLOD_MISSION_ID]);
  assert.equal(merged.missionStars[CLOD_MISSION_ID], 1);
  assert.equal(merged.missionStars[NECROMANCER_MISSION_ID], undefined);
});

test("the same epoch keeps the forward-only union — only a RESET replaces", () => {
  const storage = storageAdapter();
  writeCampaignEpoch(storage, 2);
  writeCampaignProgress(storage, {
    completedMissions: [NECROMANCER_MISSION_ID],
    missionStars: { [NECROMANCER_MISSION_ID]: 3 },
  });

  const merged = mergeServerCampaignProgress(storage, {
    campaignProgress: [{ missionId: CLOD_MISSION_ID, stars: 2 }],
    campaignEpoch: 2,
  });

  assert.deepEqual([...merged.completedMissions].sort(), [CLOD_MISSION_ID, NECROMANCER_MISSION_ID].sort());
  assert.equal(merged.missionStars[NECROMANCER_MISSION_ID], 3);
});

test("an older server epoch never rolls this device back", () => {
  const storage = storageAdapter();
  writeCampaignEpoch(storage, 3);
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3 },
  });

  // A stale snapshot from before this device's own reset.
  const merged = mergeServerCampaignProgress(storage, { campaignProgress: [], campaignEpoch: 1 });

  assert.deepEqual(merged.completedMissions, [CLOD_MISSION_ID]);
  assert.equal(readCampaignEpoch(storage), 3);
});

test("backfill claims are stamped with this device's epoch so a reset can fence them", () => {
  const storage = storageAdapter();
  writeCampaignEpoch(storage, 2);
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3 },
  });

  const claim = buildPlayProgressBackfillClaims(storage)
    .find((entry) => entry.kind === "campaign-progress");

  assert.equal(claim.payload.campaignEpoch, 2);
  // The epoch joins the id too, so a mission replayed after a reset is not swallowed as a
  // duplicate of its pre-reset claim.
  assert.ok(claim.claimId.includes("e2:"));
});

test("applyCampaignResetEpoch adopts the epoch a local reset just produced", () => {
  const storage = storageAdapter();
  assert.equal(readCampaignEpoch(storage), 0);

  applyCampaignResetEpoch(storage, { campaignEpoch: 1 });
  assert.equal(readCampaignEpoch(storage), 1);

  // Never backwards, and a reset response that carries no epoch is inert.
  applyCampaignResetEpoch(storage, { campaignEpoch: 0 });
  applyCampaignResetEpoch(storage, null);
  assert.equal(readCampaignEpoch(storage), 1);
});
