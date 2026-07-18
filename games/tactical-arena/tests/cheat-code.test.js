import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CAMPAIGN_MISSIONS } from "../src/campaign/campaignContent.js";
import { readCampaignProgress } from "../src/campaign/campaignProgress.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { applyCheatCode } from "../src/progression/cheatCodes.js";
import { readUnlockProgress } from "../src/progression/unlocks.js";
import { TUTORIAL_IDS } from "../src/tutorials/basics.js";
import { SKIN_MANIFEST } from "../src/ui/skinManifest.generated.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

test("poop cheat code unlocks all tutorials, missions, units, and skins", () => {
  const storage = memoryStorage();

  const result = applyCheatCode(storage, "  PoOp  ", { enabled: true });

  assert.equal(result.accepted, true);

  const unlocks = readUnlockProgress(storage);
  assert.deepEqual(new Set(unlocks.completedTutorials), new Set(TUTORIAL_IDS));
  assert.equal(unlocks.allTutorialsComplete, true);
  assert.deepEqual(new Set(unlocks.unlockedUnits), new Set(Object.keys(UNIT_TYPES)));
  assert.deepEqual(
    new Set(unlocks.unlockedSkins.map(({ type, slug }) => `${type}:${slug}`)),
    new Set(SKIN_MANIFEST.map(({ type, slug }) => `${type}:${slug}`)),
  );

  const campaign = readCampaignProgress(storage);
  assert.deepEqual(new Set(campaign.completedMissions), new Set(CAMPAIGN_MISSIONS.map(({ id }) => id)));
  for (const mission of CAMPAIGN_MISSIONS) assert.equal(campaign.missionStars[mission.id], 3);
});

test("cheat code is disabled unless a dev or test caller opts in", () => {
  const storage = memoryStorage();

  const result = applyCheatCode(storage, "poop");

  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "CHEATS_DISABLED");
  assert.deepEqual(readUnlockProgress(storage).unlockedSkins, []);
  assert.deepEqual(readCampaignProgress(storage).completedMissions, []);
});

test("an invalid cheat code does not change stored progress", () => {
  const storage = memoryStorage({ unrelated: "keep-me" });
  const before = storage.snapshot();

  const result = applyCheatCode(storage, "not-poop");

  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "INVALID_CHEAT_CODE");
  assert.deepEqual(storage.snapshot(), before);
});

test("settings keeps the cheat code form unavailable in the settings menu", () => {
  const html = fs.readFileSync(new URL("../html/settings-modal.html", import.meta.url), "utf8");

  assert.match(html, /id="setCheatCodeForm"[^>]*hidden/);
  assert.match(html, /id="setCheatCode"[^>]*type="password"/);
  assert.match(html, /id="setCheatCodeBtn"[^>]*>Confirm<\/button>/);
  assert.match(html, /id="setCheatCodeStatus"[^>]*aria-live="polite"/);
});

test("cheat code controls stay contained inside the settings card", () => {
  const css = fs.readFileSync(new URL("../styles/screens/shell.css", import.meta.url), "utf8");

  assert.match(css, /\.set-cheat-controls\s*\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /\.set-cheat-controls \.menu-btn\s*\{[^}]*width:auto/);
  assert.match(css, /\.set-cheat-status\s*\{[^}]*width:100%[^}]*overflow-wrap:anywhere/);
});
