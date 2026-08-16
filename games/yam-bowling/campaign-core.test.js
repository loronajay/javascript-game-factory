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

test("circuit progress is achievement-backed and a loss never unlocks a character", () => {
  const storage = memoryStorage();
  const store = Campaign.createCampaignStore({ storage });
  const opening = store.getCurrentMatch();

  assert.equal(opening.id, "local-hazel-ward");
  assert.deepEqual(store.getUnlockedBowlerSlugs(), Campaign.STARTER_BOWLER_SLUGS);

  const loss = store.recordMatchResult(opening.id, { won: false });
  assert.deepEqual(loss, {
    recorded: false,
    firstClear: false,
    won: false,
    achievement: null,
    unlockedBowlerSlug: null,
  });
  assert.equal(store.getCurrentMatch().id, opening.id);
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), false);
});

test("winning a circuit match earns its achievement and unlocks its rival exactly once", () => {
  const storage = memoryStorage();
  const store = Campaign.createCampaignStore({ storage });

  const first = store.recordMatchResult("local-hazel-ward", { won: true });
  assert.equal(first.recorded, true);
  assert.equal(first.firstClear, true);
  assert.equal(first.achievement.id, "beat-hazel-ward");
  assert.equal(first.unlockedBowlerSlug, "hazel-ward");
  assert.equal(store.getCurrentMatch().id, "local-piper-hart");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), true);

  const replay = store.recordMatchResult("local-hazel-ward", { won: true });
  assert.equal(replay.recorded, false);
  assert.equal(replay.firstClear, false);
  assert.equal(replay.unlockedBowlerSlug, null);

  const persisted = JSON.parse(storage.value(Campaign.CAMPAIGN_STORAGE_KEY));
  assert.deepEqual(persisted.earnedAchievementIds, ["beat-hazel-ward"]);
});

test("a future circuit result cannot skip the sanctioned match order", () => {
  const store = Campaign.createCampaignStore({ storage: memoryStorage() });

  const skipped = store.recordMatchResult("city-lumi-vega", { won: true });
  assert.equal(skipped.recorded, false);
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

test("unknown stored achievements and locked selections are discarded", () => {
  const storage = memoryStorage({
    [Campaign.CAMPAIGN_STORAGE_KEY]: JSON.stringify({
      version: Campaign.SCHEMA_VERSION,
      earnedAchievementIds: ["beat-hazel-ward", "invented-achievement"],
      selectedBowlerSlug: "reina-sato",
    }),
  });
  const store = Campaign.createCampaignStore({ storage });

  assert.deepEqual(store.getSnapshot().earnedAchievementIds, ["beat-hazel-ward"]);
  assert.equal(store.getSelectedBowlerSlug(), Campaign.STARTER_BOWLER_SLUGS[0]);
});
