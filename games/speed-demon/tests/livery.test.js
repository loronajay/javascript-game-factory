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
  FADE_AXES,
  DEFAULT_FADE_AXIS,
  DEFAULT_LAYER_KIND,
  LAYER_PRESETS,
  MAX_LAYERS,
  findFadeAxis,
  findLayerKind,
  findLayerPreset,
  addLayer,
  removeLayer,
  updateLayer,
  layerById,
  canAddLayer,
  describeLivery,
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

test("brightness reaches genuine black and stops before the highlights blow out", () => {
  // The floor used to sit at 0.65, where the median body pixel paints to
  // luminance 129 — a mid grey nobody would call a black car. It was there to
  // hide a paint bug rather than to protect the artwork: the clearcoat was
  // scaled by the tint's brightness, and a black paint's tint is white, so a
  // dark car lost every highlight and went flat. `paintWith` fixes that, and
  // `paint.test.js` holds the test that the shading survives down here.
  assert(LIVERY_LIMITS.brightness.min <= 0.2, "brightness floor cannot reach black");
  assert(LIVERY_LIMITS.brightness.min > 0, "brightness floor must leave the car visible");
  // The ceiling is still a real limit: past it the clearcoat clips every
  // highlight to white and the shape stops reading.
  assert(LIVERY_LIMITS.brightness.max < 1.6, "brightness ceiling would flatten the car");
});

test("the black paint preset is actually black", () => {
  // The palette is where most players will reach for black, so the swatch has to
  // land in the range the floor now opens up rather than at the old floor.
  const black = PAINT_PRESETS.find((preset) => preset.id === "black");
  assert(black, "the palette must offer black");
  assertEqual(black.saturation, 0);
  assert(black.brightness <= 0.2, `black preset is only ${black.brightness} bright`);
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
    { fade: { enabled: true } },
    { layers: [{ kind: "band" }] },
  ]) {
    assert(
      liveryKey(createLivery(variant)) !== base,
      `${JSON.stringify(variant)} would draw from a stale cached sprite`,
    );
  }
});

// ---------------------------------------------------------------------------
// Fade — a second colour stop on the base paint
// ---------------------------------------------------------------------------

test("a livery with no fade normalizes to a switched-off one", () => {
  const livery = createLivery({ paint: { hue: 40 } });
  assertEqual(livery.fade.enabled, false);
  assertEqual(findFadeAxis(livery.fade.axis)?.id, livery.fade.axis);
});

test("an unknown fade axis falls back rather than throwing", () => {
  assertEqual(createLivery({ fade: { axis: "diagonal" } }).fade.axis, DEFAULT_FADE_AXIS);
  assertEqual(createLivery({ fade: { axis: null } }).fade.axis, DEFAULT_FADE_AXIS);
});

test("every fade axis maps a frame position into 0..1", () => {
  for (const axis of FADE_AXES) {
    for (const [xf, yf] of [[0, 0], [0.5, 0.5], [1, 1], [0, 1], [1, 0]]) {
      const t = axis.at(xf, yf);
      assert(t >= 0 && t <= 1, `${axis.id} produced ${t} at ${xf},${yf}`);
    }
  }
});

test("reversing an axis is the mirror of the one it reverses", () => {
  const forward = FADE_AXES.find((axis) => axis.id === "nose-tail");
  const back = FADE_AXES.find((axis) => axis.id === "tail-nose");
  for (const yf of [0, 0.25, 0.5, 0.75, 1]) {
    assertEqual(forward.at(0.5, yf), 1 - back.at(0.5, yf));
  }
});

test("a switched-off fade does not change how a livery compares or caches", () => {
  // Turning a fade off must keep its stops — toggling twice cannot lose the
  // gradient — but a stashed colour nobody can see is not a different car.
  const plain = createLivery();
  const stashed = createLivery({ fade: { enabled: false, hue: 300, brightness: 0.4 } });
  assertEqual(liveryEquals(plain, stashed), true);
  assertEqual(liveryKey(plain), liveryKey(stashed));
  assertEqual(stashed.fade.hue, 300, "the stops must survive being switched off");
});

test("a switched-on fade does distinguish two liveries", () => {
  const a = createLivery({ fade: { enabled: true, hue: 100 } });
  const b = createLivery({ fade: { enabled: true, hue: 300 } });
  assertEqual(liveryEquals(a, b), false);
  assert(liveryKey(a) !== liveryKey(b), "two fades must not share a cached sprite");
});

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

test("a livery with no layers normalizes to an empty list", () => {
  assertDeepEqual(createLivery().layers, []);
  assertDeepEqual(createLivery({ layers: null }).layers, []);
  assertDeepEqual(createLivery({ layers: "stripes" }).layers, []);
});

test("layers past the ceiling are dropped, not honoured", () => {
  const many = Array.from({ length: 40 }, () => ({ kind: "band" }));
  assertEqual(createLivery({ layers: many }).layers.length, MAX_LAYERS);
});

