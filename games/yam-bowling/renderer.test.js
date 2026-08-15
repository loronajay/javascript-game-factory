const assert = require("node:assert/strict");
const { test } = require("node:test");

require("./lane-core.js");
require("./physics-core.js");

// The bowler pipeline is not under test here; boot only needs it to resolve.
globalThis.YamBowlingCore = {
  normalizeSkinId: (skinId) => skinId || "canon",
  getFrameAssetPath: ({ slug }, frame, skinId) => `assets/characters/${skinId}/${slug}/throw-${frame}.webp`,
};

// Deferred image loading, so a test can finish loads out of the order they started.
const pending = [];
globalThis.Image = class FakeImage {
  set src(value) {
    this._src = value;
    pending.push(this);
  }

  get src() {
    return this._src;
  }

  finish() {
    pending.splice(pending.indexOf(this), 1);
    this.onload();
  }
};

require("./renderer.js");

function createRenderer() {
  pending.length = 0;
  const canvas = { width: 0, height: 0, getContext: () => ({}) };
  return new globalThis.YamBowlingRenderer(canvas);
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function finishFor(slug) {
  const image = pending.find((entry) => entry.src.includes(`${slug}.webp`));
  assert.ok(image, `expected a pending load for ${slug}`);
  image.finish();
}

test("a lane swap paints the lane that was requested last", async () => {
  const renderer = createRenderer();
  renderer.setLane("blue-circuit");
  finishFor("blue-circuit");
  await settle();
  assert.equal(renderer.laneSlug, "blue-circuit");
  assert.equal(renderer.assets.lane.src.includes("blue-circuit"), true);

  renderer.setLane("royal-gold");
  finishFor("royal-gold");
  await settle();
  assert.equal(renderer.assets.lane.src.includes("royal-gold"), true);
});

test("a slow lane load never overpaints a newer one", async () => {
  const renderer = createRenderer();
  renderer.setLane("blue-circuit");
  renderer.setLane("royal-gold");

  // The first request resolves last; the newest request still owns the screen.
  finishFor("royal-gold");
  await settle();
  finishFor("blue-circuit");
  await settle();

  assert.equal(renderer.laneSlug, "royal-gold");
  assert.equal(renderer.assets.lane.src.includes("royal-gold"), true);
});

test("returning to a lane while another is still loading repaints it", async () => {
  const renderer = createRenderer();
  renderer.setLane("sunset-strip");
  finishFor("sunset-strip");
  await settle();

  // Leaving an online match back to the local pick and straight back again:
  // the second hop must not be skipped just because its art is still in flight.
  renderer.setLane("emerald-vault");
  renderer.setLane("sunset-strip");
  finishFor("emerald-vault");
  await settle();
  finishFor("sunset-strip");
  await settle();

  assert.equal(renderer.laneSlug, "sunset-strip");
  assert.equal(renderer.assets.lane.src.includes("sunset-strip"), true);
});

test("re-selecting the lane already on screen does not refetch it", async () => {
  const renderer = createRenderer();
  renderer.setLane("cosmic-bowl");
  finishFor("cosmic-bowl");
  await settle();

  renderer.setLane("cosmic-bowl");
  assert.equal(pending.length, 0);
});

test("a lane requested during boot beats the lane boot started loading", async () => {
  const renderer = createRenderer();
  renderer.load("crimson-crown");

  // An online snapshot can land while boot art is still in flight. The served
  // house must win, or the screen keeps a lane the match no longer believes in.
  renderer.setLane("liberty-lanes");
  finishFor("crimson-crown");
  finishFor("pins/1");
  await settle();
  finishFor("liberty-lanes");
  await settle();

  assert.equal(renderer.laneSlug, "liberty-lanes");
  assert.equal(renderer.assets.lane.src.includes("liberty-lanes"), true);
});

test("boot does not refetch a lane the game already asked for", async () => {
  const renderer = createRenderer();
  renderer.load("royal-gold");
  const requests = pending.filter((entry) => entry.src.includes("/lanes/")).length;
  renderer.setLane("royal-gold");
  assert.equal(pending.filter((entry) => entry.src.includes("/lanes/")).length, requests);
});

test("the rack preserves readable depth on the distant pin deck", () => {
  const renderer = createRenderer();
  renderer.assets.pin = { width: 256, height: 384 };
  const rack = globalThis.YamPhysics.createRack();
  const front = renderer.pinMetrics(rack[0]);
  const back = renderer.pinMetrics(rack[9]);

  // Keep enough perspective to separate all four rows without letting the rear
  // pins climb so far into the masking unit that their silhouettes get muddy.
  assert.ok(front.point.y > 345 && front.point.y < 355);
  assert.ok(front.point.y - back.point.y >= 38);
  assert.ok(front.point.y - back.point.y <= 48);
  assert.ok(back.height <= front.height * 0.94, "rear pins should be visibly smaller than the head pin");
});

test("standing pins stay readable at cabinet scale", () => {
  const renderer = createRenderer();
  renderer.assets.pin = { width: 125, height: 384 };
  const front = renderer.pinMetrics(globalThis.YamPhysics.createRack()[0]);

  assert.ok(front.height >= 72, `expected a substantial front-pin sprite, got ${front.height}`);
  assert.ok(front.width >= 23, `expected bold pin proportions, got ${front.width}`);
});

test("scaled sprites use high-quality interpolation", () => {
  pending.length = 0;
  const ctx = {};
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  new globalThis.YamBowlingRenderer(canvas);

  assert.equal(ctx.imageSmoothingEnabled, true);
  assert.equal(ctx.imageSmoothingQuality, "high");
});
