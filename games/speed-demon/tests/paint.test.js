import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  REGION_BODY,
  REGION_CABIN,
  REGION_LAMP,
  REGION_OTHER,
  BODY_MAX_SATURATION,
  BODY_MIN_LUMINANCE,
  LAMP_BAND_START,
  classifyPixel,
  luminanceOf,
  saturationOf,
  finishCurve,
  hueToRgb,
  paintTint,
  paintPixel,
  tintCabinPixel,
  lampPixel,
} from "../scripts/garage/paint.js";

suite("paint — turning a neutral body into a coloured one");

// Colours sampled off the real sheets rather than invented, so these cases fail
// if the classifier drifts away from the art it was measured against.
const ROOF_LIGHT = [200, 201, 201];   // models-a r0c1 roof
const ROOF_DARK = [156, 157, 158];    // models-a r1c3 roof
const SEAT_RED = [150, 30, 34];       // harness through the rear window
const LAMP_RED = [190, 28, 30];       // tail light lens
const GLASS = [38, 36, 40];           // rear glass
const OUTLINE = [45, 26, 44];         // the art's dark purple outline stroke
const TYRE = [24, 22, 26];

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

test("neutral bright pixels are bodywork", () => {
  assertEqual(classifyPixel(...ROOF_LIGHT, 0.3), REGION_BODY);
  assertEqual(classifyPixel(...ROOF_DARK, 0.3), REGION_BODY);
});

test("the two red bands are told apart by where they sit on the car", () => {
  // Cars are drawn nose-up, so the lamps are at the bottom of the frame. The
  // seat harness at ~0.5 and the lens at ~0.8 are both red; only their position
  // separates them, and getting this wrong means window tint dims the tail
  // lights or a lamp hue shift repaints the seats.
  assertEqual(classifyPixel(...SEAT_RED, 0.50), REGION_CABIN);
  assertEqual(classifyPixel(...LAMP_RED, 0.80), REGION_LAMP);
});

test("the same red pixel classifies differently either side of the band edge", () => {
  assertEqual(classifyPixel(...LAMP_RED, LAMP_BAND_START - 0.01), REGION_CABIN);
  assertEqual(classifyPixel(...LAMP_RED, LAMP_BAND_START), REGION_LAMP);
});

test("glass inside the cabin band is cabin", () => {
  assertEqual(classifyPixel(...GLASS, 0.35), REGION_CABIN);
});

test("dark pixels outside the cabin band are left alone", () => {
  // Tyres, splitters and the outline stroke share glass's dark neutral
  // signature. Darkening them with window tint would muddy the silhouette.
  assertEqual(classifyPixel(...TYRE, 0.97), REGION_OTHER);
  assertEqual(classifyPixel(...OUTLINE, 0.02), REGION_OTHER);
});

test("the outline stroke is never painted", () => {
  // It is a near-black purple; if it ever classified as bodywork the car would
  // lose its edge definition against the road at every colour.
  for (const y of [0.2, 0.5, 0.9]) {
    assert(classifyPixel(...OUTLINE, y) !== REGION_BODY, `outline painted at y=${y}`);
  }
});

test("saturated pixels are never bodywork whatever their brightness", () => {
  assert(classifyPixel(255, 40, 40, 0.3) !== REGION_BODY);
  assert(classifyPixel(40, 255, 40, 0.3) !== REGION_BODY);
});

test("the body thresholds match what was measured off the sheets", () => {
  // Roof saturation across all 24 models measured 0.004-0.019, so the ceiling
  // has a wide margin; widening it further starts catching interior trim.
  assert(BODY_MAX_SATURATION > 0.02 && BODY_MAX_SATURATION < 0.3);
  assert(BODY_MIN_LUMINANCE > 40 && BODY_MIN_LUMINANCE < 100);
  assertClose(saturationOf(...ROOF_LIGHT), 0, 0.02);
  assert(luminanceOf(...ROOF_LIGHT) >= BODY_MIN_LUMINANCE);
});

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

test("saturation zero is the identity paint", () => {
  // Factory silver must not be a special case in the renderer: it has to fall
  // out of the same multiply everything else uses.
  const [r, g, b] = paintTint(0, 0);
  assertClose(r, 255, 0.001);
  assertClose(g, 255, 0.001);
  assertClose(b, 255, 0.001);
});

test("an unpainted body pixel survives a saturation-zero repaint unchanged", () => {
  const [r, g, b] = paintPixel(...ROOF_LIGHT, {
    hue: 0, saturation: 0, brightness: 1, finish: "gloss",
  });
  assertClose(r, ROOF_LIGHT[0], 1.5);
  assertClose(g, ROOF_LIGHT[0], 1.5);
  assertClose(b, ROOF_LIGHT[0], 1.5);
});

