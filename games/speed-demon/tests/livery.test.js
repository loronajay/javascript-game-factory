import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  FINISHES,
  DEFAULT_FINISH,
  DEFAULT_LIVERY,
  LIVERY_LIMITS,
  PAINT_PRESETS,
  clampField,
  stepField,
  findFinish,
  findPaintPreset,
  createLivery,
  normalizeLivery,
  applyPaintPreset,
  liveryEquals,
  liveryKey,
} from "../scripts/garage/livery.js";

suite("livery — what a player changes about a car");

// ---------------------------------------------------------------------------
// Normalization is total: every untrusted source must yield a drawable car
// ---------------------------------------------------------------------------

test("a livery built from nothing is the factory default", () => {
  assertDeepEqual(createLivery(), DEFAULT_LIVERY);
  assertDeepEqual(createLivery({}), DEFAULT_LIVERY);
});

test("garbage input normalizes rather than throwing", () => {
  // These are the shapes a stale save, a hostile server payload or an
  // opponent's config could realistically arrive as. None may break a race.
  for (const input of [null, undefined, 0, "", "red", [], true, NaN, () => {}]) {
    const livery = createLivery(input);
    assertEqual(livery.paint.finish, DEFAULT_FINISH, `finish for ${String(input)}`);
    assert(Number.isFinite(livery.paint.hue), `hue for ${String(input)}`);
  }
});

test("non-numeric field values fall back instead of poisoning the car", () => {
  const livery = createLivery({
    paint: { hue: "purple", saturation: null, brightness: NaN, finish: "chrome" },
    windowTint: "dark",
    tailLightHue: undefined,
    underglow: { enabled: "yes", hue: {}, intensity: [] },
  });
  assert(Number.isFinite(livery.paint.hue));
  assert(Number.isFinite(livery.paint.saturation));
  assert(Number.isFinite(livery.paint.brightness));
  assertEqual(livery.paint.finish, DEFAULT_FINISH);
  assert(Number.isFinite(livery.windowTint));
});

test("only a literal true switches the underglow on", () => {
  // A truthy leftover from an older save would otherwise light up a car the
  // player never lit, which reads as the game changing their config on its own.
  assertEqual(createLivery({ underglow: { enabled: "yes" } }).underglow.enabled, false);
  assertEqual(createLivery({ underglow: { enabled: 1 } }).underglow.enabled, false);
  assertEqual(createLivery({ underglow: { enabled: true } }).underglow.enabled, true);
});

test("normalizing an already-normal livery changes nothing", () => {
  const once = createLivery({ paint: { hue: 120, saturation: 0.5 }, windowTint: 0.4 });
  assertDeepEqual(normalizeLivery(once), once);
});

test("a nested livery cannot smuggle extra fields through", () => {
  const livery = createLivery({ paint: { hue: 10, sneaky: "value" }, sneaky: "value" });
  assertEqual(livery.sneaky, undefined);
  assertEqual(livery.paint.sneaky, undefined);
});

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

test("out-of-range values clamp to the field's limit", () => {
  const livery = createLivery({
    paint: { saturation: 99, brightness: -99 },
    windowTint: 42,
  });
  assertEqual(livery.paint.saturation, LIVERY_LIMITS.saturation.max);
  assertEqual(livery.paint.brightness, LIVERY_LIMITS.brightness.min);
  assertEqual(livery.windowTint, LIVERY_LIMITS.windowTint.max);
});

test("hue wraps rather than clamping, because it is a circle", () => {
  // Clamping would collapse 355 and 5 onto opposite endpoints and make the top
  // of the colour wheel unreachable by stepping.
  assertEqual(clampField("hue", 360), 0);
  assertEqual(clampField("hue", 365), 5);
  assertEqual(clampField("hue", -5), 355);
  assertEqual(clampField("hue", 720), 0);
});

test("stepping hue past either end wraps around", () => {
  assertEqual(stepField("hue", 355, 1), 0);
  assertEqual(stepField("hue", 0, -1), 355);
});

test("stepping a bounded field stops at the limit", () => {
  assertEqual(stepField("saturation", LIVERY_LIMITS.saturation.max, 1), LIVERY_LIMITS.saturation.max);
  assertEqual(stepField("brightness", LIVERY_LIMITS.brightness.min, -1), LIVERY_LIMITS.brightness.min);
});

test("stepping does not accumulate float drift into storage", () => {
  // 0.55 + 0.05 lands on 0.6000000000000001, which is invisible on screen but
  // is exactly what gets serialized, sent to the server and compared on the way
  // back. Two liveries that look identical must serialize identically.
  let value = LIVERY_LIMITS.saturation.min;
  for (let i = 0; i < 20; i += 1) value = stepField("saturation", value, 1);
  assertEqual(value, LIVERY_LIMITS.saturation.max);
  let tint = 0;
  for (let i = 0; i < 7; i += 1) tint = stepField("windowTint", tint, 1);
  assertEqual(String(tint).length <= 4, true, `windowTint drifted to ${tint}`);
});

