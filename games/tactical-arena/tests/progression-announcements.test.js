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
  consumeProgressionAnnouncements,
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

  const pending = enqueueUnitUnlockAnnouncements(storage, ["clod", "clod", "missing-unit"]);

  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, "unit-unlock:clod");
  assert.equal(pending[0].title, "Clod Unlocked");

  const consumed = consumeProgressionAnnouncements(storage);
  assert.deepEqual(consumed.map((announcement) => announcement.id), ["unit-unlock:clod"]);
  assert.deepEqual(readProgressionAnnouncements(storage), []);
  assert.deepEqual(readSeenProgressionAnnouncementIds(storage), ["unit-unlock:clod"]);

  assert.deepEqual(enqueueUnitUnlockAnnouncements(storage, ["clod"]), []);
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