test("painting preserves relative shading, which is what keeps panels readable", () => {
  const paint = { hue: 215, saturation: 0.8, brightness: 1, finish: "gloss" };
  const light = paintPixel(...ROOF_LIGHT, paint);
  const dark = paintPixel(...ROOF_DARK, paint);
  assert(
    luminanceOf(...light) > luminanceOf(...dark),
    "a lighter body pixel must stay lighter after painting",
  );
});

test("the painted hue actually lands on the requested channel", () => {
  const blue = paintPixel(...ROOF_LIGHT, { hue: 240, saturation: 1, brightness: 1, finish: "gloss" });
  assert(blue[2] > blue[0] && blue[2] > blue[1], "hue 240 should come out blue");
  const red = paintPixel(...ROOF_LIGHT, { hue: 0, saturation: 1, brightness: 1, finish: "gloss" });
  assert(red[0] > red[1] && red[0] > red[2], "hue 0 should come out red");
});

test("brightness moves the whole body without inverting the shading", () => {
  const paint = { hue: 0, saturation: 0, finish: "gloss" };
  const dim = paintPixel(...ROOF_LIGHT, { ...paint, brightness: 0.7 });
  const bright = paintPixel(...ROOF_LIGHT, { ...paint, brightness: 1.3 });
  assert(luminanceOf(...dim) < luminanceOf(...bright));
});

test("no channel ever overflows", () => {
  for (const hue of [0, 60, 120, 180, 240, 300]) {
    const out = paintPixel(255, 255, 255, { hue, saturation: 1, brightness: 1.35, finish: "metallic" });
    for (const channel of out) {
      assert(channel <= 255 && channel >= 0, `channel out of range: ${channel}`);
    }
  }
});

test("gloss is the identity finish", () => {
  for (const l of [0, 0.25, 0.5, 0.75, 1]) {
    assertClose(finishCurve("gloss", l), l, 0.0001);
  }
});

test("matte compresses contrast and metallic expands it", () => {
  const spread = (finish) => finishCurve(finish, 0.9) - finishCurve(finish, 0.1);
  assert(spread("matte") < spread("gloss"), "matte should flatten the shading");
  assert(spread("metallic") > spread("gloss"), "metallic should deepen the shading");
});

test("every finish stays in range and keeps mid-grey put", () => {
  for (const finish of ["gloss", "matte", "metallic"]) {
    for (const l of [-1, 0, 0.5, 1, 2]) {
      const out = finishCurve(finish, l);
      assert(out >= 0 && out <= 1, `${finish} left range at ${l}: ${out}`);
    }
    assertClose(finishCurve(finish, 0.5), 0.5, 0.0001, `${finish} moved mid-grey`);
  }
});

test("an unknown finish behaves as gloss rather than throwing", () => {
  assertClose(finishCurve("chrome", 0.8), 0.8, 0.0001);
});

test("hueToRgb walks the wheel and wraps", () => {
  const red = hueToRgb(0);
  assert(red[0] === 255 && red[1] === 0 && red[2] === 0);
  const wrapped = hueToRgb(360);
  assertClose(wrapped[0], red[0], 0.001);
  assertClose(hueToRgb(-120)[2], hueToRgb(240)[2], 0.001);
});

// ---------------------------------------------------------------------------
// Glass and lamps
// ---------------------------------------------------------------------------

test("window tint darkens, and full tint hides the interior", () => {
  const clear = tintCabinPixel(...SEAT_RED, 0);
  const dark = tintCabinPixel(...SEAT_RED, 1);
  assert(luminanceOf(...dark) < luminanceOf(...clear), "tint must darken");
  // The visible point of the option is that the red seats stop showing.
  assert(
    saturationOf(...dark) < saturationOf(...SEAT_RED) * 0.5,
    "full tint should wash the red out of the interior",
  );
});

test("zero tint leaves the cabin untouched", () => {
  const out = tintCabinPixel(...GLASS, 0);
  assertClose(out[0], GLASS[0], 0.001);
  assertClose(out[1], GLASS[1], 0.001);
  assertClose(out[2], GLASS[2], 0.001);
});

test("a lamp takes the requested hue and keeps its brightness", () => {
  const amber = lampPixel(...LAMP_RED, 40);
  assert(amber[1] > LAMP_RED[1], "amber should lift the green channel");
  const blue = lampPixel(...LAMP_RED, 240);
  assert(blue[2] > blue[0], "hue 240 should come out blue");
});

test("a bright lens stays brighter than a dim one after recolouring", () => {
  const bright = lampPixel(220, 30, 32, 120);
  const dim = lampPixel(110, 20, 22, 120);
  assert(luminanceOf(...bright) > luminanceOf(...dim));
});

test("lamp recolouring never overflows", () => {
  for (const hue of [0, 90, 180, 270]) {
    for (const channel of lampPixel(255, 255, 255, hue)) {
      assert(channel <= 255 && channel >= 0, `lamp channel out of range: ${channel}`);
    }
  }
});

finish();