test("brightness stays well inside a range that preserves panel shading", () => {
  // The tint multiplies the body's own luminance. A wide range would crush the
  // shading to black or blow it out to a flat silhouette, and either destroys
  // the shape reading that makes a top-down car recognisable.
  assert(LIVERY_LIMITS.brightness.min > 0.5, "brightness floor would crush shading");
  assert(LIVERY_LIMITS.brightness.max < 1.6, "brightness ceiling would flatten the car");
});

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

test("the default finish is a real finish", () => {
  assert(findFinish(DEFAULT_FINISH), "default finish must exist");
});

test("finish ids are unique", () => {
  assertEqual(new Set(FINISHES.map((finish) => finish.id)).size, FINISHES.length);
});

test("an unknown finish resolves to null rather than undefined behaviour", () => {
  assertEqual(findFinish("chrome"), null);
  assertEqual(findPaintPreset("plaid"), null);
});

test("paint preset ids are unique and every preset is in range", () => {
  assertEqual(new Set(PAINT_PRESETS.map((preset) => preset.id)).size, PAINT_PRESETS.length);
  for (const preset of PAINT_PRESETS) {
    assertEqual(clampField("hue", preset.hue), preset.hue, `${preset.id} hue out of range`);
    assertEqual(
      clampField("saturation", preset.saturation),
      preset.saturation,
      `${preset.id} saturation out of range`,
    );
    assertEqual(
      clampField("brightness", preset.brightness),
      preset.brightness,
      `${preset.id} brightness out of range`,
    );
  }
});

test("applying a preset changes the paint and leaves everything else alone", () => {
  const before = createLivery({
    windowTint: 0.5,
    tailLightHue: 40,
    underglow: { enabled: true, hue: 300, intensity: 0.8 },
  });
  const after = applyPaintPreset(before, "blue");
  assertEqual(after.paint.hue, findPaintPreset("blue").hue);
  assertEqual(after.windowTint, before.windowTint);
  assertEqual(after.tailLightHue, before.tailLightHue);
  assertDeepEqual(after.underglow, before.underglow);
});

test("applying a preset preserves the chosen finish", () => {
  // Finish is a surface property, not a colour, so picking a colour must not
  // silently reset a car the player set to matte.
  const before = createLivery({ paint: { finish: "matte" } });
  assertEqual(applyPaintPreset(before, "red").paint.finish, "matte");
});

test("an unknown preset leaves the livery untouched", () => {
  const before = createLivery({ paint: { hue: 100, saturation: 0.5 } });
  assertDeepEqual(applyPaintPreset(before, "plaid"), before);
});

// ---------------------------------------------------------------------------
// Equality and the render cache key
// ---------------------------------------------------------------------------

test("equality is by value over the normalized form", () => {
  assert(liveryEquals(createLivery(), {}), "default should equal an empty livery");
  assert(liveryEquals({ paint: { hue: 10 } }, { paint: { hue: 10 } }));
  assert(!liveryEquals({ paint: { hue: 10 } }, { paint: { hue: 20 } }));
});

test("every visible field participates in equality", () => {
  // A field left out here is a field the editor could change without the
  // cabinet noticing it needs saving or re-sending.
  const base = createLivery();
  const variants = [
    { paint: { hue: 90 } },
    { paint: { saturation: 0.5 } },
    { paint: { brightness: 1.2 } },
    { paint: { finish: "matte" } },
    { windowTint: 0.5 },
    { tailLightHue: 90 },
    { underglow: { enabled: true } },
    { underglow: { hue: 10 } },
    { underglow: { intensity: 1 } },
  ];
  for (const variant of variants) {
    assert(
      !liveryEquals(base, createLivery({ ...base, ...variant })),
      `${JSON.stringify(variant)} was not seen as a change`,
    );
  }
});

test("liveries that look identical share a cache key", () => {
  assertEqual(liveryKey({ paint: { hue: 10 } }), liveryKey({ paint: { hue: 10 } }));
  assert(liveryKey({ paint: { hue: 10 } }) !== liveryKey({ paint: { hue: 20 } }));
});

test("underglow is absent from the cache key", () => {
  // Underglow is drawn under the car rather than into the sprite, so including
  // it would split the cache into entries holding byte-identical pixels.
  const off = createLivery({ underglow: { enabled: false } });
  const on = createLivery({ underglow: { enabled: true, hue: 300, intensity: 1 } });
  assertEqual(liveryKey(off), liveryKey(on));
  assert(!liveryEquals(off, on), "underglow must still count as a change to the livery itself");
});

test("every field that changes pixels does change the cache key", () => {
  const base = liveryKey(createLivery());
  for (const variant of [
    { paint: { hue: 90 } },
    { paint: { saturation: 0.5 } },
    { paint: { brightness: 1.2 } },
    { paint: { finish: "matte" } },
    { windowTint: 0.5 },
    { tailLightHue: 90 },
  ]) {
    assert(
      liveryKey(createLivery(variant)) !== base,
      `${JSON.stringify(variant)} would draw from a stale cached sprite`,
    );
  }
});

finish();
