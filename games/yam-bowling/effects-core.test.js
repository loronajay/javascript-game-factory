const { test } = require("node:test");
const assert = require("node:assert/strict");

const cosmetics = require("./cosmetics-core.js");
const effects = require("./effects-core.js");

const {
  MAX_BURST_PARTICLES,
  MAX_TRAIL_PARTICLES,
  advance,
  createEffectsState,
  emitTrail,
  styleForItem,
  triggerBurst,
} = effects;

const neonTrail = styleForItem(cosmetics.getItem("ball-trail:red-neon"));
const emberBurst = styleForItem(cosmetics.getItem("strike-burst:ember"));
const classicBurst = styleForItem(cosmetics.getItem("strike-burst:classic"));

// A rolling ball, sampled the way the tick loop samples it.
function rollBall(state, { style, reducedMotion = false, ticks = 60, dt = 1 / 60 } = {}) {
  for (let i = 0; i < ticks; i += 1) {
    emitTrail(state, { x: -0.2 + i * 0.005, z: i / ticks, dt, style, reducedMotion });
    advance(state, dt);
  }
  return state;
}

test("a fresh state holds no particles and no fired burst", () => {
  const state = createEffectsState();

  assert.deepEqual(state.trail, []);
  assert.deepEqual(state.burst, []);
  assert.equal(state.lastBurstKey, "");
});

test("the default no-trail and default burst items emit nothing extra", () => {
  assert.equal(styleForItem(cosmetics.getItem("ball-trail:none")), null);

  const state = createEffectsState();
  rollBall(state, { style: styleForItem(cosmetics.getItem("ball-trail:none")) });
  assert.equal(state.trail.length, 0);

  // The classic burst still exists -- it is the shipped default, not an absence.
  assert.notEqual(classicBurst, null);
});

test("every colored trail catalog entry resolves to a renderable effect style", () => {
  const colorTrails = cosmetics.listByType("ball-trail").filter((item) => item.id !== "ball-trail:none");

  assert.equal(colorTrails.length, 22);
  for (const item of colorTrails) {
    const style = styleForItem(item);
    assert.equal(style.id, item.id);
    assert.deepEqual(style.palette, item.assets.palette);
  }
});

test("every colored strike burst catalog entry resolves to a renderable effect style", () => {
  const rewardBursts = cosmetics.listByType("strike-burst").filter((item) => item.id !== "strike-burst:classic");

  assert.equal(rewardBursts.length, 21);
  for (const item of rewardBursts) {
    const style = styleForItem(item);
    assert.equal(style.id, item.id);
    assert.deepEqual(style.palette, item.assets.palette);
  }
});

test("an equipped trail emits, ages, and fully clears once the ball stops", () => {
  const state = createEffectsState();
  rollBall(state, { style: neonTrail });
  assert.ok(state.trail.length > 0, "a rolling ball should leave a trail");

  // Nothing emits after the roll; every particle must age out rather than leak.
  for (let i = 0; i < 240; i += 1) advance(state, 1 / 60);
  assert.equal(state.trail.length, 0);
});

test("emission is deterministic for the same seed and inputs", () => {
  const a = rollBall(createEffectsState(7), { style: neonTrail });
  const b = rollBall(createEffectsState(7), { style: neonTrail });
  assert.deepEqual(a.trail, b.trail);

  const c = rollBall(createEffectsState(8), { style: neonTrail });
  assert.notDeepEqual(a.trail, c.trail, "a different seed should produce a different scatter");
});

test("particle counts stay inside the budget under abusive emission", () => {
  const state = createEffectsState();

  // Far more emission than a real roll can produce: a long roll at a tiny dt,
  // with a burst fired every step on top of it.
  for (let i = 0; i < 4000; i += 1) {
    emitTrail(state, { x: 0, z: (i % 100) / 100, dt: 1 / 240, style: neonTrail });
    triggerBurst(state, { x: 0, z: 0.9, key: `roll-${i}`, style: emberBurst });
    advance(state, 1 / 240);
    assert.ok(state.trail.length <= MAX_TRAIL_PARTICLES, `trail overflowed at step ${i}`);
    assert.ok(state.burst.length <= MAX_BURST_PARTICLES, `burst overflowed at step ${i}`);
  }
});

test("a strike burst fires once per roll no matter how often it is replayed", () => {
  const state = createEffectsState();

  assert.equal(triggerBurst(state, { x: 0, z: 0.9, key: "match-1:roll-4", style: emberBurst }), true);
  const fired = state.burst.length;
  assert.ok(fired > 0);

  // An online snapshot replay or a resume hands us the same roll again.
  assert.equal(triggerBurst(state, { x: 0, z: 0.9, key: "match-1:roll-4", style: emberBurst }), false);
  assert.equal(state.burst.length, fired);

  // The next roll is a different key and is allowed to fire.
  assert.equal(triggerBurst(state, { x: 0, z: 0.9, key: "match-1:roll-5", style: emberBurst }), true);
});

test("a burst without a key never fires, so an unidentified roll cannot double-trigger", () => {
  const state = createEffectsState();
  assert.equal(triggerBurst(state, { x: 0, z: 0.9, key: "", style: emberBurst }), false);
  assert.equal(state.burst.length, 0);
});

test("reduced motion produces a calmer replacement rather than nothing at all", () => {
  const busy = createEffectsState(3);
  const calm = createEffectsState(3);
  rollBall(busy, { style: neonTrail });
  rollBall(calm, { style: neonTrail, reducedMotion: true });

  assert.ok(calm.trail.length > 0, "reduced motion still acknowledges the equipped trail");
  assert.ok(calm.trail.length < busy.trail.length, "reduced motion should emit less");

  const busyBurst = createEffectsState(3);
  const calmBurst = createEffectsState(3);
  triggerBurst(busyBurst, { x: 0, z: 0.9, key: "r1", style: emberBurst });
  triggerBurst(calmBurst, { x: 0, z: 0.9, key: "r1", style: emberBurst, reducedMotion: true });

  assert.ok(calmBurst.burst.length < busyBurst.burst.length);
  assert.ok(calmBurst.flash > 0, "reduced motion swaps particles for a soft flash");
  for (const particle of calmBurst.burst) {
    assert.equal(particle.vx, 0, "reduced-motion particles should not fly outward");
    assert.equal(particle.vz, 0);
  }
});

test("particles carry only presentation data and never reach back into a shot", () => {
  const state = createEffectsState();
  rollBall(state, { style: neonTrail });
  triggerBurst(state, { x: 0, z: 0.9, key: "r1", style: emberBurst });

  for (const particle of [...state.trail, ...state.burst]) {
    assert.deepEqual(
      Object.keys(particle).sort(),
      ["age", "color", "life", "size", "vx", "vz", "x", "z"],
    );
    for (const key of ["x", "z", "vx", "vz", "age", "life", "size"]) {
      assert.ok(Number.isFinite(particle[key]), `${key} should be a finite number`);
    }
    assert.match(particle.color, /^#[0-9a-f]{6}$/i);
  }
});

test("advancing with no emission is stable and never produces NaN", () => {
  const state = createEffectsState();
  triggerBurst(state, { x: 0.1, z: 0.9, key: "r1", style: classicBurst });

  for (let i = 0; i < 600; i += 1) advance(state, 1 / 60);
  assert.equal(state.burst.length, 0);
  assert.equal(state.flash, 0);
  assert.ok(Number.isFinite(state.flash));
});
