import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  REGION_BODY,
  REGION_CABIN,
  REGION_LAMP,
  REGION_OTHER,
  BODY_MAX_SATURATION,
  BODY_MIN_LUMINANCE,
  LAMP_BAND_START,
  PAINT_FADE_LUMINANCE,
  PAINT_FADE_SATURATION,
  classifyPixel,
  luminanceOf,
  perceivedLuminanceOf,
  saturationOf,
  paintFeather,
  bodyCoverageMap,
  finishCurve,
  specularOf,
  hueToRgb,
  paintTint,
  paintPixel,
  paintSwatchColour,
  preparePaint,
  paintWith,
  hueDelta,
  mixPaint,
  zoneWeight,
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
// Paint coverage — the feather that replaced the hard threshold
// ---------------------------------------------------------------------------

const CREASE = [52, 52, 53];  // shading along a panel gap: neutral, just too dark to classify

test("confident bodywork is fully painted", () => {
  assertClose(paintFeather(...ROOF_LIGHT), 1, 0.0001);
  assertClose(paintFeather(...ROOF_DARK), 1, 0.0001);
});

test("a crease shadow just under the threshold is partly painted, not dropped", () => {
  // The cliff this replaced is what mottled a repainted car: at luminance 61 a
  // pixel was painted and at 59 it was not, so the boundary wandered through
  // every shading gradient on the body as a ragged one-pixel line.
  const feather = paintFeather(...CREASE);
  assert(feather > 0 && feather < 1, `expected a partial feather, got ${feather}`);
});

test("the feather reaches zero before it reaches glass, tyres or the outline", () => {
  for (const [name, pixel] of [["glass", GLASS], ["tyre", TYRE], ["outline", OUTLINE]]) {
    assertClose(paintFeather(...pixel), 0, 0.0001, `${name} picked up paint`);
  }
});

test("the feather is monotonic, so a ramp never doubles back", () => {
  let previous = -1;
  for (let l = PAINT_FADE_LUMINANCE - 6; l <= BODY_MIN_LUMINANCE + 6; l += 1) {
    const feather = paintFeather(l, l, l);
    assert(feather >= previous, `feather fell from ${previous} to ${feather} at luminance ${l}`);
    previous = feather;
  }
  assertClose(previous, 1, 0.0001);
});

test("red trim is excluded outright rather than feathered", () => {
  // The seats and the lamp lenses are the two things paint must never touch, so
  // they are refused before brightness is even considered — a bright lens is
  // exactly the case a luminance ramp would let through.
  assertClose(paintFeather(...SEAT_RED), 0, 0.0001);
  assertClose(paintFeather(...LAMP_RED), 0, 0.0001);
});

test("the fade floors sit below the thresholds they feather away from", () => {
  assert(PAINT_FADE_LUMINANCE < BODY_MIN_LUMINANCE, "the luminance fade must be a ramp, not a step");
  assert(PAINT_FADE_SATURATION > BODY_MAX_SATURATION, "the saturation fade must be a ramp, not a step");
});

/** A frame of `fill`, with `patch` painted into the given rect. */
function testFrame(width, height, fill, patches = []) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = fill[0];
    pixels[i * 4 + 1] = fill[1];
    pixels[i * 4 + 2] = fill[2];
    pixels[i * 4 + 3] = 255;
  }
  for (const { x, y, w, h, colour } of patches) {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        const i = (yy * width + xx) * 4;
        pixels[i] = colour[0];
        pixels[i + 1] = colour[1];
        pixels[i + 2] = colour[2];
      }
    }
  }
  return pixels;
}

test("a crease inside bodywork keeps its coverage", () => {
  // One dark row through a panel: every pixel of it has lit paint above and
  // below, which is what a shading crease looks like.
  const pixels = testFrame(16, 16, ROOF_LIGHT, [{ x: 0, y: 8, w: 16, h: 1, colour: CREASE }]);
  const coverage = bodyCoverageMap(pixels, 16, 16);
  assert(coverage[8 * 16 + 4] > 0, "a crease with bodywork either side should be painted");
});

