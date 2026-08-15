const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const LaneCore = require("./lane-core.js");

const root = __dirname;

function createStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
  };
}

test("every lane carries a kebab-case slug and slug-derived artwork paths", () => {
  assert.ok(LaneCore.LANES.length >= 9);
  for (const lane of LaneCore.LANES) {
    assert.match(lane.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.equal(typeof lane.name, "string");
    assert.equal(typeof lane.description, "string");
    assert.equal(lane.src, `assets/lanes/${lane.slug}.webp`);
    assert.equal(lane.thumbnailSrc, `assets/lanes/thumbs/${lane.slug}.webp`);
    assert.equal(Number.isFinite(lane.pinDeckOffsetY), true);
    assert.match(lane.alt, new RegExp(lane.name));
  }
});

test("lane artwork carries its measured pin-deck horizon correction", () => {
  assert.equal(LaneCore.getLane("crimson-crown").pinDeckOffsetY, 0);
  assert.equal(LaneCore.getLane("blue-circuit").pinDeckOffsetY, 0);
  assert.equal(LaneCore.getLane("emerald-vault").pinDeckOffsetY, 0);
  assert.equal(LaneCore.getLane("royal-gold").pinDeckOffsetY, 39);
  assert.equal(LaneCore.getLane("sunset-strip").pinDeckOffsetY, 18);
  assert.equal(LaneCore.getLane("neon-carnival").pinDeckOffsetY, 18);
  assert.equal(LaneCore.getLane("cosmic-bowl").pinDeckOffsetY, 21);
  assert.equal(LaneCore.getLane("liberty-lanes").pinDeckOffsetY, 38);
  assert.equal(LaneCore.getLane("oak-and-onyx").pinDeckOffsetY, 18);
});

test("lane slugs are unique and the default is part of the catalog", () => {
  const slugs = LaneCore.LANES.map((lane) => lane.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(slugs.includes(LaneCore.DEFAULT_LANE_SLUG));
});

test("every catalogued lane ships its runtime and thumbnail artwork", () => {
  const missing = LaneCore.LANES.flatMap((lane) => [lane.src, lane.thumbnailSrc])
    .filter((assetPath) => !fs.existsSync(path.join(root, assetPath)));
  assert.deepEqual(missing, []);
});

test("unknown lane ids fall back to the default lane", () => {
  assert.equal(LaneCore.getLane("cosmic-bowl").slug, "cosmic-bowl");
  assert.equal(LaneCore.getLane("no-such-lane").slug, LaneCore.DEFAULT_LANE_SLUG);
  assert.equal(LaneCore.getLane(undefined).slug, LaneCore.DEFAULT_LANE_SLUG);
  assert.equal(LaneCore.getLane(null).slug, LaneCore.DEFAULT_LANE_SLUG);
});

test("the chosen lane round-trips through device storage", () => {
  const storage = createStorage();
  assert.equal(LaneCore.loadLaneSlug(storage), LaneCore.DEFAULT_LANE_SLUG);
  assert.equal(LaneCore.saveLaneSlug("royal-gold", storage), "royal-gold");
  assert.equal(LaneCore.loadLaneSlug(storage), "royal-gold");
});

test("a stored lane that left the catalog reads back as the default", () => {
  const storage = createStorage({ [LaneCore.LANE_STORAGE_KEY]: "retired-lane" });
  assert.equal(LaneCore.loadLaneSlug(storage), LaneCore.DEFAULT_LANE_SLUG);
  assert.equal(LaneCore.saveLaneSlug("retired-lane", storage), LaneCore.DEFAULT_LANE_SLUG);
});

test("lane persistence survives storage that throws", () => {
  const hostileStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  };
  assert.equal(LaneCore.loadLaneSlug(hostileStorage), LaneCore.DEFAULT_LANE_SLUG);
  assert.equal(LaneCore.saveLaneSlug("cosmic-bowl", hostileStorage), "cosmic-bowl");
  assert.equal(LaneCore.loadLaneSlug(null), LaneCore.DEFAULT_LANE_SLUG);
});

test("the lane catalog is frozen so a match cannot mutate shared presentation", () => {
  assert.equal(Object.isFrozen(LaneCore.LANES), true);
  assert.equal(LaneCore.LANES.every((lane) => Object.isFrozen(lane)), true);
});

test("an online lane roll from the server maps onto the local catalog", () => {
  const lanes = LaneCore.LANES;
  assert.equal(LaneCore.laneFromRoll(0).slug, lanes[0].slug);
  assert.equal(LaneCore.laneFromRoll(3).slug, lanes[3].slug);
  assert.equal(LaneCore.laneFromRoll(lanes.length).slug, lanes[0].slug);
  assert.equal(LaneCore.laneFromRoll(lanes.length * 7 + 2).slug, lanes[2].slug);
});

test("the same roll always resolves to the same lane for both bowlers", () => {
  for (const roll of [0, 1, 17, 999, 1_000_002]) {
    assert.equal(LaneCore.laneFromRoll(roll).slug, LaneCore.laneFromRoll(roll).slug);
    assert.ok(LaneCore.LANES.includes(LaneCore.laneFromRoll(roll)));
  }
});

test("a missing or malformed lane roll falls back to the default lane", () => {
  for (const roll of [undefined, null, -4, 1.5, NaN, Infinity, "cosmic-bowl", {}]) {
    assert.equal(LaneCore.laneFromRoll(roll).slug, LaneCore.DEFAULT_LANE_SLUG);
  }
});
