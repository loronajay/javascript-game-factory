import test from "node:test";
import assert from "node:assert/strict";

import {
  createResetProgressConfirmation,
  resetLocalMissionProgress,
} from "../src/ui/settingsScreen.js";
import {
  readUnlockProgress,
  writeUnlockProgress,
} from "../src/progression/unlocks.js";
import {
  CLOD_MISSION_ID,
  readCampaignProgress,
  writeCampaignProgress,
} from "../src/campaign/campaign.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function fakeButton() {
  const classes = new Set();
  return {
    textContent: "",
    attributes: new Map(),
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
}

test("reset progress requires a second confirming press", () => {
  const button = fakeButton();
  const status = { textContent: "" };
  const timers = [];
  let resetCount = 0;

  const confirmation = createResetProgressConfirmation({
    button,
    status,
    onConfirm: () => { resetCount += 1; },
    timeoutMs: 6000,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutFn: (id) => { timers[id].cleared = true; },
  });

  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.attributes.get("aria-pressed"), "false");

  assert.equal(confirmation.requestReset(), false);
  assert.equal(resetCount, 0);
  assert.equal(button.textContent, "Confirm Reset");
  assert.equal(button.classList.contains("is-confirming"), true);
  assert.equal(button.attributes.get("aria-pressed"), "true");
  assert.match(status.textContent, /erase mission progress/);
  assert.match(status.textContent, /Unit unlocks, Valor, tutorials, and owned skins stay saved/);
  assert.doesNotMatch(status.textContent, /erase .*units/i);
  assert.equal(timers[0].ms, 6000);

  assert.equal(confirmation.requestReset(), true);
  assert.equal(resetCount, 1);
  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.classList.contains("is-confirming"), false);
  assert.equal(button.attributes.get("aria-pressed"), "false");
  assert.equal(timers[0].cleared, true);
});

test("reset progress confirmation can expire without resetting", () => {
  const button = fakeButton();
  const status = { textContent: "" };
  let resetCount = 0;
  let timeoutFn = null;

  createResetProgressConfirmation({
    button,
    status,
    onConfirm: () => { resetCount += 1; },
    setTimeoutFn: (fn) => {
      timeoutFn = fn;
      return 7;
    },
    clearTimeoutFn: () => {},
  }).requestReset();

  timeoutFn();

  assert.equal(resetCount, 0);
  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.classList.contains("is-confirming"), false);
  assert.equal(button.attributes.get("aria-pressed"), "false");
});

test("settings reset clears mission progress without touching unlock progress", () => {
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    completedTutorials: ["basics"],
    allTutorialsComplete: true,
    tutorialValorGranted: true,
    valorBalance: 900,
    campaignValorRewards: [CLOD_MISSION_ID],
    unlockedUnits: ["clod", "juggernaut"],
    purchasedSkins: [{ type: "swordsman", slug: "medieval" }],
  });
  writeCampaignProgress(storage, {
    completedMissions: [CLOD_MISSION_ID],
    missionStars: { [CLOD_MISSION_ID]: 3 },
    seenMapCutscenes: [CLOD_MISSION_ID],
    seenPostMatchCutscenes: [CLOD_MISSION_ID],
  });
  let onProgressResetCount = 0;
  let refreshCount = 0;

  const reset = resetLocalMissionProgress({
    storage,
    onProgressReset: () => { onProgressResetCount += 1; },
    refreshUnlockedScreens: () => { refreshCount += 1; },
  });

  assert.deepEqual(reset.campaignProgress, {
    completedMissions: [],
    missionStars: {},
    seenMapCutscenes: [],
    seenPostMatchCutscenes: [],
  });
  assert.deepEqual(readCampaignProgress(storage), reset.campaignProgress);
  const unlockProgress = readUnlockProgress(storage);
  assert.equal(unlockProgress.allTutorialsComplete, true);
  assert.equal(unlockProgress.valorBalance, 900);
  assert.deepEqual(unlockProgress.campaignValorRewards, [CLOD_MISSION_ID]);
  assert.equal(unlockProgress.unlockedUnits.includes("clod"), true);
  assert.equal(unlockProgress.unlockedUnits.includes("juggernaut"), true);
  assert.deepEqual(unlockProgress.purchasedSkins, [{ type: "swordsman", slug: "medieval" }]);
  assert.equal(onProgressResetCount, 1);
  assert.equal(refreshCount, 1);
});
