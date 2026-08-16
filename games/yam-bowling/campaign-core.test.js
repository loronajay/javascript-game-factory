const test = require("node:test");
const assert = require("node:assert/strict");

const Animation = require("./animation-core.js");
const Campaign = require("./campaign-core.js");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    value(key) { return values.get(key); },
  };
}

test("the circuit starts with five bowlers and introduces every other canon bowler once", () => {
  assert.deepEqual(Campaign.STARTER_BOWLER_SLUGS, [
    "daisy-monroe",
    "nia-brooks",
    "tessa-quinn",
    "zuri-banks",
    "amara-reed",
  ]);

  assert.equal(Campaign.DIVISIONS.length, 5);
  assert.equal(Campaign.CIRCUIT_MATCHES.length, 25);
  for (const division of Campaign.DIVISIONS) {
    assert.equal(
      Campaign.CIRCUIT_MATCHES.filter((match) => match.divisionId === division.id).length,
      5,
      `${division.name} should contain five character achievements`,
    );
  }

  const introduced = Campaign.CIRCUIT_MATCHES.map((match) => match.unlockBowlerSlug);
  assert.equal(new Set(introduced).size, introduced.length);
  assert.deepEqual(
    new Set([...Campaign.STARTER_BOWLER_SLUGS, ...introduced]),
    new Set(Animation.CANON_BOWLERS.map((bowler) => bowler.slug)),
  );
});

test("each circuit division advances to a harder CPU tier", () => {
  const expectedTiers = ["rookie", "casual", "competitive", "pro", "champion"];

  Campaign.DIVISIONS.forEach((division, index) => {
    const matches = Campaign.CIRCUIT_MATCHES.filter((match) => match.divisionId === division.id);
    assert.deepEqual(new Set(matches.map((match) => match.cpuLevelId)), new Set([expectedTiers[index]]));
    assert.equal(division.cpuLevelId, expectedTiers[index]);
  });
});

test("circuit progress starts empty and has no local result mutation path", () => {
  const storage = memoryStorage();
  const store = Campaign.createCampaignStore({ storage });
  const opening = store.getCurrentMatch();

  assert.equal(opening.id, "local-hazel-ward");
  assert.deepEqual(store.getUnlockedBowlerSlugs(), Campaign.STARTER_BOWLER_SLUGS);
  assert.equal(store.recordMatchResult, undefined);
  assert.equal(store.getCurrentMatch().id, opening.id);
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), false);
});

test("only a matching server progress row and bowler entitlement unlock a rival", () => {
  const storage = memoryStorage();
  const store = Campaign.createCampaignStore({ storage });

  assert.equal(store.applyServerSnapshot({
    campaignProgress: [{ missionId: "local-hazel-ward", stars: 1 }],
    entitlements: [],
  }), false);
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), false);

  assert.equal(store.applyServerSnapshot({
    campaignProgress: [{ missionId: "local-hazel-ward", stars: 1 }],
    entitlements: [{ entitlementId: "bowler:hazel-ward", kind: "bowler" }],
  }), true);
  assert.equal(store.getCurrentMatch().id, "local-piper-hart");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), true);
  assert.equal(storage.value(Campaign.CAMPAIGN_STORAGE_KEY), undefined,
    "applying server ownership must not mirror it into device storage");
});

test("a malformed server snapshot cannot skip the sanctioned match order", () => {
  const store = Campaign.createCampaignStore({ storage: memoryStorage() });

  assert.equal(store.applyServerSnapshot({
    campaignProgress: [{ missionId: "city-lumi-vega", stars: 1 }],
    entitlements: [{ entitlementId: "bowler:lumi-vega", kind: "bowler" }],
  }), false);
  assert.equal(store.getCurrentMatch().id, "local-hazel-ward");
  assert.equal(store.getUnlockedBowlerSlugs().includes("lumi-vega"), false);
});

test("the selected circuit bowler must be unlocked and persists across reloads", () => {
  const storage = memoryStorage();
  const store = Campaign.createCampaignStore({ storage });

  assert.equal(store.selectBowler("zuri-banks"), true);
  assert.equal(store.selectBowler("hazel-ward"), false);
  assert.equal(store.getSelectedBowlerSlug(), "zuri-banks");

  const reloaded = Campaign.createCampaignStore({ storage });
  assert.equal(reloaded.getSelectedBowlerSlug(), "zuri-banks");
});

test("old device-local achievements are ignored instead of becoming entitlements", () => {
  const storage = memoryStorage({
    [Campaign.CAMPAIGN_STORAGE_KEY]: JSON.stringify({
      version: Campaign.SCHEMA_VERSION,
      earnedAchievementIds: ["beat-hazel-ward", "invented-achievement"],
      selectedBowlerSlug: "reina-sato",
    }),
  });
  const store = Campaign.createCampaignStore({ storage });

  assert.deepEqual(store.getSnapshot().earnedAchievementIds, []);
  assert.equal(store.getSelectedBowlerSlug(), Campaign.STARTER_BOWLER_SLUGS[0]);
});
