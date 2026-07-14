import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import {
  CLOD_MISSION_ID,
  completeCampaignMission,
  createCampaignMatchConfig,
  prepareCampaignMatchState,
} from "../src/campaign/campaign.js";
import { writeUnlockProgress } from "../src/progression/unlocks.js";
import {
  buildDraftBattleUnlockAnnouncement,
  consumeProgressionAnnouncements,
  enqueueDraftBattleUnlockAnnouncement,
  enqueueSkinUnlockAnnouncements,
  enqueueUnitUnlockAnnouncements,
  readProgressionAnnouncements,
  readSeenProgressionAnnouncementIds,
  syncMissingUnitUnlockAnnouncements,
} from "../src/progression/announcements.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function wonClodMission() {
  const state = prepareCampaignMatchState(
    createMatchState(createCampaignMatchConfig(CLOD_MISSION_ID, ["mystic", "magician"])),
    CLOD_MISSION_ID,
  );
  return {
    ...state,
    phase: "complete",
    winner: 1,
    units: state.units.map((unit) => unit.player === 2 ? { ...unit, hp: 0 } : unit),
  };
}

test("unit unlock announcements queue once and mark themselves seen when consumed", () => {
  const storage = storageAdapter();

  const pending = enqueueUnitUnlockAnnouncements(storage, ["clod", "clod", "ghoul", "missing-unit"]);

  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "unit-unlock:clod");
  assert.equal(pending[0].title, "Clod Unlocked");

  const consumed = consumeProgressionAnnouncements(storage);
  assert.deepEqual(consumed.map((announcement) => announcement.id), ["unit-unlock:clod"]);
  assert.deepEqual(readProgressionAnnouncements(storage), []);
  assert.deepEqual(readSeenProgressionAnnouncementIds(storage), ["unit-unlock:clod"]);

  assert.deepEqual(enqueueUnitUnlockAnnouncements(storage, ["clod"]), []);
});

test("summon-only unit unlocks are never announced or counted for draft unlocks", () => {
  const storage = storageAdapter();

  assert.deepEqual(enqueueUnitUnlockAnnouncements(storage, ["ghoul"]), []);

  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "clod", "necromancer", "witch-doctor", "ghoul"],
  });

  const pending = syncMissingUnitUnlockAnnouncements(storage);

  assert.deepEqual(pending.map((announcement) => announcement.id), [
    "unit-unlock:clod",
    "unit-unlock:necromancer",
    "unit-unlock:witch-doctor",
  ]);
});

test("skin unlock announcements queue with unit and skin identity", () => {
  const storage = storageAdapter();

  const pending = enqueueSkinUnlockAnnouncements(storage, [
    { type: "angel", slug: "summer-vibes" },
    { type: "angel", slug: "summer-vibes" },
    { type: "missing-unit", slug: "summer-vibes" },
  ]);

  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "skin-unlock:angel:summer-vibes");
  assert.equal(pending[0].kind, "skin-unlock");
  assert.equal(pending[0].unitType, "angel");
  assert.equal(pending[0].skinSlug, "summer-vibes");
  assert.equal(pending[0].title, "Summer Vibes Angel Unlocked");

  consumeProgressionAnnouncements(storage);
  assert.deepEqual(enqueueSkinUnlockAnnouncements(storage, [{ type: "angel", slug: "summer-vibes" }]), []);
});

test("existing non-starter unit unlocks are audited into pending announcements", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "clod"],
  });

  const pending = syncMissingUnitUnlockAnnouncements(storage);

  assert.deepEqual(pending.map((announcement) => announcement.id), ["unit-unlock:clod"]);
  consumeProgressionAnnouncements(storage);
  assert.deepEqual(syncMissingUnitUnlockAnnouncements(storage), []);
});

test("draft battle achievement queues once when the account has eight known units", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "clod", "necromancer", "witch-doctor"],
  });

  enqueueDraftBattleUnlockAnnouncement(storage);
  assert.deepEqual(readProgressionAnnouncements(storage), []);

  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "clod", "necromancer", "witch-doctor", "father-time", "missing-unit"],
  });
  const pending = enqueueDraftBattleUnlockAnnouncement(storage);

  assert.deepEqual(pending.map((announcement) => announcement.id), ["mode-unlock:draft-battles"]);
  assert.deepEqual(buildDraftBattleUnlockAnnouncement(), {
    id: "mode-unlock:draft-battles",
    kind: "mode-unlock",
    mode: "draft-battles",
    eyebrow: "Achievement",
    title: "Draft Battles Available",
    body: "You own 8 unique units, enough for the full snake draft. Draft 1v1 is now available in Online Versus.",
    primaryLabel: "Continue",
  });

  consumeProgressionAnnouncements(storage);
  assert.deepEqual(enqueueDraftBattleUnlockAnnouncement(storage), []);
});

test("existing eight-unit profiles are audited into the draft battle achievement", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "clod", "necromancer", "witch-doctor", "father-time"],
  });

  const pending = syncMissingUnitUnlockAnnouncements(storage);

  assert.deepEqual(pending.map((announcement) => announcement.id), [
    "unit-unlock:clod",
    "unit-unlock:necromancer",
    "unit-unlock:witch-doctor",
    "unit-unlock:father-time",
    "mode-unlock:draft-battles",
  ]);
});

test("completing the Clod mission queues a Clod unlock announcement", () => {
  const storage = storageAdapter();
  const won = wonClodMission();

  const completed = completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });

  assert.deepEqual(completed.newRewardUnits, ["clod"]);
  assert.deepEqual(readProgressionAnnouncements(storage).map((announcement) => announcement.id), ["unit-unlock:clod"]);

  consumeProgressionAnnouncements(storage);
  completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });
  assert.deepEqual(readProgressionAnnouncements(storage), []);
});

test("mission rewards queue the draft battle achievement when they cross the unit threshold", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    unlockedUnits: ["swordsman", "archer", "mystic", "magician", "necromancer", "witch-doctor", "father-time"],
  });
  const won = wonClodMission();

  completeCampaignMission(storage, CLOD_MISSION_ID, won, { clodChargeHitCount: 1 });

  assert.deepEqual(readProgressionAnnouncements(storage).map((announcement) => announcement.id), [
    "unit-unlock:clod",
    "mode-unlock:draft-battles",
  ]);
});