test("a large dark field is glass, and keeps none", () => {
  // The same colour as the crease above, but as a block rather than a line.
  // Colour alone cannot tell these apart — measured, 10.2% of the roster's glass
  // sits inside the feather band — so the coverage map asks a structural
  // question instead, and this is the case that makes it necessary.
  const pixels = testFrame(16, 16, ROOF_LIGHT, [{ x: 4, y: 4, w: 8, h: 8, colour: CREASE }]);
  const coverage = bodyCoverageMap(pixels, 16, 16);
  assertClose(coverage[8 * 16 + 8], 0, 0.0001, "the middle of a dark field must not be painted");
  assert(coverage[4 * 16 + 5] > 0, "its one-pixel rim is the window frame, and is bodywork");
});

test("the feather cannot cascade across a dark field", () => {
  // Coverage has to be judged against *confident* bodywork only. Reading it back
  // from already-feathered neighbours would let paint creep inward one pixel per
  // row until the whole windscreen filled in.
  const pixels = testFrame(24, 24, ROOF_LIGHT, [{ x: 2, y: 2, w: 20, h: 20, colour: CREASE }]);
  const coverage = bodyCoverageMap(pixels, 24, 24);
  for (let y = 4; y < 20; y += 1) {
    for (let x = 4; x < 20; x += 1) {
      assertClose(coverage[y * 24 + x], 0, 0.0001, `paint crept to ${x},${y}`);
    }
  }
});

test("fully transparent pixels are never painted", () => {
  const pixels = testFrame(8, 8, ROOF_LIGHT);
  for (let i = 0; i < 8 * 8; i += 1) pixels[i * 4 + 3] = 0;
  const coverage = bodyCoverageMap(pixels, 8, 8);
  for (const weight of coverage) assertClose(weight, 0, 0.0001);
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
  assertClose(specularOf("chrome", 0.9), specularOf("gloss", 0.9), 0.0001);
});

// ---------------------------------------------------------------------------
// The clearcoat highlight
// ---------------------------------------------------------------------------

test("only bright pixels catch a highlight", () => {
  for (const finish of ["gloss", "matte", "metallic"]) {
    assertClose(specularOf(finish, 0.3), 0, 0.0001, `${finish} lit a mid-tone`);
    assert(specularOf(finish, 1) > 0, `${finish} never highlights at all`);
  }
});

test("matte barely catches the light and metallic catches it hardest", () => {
  assert(specularOf("matte", 0.95) < specularOf("gloss", 0.95), "matte should be the flattest");
  assert(specularOf("metallic", 0.95) > specularOf("gloss", 0.95), "metallic should be the brightest");
});

test("a highlight is the colour of the light, not of the paint", () => {
  // This is the whole reason the clearcoat is added rather than multiplied. A
  // saturated hue carries very little perceived brightness, so multiplying the
  // tint through the artwork dragged the specular down with it and the car came
  // out flat — measured, a deep red threw away 78% of the body's shading.
  const red = { hue: 0, saturation: 1, brightness: 1, finish: "gloss" };
  const highlight = paintPixel(250, 250, 250, red);
  assert(
    highlight[1] > 40 && highlight[2] > 40,
    `a specular should lift toward white, got ${highlight.map(Math.round)}`,
  );
  // ...while the pigment underneath stays firmly the requested hue.
  const midtone = paintPixel(150, 150, 150, red);
  assert(midtone[0] > midtone[1] * 3, "a mid-tone should still read as saturated red");
});

test("saturation zero adds no highlight, so silver stays a bit-exact identity", () => {
  // The clearcoat is scaled by how much brightness the pigment costs, and white
  // costs nothing. Without that, every un-customized car would quietly gain a
  // sheen the source art does not have.
  for (const finish of ["gloss", "matte", "metallic"]) {
    for (const source of [ROOF_LIGHT, ROOF_DARK, [250, 250, 250]]) {
      const out = paintPixel(...source, { hue: 200, saturation: 0, brightness: 1, finish });
      const expected = finishCurve(finish, luminanceOf(...source) / 255) * 255;
      assertClose(out[0], expected, 0.001, `${finish} shifted an unpainted pixel`);
    }
  }
});

test("the clearcoat wins back shading that the pigment took away", () => {
  // The regression this guards: a deep red matte car whose panels all read as
  // one flat shade, with what noise was left showing through as blotches.
  const paint = { hue: 0, saturation: 0.85, brightness: 0.95, finish: "matte" };
  const spread = (from, to) =>
    perceivedLuminanceOf(...paintPixel(to, to, to, paint))
    - perceivedLuminanceOf(...paintPixel(from, from, from, paint));
  // Measured on the source art, body luminance runs roughly 55-255.
  assert(spread(55, 255) > 60, `deep red kept only ${spread(55, 255).toFixed(0)} of shading`);
});