test("every layer field is clamped, whatever arrives", () => {
  const [layer] = createLivery({
    layers: [{ kind: "helix", position: 9, size: -4, feather: 99, mirrored: "yes", paint: { hue: 4000 } }],
  }).layers;
  assertEqual(layer.kind, DEFAULT_LAYER_KIND);
  assertEqual(layer.position, LIVERY_LIMITS.layerPosition.max);
  assertEqual(layer.size, LIVERY_LIMITS.layerSize.min);
  assertEqual(layer.feather, LIVERY_LIMITS.layerFeather.max);
  // A truthy leftover must not double a stripe the player never mirrored.
  assertEqual(layer.mirrored, false);
  assert(layer.paint.hue >= 0 && layer.paint.hue <= 359, "layer hue escaped the wheel");
});

test("adding a layer seeds it from its preset and stops at the ceiling", () => {
  let livery = createLivery();
  for (const preset of LAYER_PRESETS) livery = addLayer(livery, preset.id);
  assertEqual(livery.layers.length, MAX_LAYERS);

  const roof = addLayer(createLivery(), "roof").layers[0];
  const preset = findLayerPreset("roof");
  assertEqual(roof.kind, preset.kind);
  assertEqual(roof.position, preset.position);
  assertEqual(roof.size, preset.size);
});

test("a fresh layer is visible against the car it lands on", () => {
  // A white stripe defaulted onto factory silver is invisible, and the player's
  // next move is to look for a bug rather than for the colour picker.
  const onSilver = addLayer(createLivery(), "stripes").layers[0];
  const onBlack = addLayer(createLivery({ paint: { brightness: 0.16 } }), "stripes").layers[0];
  assert(onSilver.paint.brightness < 0.5, "a layer on a pale car must be dark");
  assert(onBlack.paint.brightness > 1, "a layer on a dark car must be pale");
});

test("layer ids are stable, and an update finds a layer by id rather than index", () => {
  let livery = addLayer(addLayer(createLivery(), "roof"), "stripes");
  const [first, second] = livery.layers;
  assert(first.id !== second.id, "two layers cannot share an id");

  livery = updateLayer(livery, second.id, { position: 0.31 });
  assertEqual(layerById(livery, second.id).position, 0.31);
  assertEqual(layerById(livery, first.id).position, findLayerPreset("roof").position);

  // Removing the one in front must not renumber the one behind, or a cursor
  // holding an id would start editing its neighbour.
  livery = removeLayer(livery, first.id);
  assertEqual(livery.layers.length, 1);
  assertEqual(livery.layers[0].id, second.id);
});

test("an update through a layer id re-clamps rather than trusting the caller", () => {
  const livery = addLayer(createLivery(), "roof");
  const id = livery.layers[0].id;
  assertEqual(updateLayer(livery, id, { size: 40 }).layers[0].size, LIVERY_LIMITS.layerSize.max);
  assertDeepEqual(updateLayer(livery, "no-such-layer", { size: 0.5 }).layers, livery.layers);
});

test("layer order is part of what a livery is", () => {
  // Later layers paint over earlier ones, so the same two layers in the other
  // order is a different car and must not share a cached sprite.
  const one = addLayer(addLayer(createLivery(), "roof"), "stripes");
  const other = { ...one, layers: [one.layers[1], one.layers[0]] };
  assertEqual(liveryEquals(one, other), false);
  assert(liveryKey(one) !== liveryKey(other), "two orders must not share a sprite");
});

test("canAddLayer agrees with what addLayer will do", () => {
  let livery = createLivery();
  for (let i = 0; i < MAX_LAYERS + 2; i += 1) {
    const allowed = canAddLayer(livery);
    const before = livery.layers.length;
    livery = addLayer(livery, "stripes");
    assertEqual(livery.layers.length > before, allowed, `disagreed at ${before} layers`);
  }
});

test("a layer preset catalog with a duplicate id or a bad shape would break the picker", () => {
  const ids = new Set();
  for (const preset of LAYER_PRESETS) {
    assert(!ids.has(preset.id), `duplicate layer preset ${preset.id}`);
    ids.add(preset.id);
    assert(findLayerKind(preset.kind), `${preset.id} names an unknown shape`);
    assertEqual(clampField("layerPosition", preset.position), preset.position);
    assertEqual(clampField("layerSize", preset.size), preset.size);
    assertEqual(clampField("layerFeather", preset.feather), preset.feather);
  }
});

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

test("the neutral names span the whole brightness range without a gap", () => {
  const seen = new Set();
  for (let b = LIVERY_LIMITS.brightness.min; b <= LIVERY_LIMITS.brightness.max; b += 0.02) {
    const name = describeLivery({ paint: { saturation: 0, brightness: b } });
    assert(name.length > 0, `no name at brightness ${b}`);
    seen.add(name);
  }
  assert(seen.has("Black"), "the darkest paints must be called black");
  assert(seen.has("White"), "the palest paints must be called white");
  assert(seen.size >= 3, "one name for the whole range tells the player nothing");
});

test("a name says how many layers are on the car, and still fits in storage", () => {
  let livery = createLivery({ paint: { hue: 215, saturation: 0.8, finish: "metallic" } });
  assert(!describeLivery(livery).includes("+"), "an unlayered car needs no count");
  for (let i = 0; i < MAX_LAYERS; i += 1) livery = addLayer(livery, "stripes");
  const name = describeLivery(livery);
  assert(name.includes(`+${MAX_LAYERS}`), `${name} does not say how many layers`);
  // MAX_PRESET_NAME_LENGTH on the server; a longer name is silently truncated.
  assert(name.length <= 24, `${name} is ${name.length} characters`);
});

finish();
