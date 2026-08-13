import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { CAMPAIGN_MISSIONS } from "../src/campaign/campaignContent.js";
import { readCampaignProgress } from "../src/campaign/campaignProgress.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { applyCheatCode, isCheatCodeEnabled } from "../src/progression/cheatCodes.js";
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

test("settings menu has no cheat code UI", () => {
  const html = fs.readFileSync(new URL("../html/settings-modal.html", import.meta.url), "utf8");

  assert.doesNotMatch(html, /setCheatCode/);
});

// The gate treats localhost as "a developer's machine". Capacitor serves the packaged
// Android app from https://localhost, so on that origin alone the gate cannot tell a dev
// box from every player's phone. Cheated campaign progress is not merely local, either:
// completion is client-asserted and syncs up as claims, which pay out campaign Valor and
// reward picks. So the native shell has to be excluded explicitly.
test("cheats stay disabled inside the packaged app, which is also served from localhost", () => {
  const appLocation = { href: "https://localhost/games/tactical-arena/index.html" };
  const nativeRoot = { Capacitor: { isNativePlatform: () => true } };

  assert.equal(isCheatCodeEnabled({ location: appLocation, root: nativeRoot }), false);

  const storage = memoryStorage();
  const result = applyCheatCode(storage, "poop", { location: appLocation, root: nativeRoot });
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "CHEATS_DISABLED");
  assert.deepEqual(readCampaignProgress(storage).completedMissions, []);
});

// Even the explicit opt-in must not work in the app: the query string is reachable there
// too, and a shipped build should have no path to a full unlock.
test("the taCheats query flag does not re-open cheats in the packaged app", () => {
  const nativeRoot = { Capacitor: { isNativePlatform: () => true } };

  assert.equal(isCheatCodeEnabled({
    location: { href: "https://localhost/games/tactical-arena/index.html?taCheats=1" },
    root: nativeRoot,
  }), false);
});

test("a real browser on localhost still gets cheats", () => {
  assert.equal(isCheatCodeEnabled({
    location: { href: "http://localhost:8080/games/tactical-arena/index.html" },
    root: {},
  }), true);
});

test("cheats stay off on the deployed site", () => {
  assert.equal(isCheatCodeEnabled({
    location: { href: "https://factory.jayarcade.com/games/tactical-arena/index.html" },
    root: {},
  }), false);
});