test("brighter source art always paints brighter, at every finish and hue", () => {
  // Adding a term on top of a multiply is exactly how a curve stops being
  // monotonic, and a car whose highlights come out darker than its shadows
  // would read as inside-out.
  for (const finish of ["gloss", "matte", "metallic"]) {
    for (const hue of [0, 120, 240]) {
      const paint = { hue, saturation: 0.9, brightness: 1, finish };
      let previous = -1;
      for (let l = 0; l <= 255; l += 5) {
        const out = perceivedLuminanceOf(...paintPixel(l, l, l, paint));
        assert(out >= previous - 0.001, `${finish}/${hue} dipped at luminance ${l}`);
        previous = out;
      }
    }
  }
});

test("the clearcoat never overflows a channel", () => {
  for (const finish of ["gloss", "matte", "metallic"]) {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      const out = paintPixel(255, 255, 255, { hue, saturation: 1, brightness: 1.35, finish });
      for (const channel of out) {
        assert(channel <= 255 && channel >= 0, `${finish}/${hue} out of range: ${channel}`);
      }
    }
  }
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

// ---------------------------------------------------------------------------
// A black car — the reason the brightness floor could come down
// ---------------------------------------------------------------------------

test("preparing a paint and painting with it is the same as painting in one go", () => {
  // The split exists only to hoist the per-paint work out of the pixel loop, so
  // the two paths must not be able to disagree.
  for (const paint of [
    { hue: 0, saturation: 0, brightness: 1, finish: "gloss" },
    { hue: 215, saturation: 0.8, brightness: 0.95, finish: "metallic" },
    { hue: 40, saturation: 1, brightness: 0.16, finish: "matte" },
  ]) {
    const prepared = preparePaint(paint);
    for (const source of [ROOF_LIGHT, ROOF_DARK, [120, 121, 122]]) {
      const direct = paintPixel(...source, paint);
      const viaPrepared = paintWith(...source, prepared);
      for (let c = 0; c < 3; c += 1) assertClose(viaPrepared[c], direct[c], 1e-9);
    }
  }
});

test("a car painted at the brightness floor is black but still has shading", () => {
  // The whole point of the clearcoat fix. A flat silhouette is not a black car —
  // it is a hole in the screen — so the highlight has to survive the pigment.
  const black = { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" };
  const darkest = luminanceOf(...paintPixel(...ROOF_DARK, black));
  const brightest = luminanceOf(...paintPixel(255, 255, 255, black));

  assert(darkest < 60, `a black car's shadows came out at ${darkest}`);
  assert(brightest - darkest > 90, `only ${brightest - darkest} of shading survived`);
});

test("the clearcoat is what saves a dark car, not the brightness itself", () => {
  // Guards the specific regression: scaling the clearcoat by the *tint's*
  // brightness makes it vanish for any neutral paint, because a black paint's
  // tint is white. That is what pinned the old floor at 0.65.
  const black = { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" };
  assert(preparePaint(black).pigmentCost > 0.7, "a black paint must owe clearcoat");

  const silver = { hue: 0, saturation: 0, brightness: 1, finish: "gloss" };
  assertEqual(preparePaint(silver).pigmentCost, 0, "factory silver must owe none");
});

test("brightening a paint past 1 does not hand it free clearcoat", () => {
  // Without the clamp a pale paint comes out *owing* highlight and every white
  // car gains a sheen nobody asked for.
  for (const brightness of [1, 1.15, 1.35]) {
    const cost = preparePaint({ hue: 0, saturation: 0, brightness, finish: "gloss" }).pigmentCost;
    assertEqual(cost, 0, `a neutral paint at ${brightness} invented clearcoat`);
  }
});

test("shading stays monotonic all the way down to the floor", () => {
  // Adding a term on top of a multiply is how a curve stops being monotonic, and
  // a car whose highlights come out darker than its shadows reads as inside-out.
  for (const brightness of [0.12, 0.16, 0.3, 0.65, 1, 1.35]) {
    for (const finish of ["gloss", "matte", "metallic"]) {
      let previous = -1;
      for (let level = 0; level <= 255; level += 5) {
        const lit = luminanceOf(...paintPixel(level, level, level, {
          hue: 210, saturation: 0.6, brightness, finish,
        }));
        assert(lit >= previous - 1e-9, `${finish} at ${brightness} inverted near ${level}`);
        previous = lit;
      }
    }
  }
});

test("a swatch shows the painted result, so two different paints look different", () => {
  // The picker used to draw the tint itself, which made Silver and White the
  // same flat white block — both their tints are pure white — and the only way
  // to tell two paints apart was to read the label.
  const swatches = [
    ["silver", { hue: 0, saturation: 0, brightness: 1, finish: "gloss" }],
    ["black", { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" }],
    ["gunmetal", { hue: 0, saturation: 0, brightness: 0.5, finish: "gloss" }],
    ["white", { hue: 0, saturation: 0, brightness: 1.3, finish: "gloss" }],
  ].map(([id, paint]) => [id, paintSwatchColour(paint)]);

  assertEqual(new Set(swatches.map(([, colour]) => colour)).size, swatches.length,
    `two swatches came out identical: ${JSON.stringify(swatches)}`);

  // ...and they are ordered the way their names claim.
  const level = (id) => Number(swatches.find(([name]) => name === id)[1].match(/\d+/)[0]);
  assert(level("black") < level("gunmetal"), "black is not darker than gunmetal");
  assert(level("gunmetal") < level("silver"), "gunmetal is not darker than silver");
  assert(level("silver") < level("white"), "silver is not darker than white");
});

test("a swatch is a colour a canvas will accept", () => {
  for (const hue of [0, 90, 215, 359]) {
    const colour = paintSwatchColour({ hue, saturation: 0.8, brightness: 1, finish: "matte" });
    assert(/^rgb\(\d+, \d+, \d+\)$/.test(colour), `unusable swatch colour: ${colour}`);
  }
});

// ---------------------------------------------------------------------------
// Fading between two paints
// ---------------------------------------------------------------------------

test("hue takes the short way round the wheel", () => {
  assertEqual(hueDelta(350, 10), 20);
  assertEqual(hueDelta(10, 350), -20);
  assertEqual(hueDelta(0, 180), 180);
  assertEqual(hueDelta(0, 0), 0);
});

test("a fade from 350 to 10 goes through red, not through everything else", () => {
  // Interpolating the raw numbers would send it the long way and put a rainbow
  // down the side of the car.
  const a = { hue: 350, saturation: 1, brightness: 1, finish: "gloss" };
  const b = { hue: 10, saturation: 1, brightness: 1, finish: "gloss" };
  for (let t = 0; t <= 1; t += 0.1) {
    const { hue } = mixPaint(a, b, t);
    const wrapped = ((hue % 360) + 360) % 360;
    assert(wrapped >= 350 || wrapped <= 10, `the fade wandered to ${wrapped}`);
  }
});

test("a fade lands exactly on its two stops, and clamps outside them", () => {
  const a = { hue: 20, saturation: 0.2, brightness: 0.8, finish: "matte" };
  const b = { hue: 200, saturation: 0.9, brightness: 1.2, finish: "gloss" };
  // Closeness rather than equality: a mix is a float that feeds the renderer and
  // never reaches storage, so accumulated drift is not the hazard `stepField`
  // rounds against.
  assertEqual(mixPaint(a, b, 0).hue, 20);
  assertClose(mixPaint(a, b, 1).saturation, 0.9, 1e-9);
  assertClose(mixPaint(a, b, 1).brightness, 1.2, 1e-9);
  // Out of range is clamped rather than extrapolated: a paint past its own stop
  // could leave the field's limits and produce a car the normalizer would reject.
  assertEqual(mixPaint(a, b, -3).hue, 20);
  assertClose(mixPaint(a, b, 9).saturation, 0.9, 1e-9);
});

test("a fade keeps the first paint's finish rather than inventing one", () => {
  // There is no coherent halfway point between matte and metallic.
  const a = { hue: 0, saturation: 0.5, brightness: 1, finish: "matte" };
  const b = { hue: 90, saturation: 0.5, brightness: 1, finish: "metallic" };
  for (const t of [0, 0.5, 1]) assertEqual(mixPaint(a, b, t).finish, "matte");
});

// ---------------------------------------------------------------------------
// Layer zones
// ---------------------------------------------------------------------------

const band = (over) => ({ kind: "band", position: 0.5, size: 0.2, feather: 0, mirrored: false, ...over });
const stripe = (over) => ({ kind: "stripe", position: 0.5, size: 0.2, feather: 0, mirrored: false, ...over });

test("a band is measured down the car and a stripe across it", () => {
  // The axis is the whole difference between the two shapes, so a band must
  // ignore x entirely and a stripe must ignore y entirely.
  assertEqual(zoneWeight(band({}), 0.02, 0.5), 1);
  assertEqual(zoneWeight(band({}), 0.98, 0.5), 1);
  assertEqual(zoneWeight(band({}), 0.5, 0.02), 0);

  assertEqual(zoneWeight(stripe({}), 0.5, 0.02), 1);
  assertEqual(zoneWeight(stripe({}), 0.5, 0.98), 1);
  assertEqual(zoneWeight(stripe({}), 0.02, 0.5), 0);
});

test("a hard-edged zone covers exactly its size", () => {
  const layer = band({ position: 0.6, size: 0.2 });
  assertEqual(zoneWeight(layer, 0.5, 0.5), 1);   // just inside
  assertEqual(zoneWeight(layer, 0.5, 0.7), 1);   // just inside
  assertEqual(zoneWeight(layer, 0.5, 0.49), 0);
  assertEqual(zoneWeight(layer, 0.5, 0.71), 0);
});

test("a feather straddles the edge, so softening one does not move it", () => {
  // If the feather ate inward the shape would shrink as you softened it; if it
  // grew outward it would spread. Either makes the two controls fight.
  const hard = band({ position: 0.5, size: 0.3, feather: 0 });
  const soft = band({ position: 0.5, size: 0.3, feather: 0.1 });
  const edge = 0.5 + 0.15;
  assertClose(zoneWeight(soft, 0.5, edge), 0.5, 1e-9);
  assertEqual(zoneWeight(hard, 0.5, 0.5), zoneWeight(soft, 0.5, 0.5));

  // ...and it really is soft: strictly between 0 and 1 across the ramp.
  const inside = zoneWeight(soft, 0.5, edge - 0.03);
  const outside = zoneWeight(soft, 0.5, edge + 0.03);
  assert(inside > 0.5 && inside < 1, `inside the ramp read ${inside}`);
  assert(outside > 0 && outside < 0.5, `outside the ramp read ${outside}`);
});

test("a feathered zone never reports a weight outside 0..1", () => {
  for (const feather of [0, 0.01, 0.15, 0.3]) {
    for (const size of [0.02, 0.2, 1]) {
      for (let axis = 0; axis <= 1; axis += 0.02) {
        const w = zoneWeight(band({ position: 0.5, size, feather }), 0.5, axis);
        assert(w >= 0 && w <= 1, `weight ${w} at ${axis} (size ${size}, feather ${feather})`);
      }
    }
  }
});

test("mirroring puts the same shape on the other side of the centreline", () => {
  const one = stripe({ position: 0.2, size: 0.1, mirrored: false });
  const pair = stripe({ position: 0.2, size: 0.1, mirrored: true });
  assertEqual(zoneWeight(one, 0.2, 0.5), 1);
  assertEqual(zoneWeight(one, 0.8, 0.5), 0);
  assertEqual(zoneWeight(pair, 0.2, 0.5), 1);
  assertEqual(zoneWeight(pair, 0.8, 0.5), 1);
  // The gap between the pair is still a gap.
  assertEqual(zoneWeight(pair, 0.5, 0.5), 0);
});

test("a mirrored zone at the centreline is one shape, not two overlapping ones", () => {
  // Overlap must not read as double strength — the weight is a coverage, and a
  // stripe painted twice is still one stripe.
  const centred = stripe({ position: 0.5, size: 0.3, feather: 0.1, mirrored: true });
  for (let x = 0; x <= 1; x += 0.02) {
    const w = zoneWeight(centred, x, 0.5);
    assert(w <= 1, `mirrored overlap reported ${w}`);
  }
  assertEqual(zoneWeight(centred, 0.5, 0.5), 1);
});

finish();
