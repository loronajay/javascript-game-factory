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

test("far-lane projection follows each artwork's pin-deck horizon", () => {
  const renderer = createRenderer();
  const baselineNear = renderer.project(0, 0.3);
  const baselineDeck = renderer.project(0, 0.875);

  renderer.laneSlug = "liberty-lanes";
  const correctedNear = renderer.project(0, 0.3);
  const correctedDeck = renderer.project(0, 0.875);

  assert.equal(correctedNear.y, baselineNear.y, "the approach should not move");
  assert.equal(correctedDeck.y, baselineDeck.y + 38, "the rack should sit on Liberty's lower pin deck");
});

test("pin bodies and the ball share the same lane projection correction", () => {
  const renderer = createRenderer();
  renderer.assets.pin = { width: 125, height: 384 };
  const headPin = globalThis.YamPhysics.createRack()[0];
  const baselinePin = renderer.pinMetrics(headPin);
  const baselineBall = renderer.project(headPin.x, baselinePin.z);

  renderer.laneSlug = "royal-gold";
  const correctedPin = renderer.pinMetrics(headPin);
  const correctedBall = renderer.project(headPin.x, correctedPin.z);

  assert.equal(correctedPin.point.y - baselinePin.point.y, 39);
  assert.equal(correctedBall.y - baselineBall.y, 39);
  assert.equal(correctedPin.point.y, correctedBall.y);
});

test("lane coordinates interpolate through the measured painted board edges", () => {
  const renderer = createRenderer();
  renderer.laneSlug = "crimson-crown";

  assert.equal(renderer.project(-1, 0).x, 43);
  assert.equal(renderer.project(1, 0).x, 979);
  assert.equal(renderer.project(-1, 0.6).x, 294);
  assert.equal(renderer.project(1, 0.6).x, 727);

  const between = renderer.project(1, 0.5).x;
  assert.ok(between < 811 && between > 727, "the painted edge should interpolate continuously between anchors");
});

test("the aiming highlight keeps its original continuous lane projection", () => {
  const renderer = createRenderer();
  renderer.ctx = {
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {},
    setLineDash() {}, stroke() {}, arc() {}, fill() {},
  };
  let projectedPoints = 0;
  const originalProject = renderer.project.bind(renderer);
  const originalTrajectory = globalThis.YamPhysics.trajectoryX;
  const originalGutterAwareTrajectory = globalThis.YamPhysics.gutterAwareTrajectoryX;
  let trajectoryPoints = 0;
  renderer.project = (...args) => {
    projectedPoints += 1;
    return originalProject(...args);
  };
  renderer.projectLaneObject = () => {
    throw new Error("the aiming highlight must not snap onto presentation-only gutter geometry");
  };

  globalThis.YamPhysics.trajectoryX = (...args) => {
    trajectoryPoints += 1;
    return originalTrajectory(...args);
  };
  globalThis.YamPhysics.gutterAwareTrajectoryX = () => {
    throw new Error("the aiming highlight must not be rewritten as a gutter outcome preview");
  };
  try {
    renderer.drawAimGuide({
      phase: "ready",
      liveShot: { startX: 0.46, aim: 0.45, hook: 0.4, power: 0.8 },
    });
  } finally {
    globalThis.YamPhysics.trajectoryX = originalTrajectory;
    globalThis.YamPhysics.gutterAwareTrajectoryX = originalGutterAwareTrajectory;
  }

  assert.equal(projectedPoints, 40);
  assert.equal(trajectoryPoints, 40);
});

test("captured balls use the painted gutter trough instead of a normalized off-art x", () => {
  const renderer = createRenderer();
  renderer.laneSlug = "crimson-crown";

  const near = renderer.projectGutter(1, 0.2);
  const far = renderer.projectGutter(1, 0.8);

  assert.equal(near.x, 1007);
  assert.equal(far.x, 676);
  assert.equal(
    renderer.projectLaneObject(globalThis.YamPhysics.GUTTER_CENTER_X, 0.8).x,
    far.x,
    "guttered balls, debug markers, and trails should share one painted trough centerline",
  );
  const jitteredTrail = renderer.projectLaneObject(globalThis.YamPhysics.GUTTER_CENTER_X - 0.005, 0.8);
  assert.ok(Math.abs(jitteredTrail.x - 675.33) < 0.001,
    "trail jitter should stay around the trough instead of falling back to the generic projection");
});

test("the forgiveness hitbox visibly overlaps each measured painted edge", () => {
  const renderer = createRenderer();
  for (const lane of globalThis.YamLaneCore.LANES) {
    renderer.laneSlug = lane.slug;
    for (const side of [-1, 1]) {
      for (const z of [0.2, 0.4, 0.6, 0.8]) {
        const ball = renderer.project(side * globalThis.YamPhysics.GUTTER_CONTACT_X, z);
        const paintedEdge = renderer.project(side, z).x;
        const radius = renderer.ballSizeAt(z) / 2;
        const overlap = side > 0
          ? ball.x + radius - paintedEdge
          : paintedEdge - (ball.x - radius);
        assert.ok(overlap >= 0 && overlap <= 8,
          `${lane.slug} side=${side} capture at z=${z} should overlap the painted edge by a small visible amount, got ${overlap}`);
      }
    }
  }
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
