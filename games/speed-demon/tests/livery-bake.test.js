// The bake — where a livery stops being numbers and becomes pixels.
//
// This is the one renderer in the cabinet worth testing end to end. `paint.js`
// already proves what a tint does to a pixel and `livery.js` proves what a valid
// configuration is, but *the stack* — base, fade, four layers, all masked by
// bodywork coverage — only exists here, and the interesting failures are the
// ones where each part is individually right: a stripe that creeps onto the
// glass, a fade resolved down the wrong axis, a layer order that inverts, or a
// factory-silver car that no longer comes out byte-for-byte unpainted.
//
// It runs against a stub canvas rather than a browser. The stub is deliberately
// dumb — it lifts a rect out of a decoded PNG and hands back the bytes — because
// its job is to let the *real* `bakeLiverySprite` run, not to model a canvas.
// The alternative is a screenshot nobody diffs.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { suite, test, assert, assertEqual, finish } from "./harness.js";
import { readPng } from "./png.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// A canvas, in as few lines as the bake actually needs
// ---------------------------------------------------------------------------

let lastDraw = null;
globalThis.document = {
  createElement() {
    const canvas = { width: 0, height: 0, data: null, getContext: () => ctx };
    const ctx = {
      drawImage(image, sx, sy) { lastDraw = { image, sx, sy }; },
      getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        const { image, sx, sy } = lastDraw;
        for (let row = 0; row < height; row += 1) {
          for (let column = 0; column < width; column += 1) {
            const from = ((sy + row) * image.width + (sx + column)) * 4;
            const to = (row * width + column) * 4;
            for (let channel = 0; channel < 4; channel += 1) data[to + channel] = image[from + channel];
          }
        }
        canvas.data = data;
        return { data, width, height };
      },
      putImageData(imageData) { canvas.data = imageData.data; },
    };
    return canvas;
  },
};

const { liverySprite, createLiveryCache, COVERAGE_CACHE_LIMIT } = await import("../scripts/render/livery.js");
const {
  createLivery, addLayer, updateLayer,
} = await import("../scripts/garage/livery.js");
const {
  classifyPixel, bodyCoverageMap, luminanceOf, curveBow, REGION_LAMP,
} = await import("../scripts/garage/paint.js");
const { MODELS_A } = await import("../scripts/assets/car-atlas.js");

suite("livery bake — a configuration becoming pixels");

const sheet = readPng(readFileSync(join(root, "assets/car-sheets/models-a.png")));
// `imageReady` wants a loaded <img>; the stub only ever reads `.width` and the
// bytes, so the sheet stands in for one.
const image = Object.assign(sheet.pixels, {
  width: sheet.width,
  complete: true,
  naturalWidth: sheet.width,
});

const MODEL = MODELS_A.frames.find((frame) => frame.id === "kaido-gts");
const OTHER = MODELS_A.frames.find((frame) => frame.id === "toro-sv");

const bake = (livery, model = MODEL, cache = createLiveryCache()) =>
  liverySprite(cache, { image, model, livery });

/** The source frame, as the bake sees it before it touches anything. */
function sourceFrame(model) {
  const pixels = new Uint8ClampedArray(model.sw * model.sh * 4);
  for (let y = 0; y < model.sh; y += 1) {
    for (let x = 0; x < model.sw; x += 1) {
      const from = ((model.sy + y) * sheet.width + (model.sx + x)) * 4;
      const to = (y * model.sw + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) pixels[to + channel] = sheet.pixels[from + channel];
    }
  }
  return pixels;
}

const SOURCE = sourceFrame(MODEL);
const COVERAGE = bodyCoverageMap(SOURCE, MODEL.sw, MODEL.sh);

const at = (data, x, y) => {
  const i = (y * MODEL.sw + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};

/** Every pixel the coverage map says is not paint at all. */
function unpaintablePixels() {
  const found = [];
  for (let y = 0; y < MODEL.sh; y += 1) {
    for (let x = 0; x < MODEL.sw; x += 1) {
      const k = y * MODEL.sw + x;
      if (SOURCE[k * 4 + 3] === 0 || COVERAGE[k] > 0) continue;
      found.push({ x, y, k });
    }
  }
  return found;
}

const paintOf = (hue, over = {}) => ({ hue, saturation: 1, brightness: 1, ...over });

// ---------------------------------------------------------------------------
// The identity, which every other claim in the paint system rests on
// ---------------------------------------------------------------------------

test("a factory car comes back byte-for-byte unpainted", () => {
  // If this ever fails, every un-customized car in the game has quietly changed
  // colour — including every opponent who never opened the garage.
  const sprite = bake(createLivery());
  for (let i = 0; i < SOURCE.length; i += 1) {
    assertEqual(sprite.data[i], SOURCE[i], `byte ${i} of a factory car changed`);
  }
});

test("a fade or a layer over factory paint still repaints the car", () => {
  // The bake skips its whole pixel loop when nothing can have changed, and the
  // cheap version of that test — "is the base paint the identity?" — would skip
  // a car whose only colour comes from a layer.
  const layered = addLayer(createLivery(), "stripes");
  const faded = createLivery({ fade: { enabled: true, hue: 200, saturation: 1, brightness: 0.6 } });

  for (const [what, livery] of [["a layer", layered], ["a fade", faded]]) {
    const sprite = bake(livery);
    const changed = sprite.data.some((byte, i) => byte !== SOURCE[i]);
    assert(changed, `${what} over factory paint was skipped as a no-op`);
  }
});

test("a stripe on a factory car leaves the rest of the car exactly as it was", () => {
  // The identity paint is not the identity *function*: painting multiplies a
  // tint through the pixel's luminance, so a white tint replaces (200, 201, 201)
  // with (201, 201, 201). Over a colour that is the whole design; over factory
  // silver it is a quiet desaturation of the artwork, and it only became
  // reachable when layers made a silver car run the pixel loop at all.
  let livery = addLayer(createLivery(), "sills");
  livery = updateLayer(livery, livery.layers[0].id, {
    kind: "stripe", position: 0.1, size: 0.08, feather: 0, mirrored: false,
  });
  const sprite = bake(livery);

  const stripeColumns = new Set();
  for (let x = 0; x < MODEL.sw; x += 1) {
    const xf = (x + 0.5) / MODEL.sw;
    if (Math.abs(xf - 0.1) <= 0.04 || Math.abs(xf - 0.9) <= 0.04) stripeColumns.add(x);
  }
  assert(stripeColumns.size > 0, "the fixture placed no stripe at all");

  for (let y = 0; y < MODEL.sh; y += 1) {
    for (let x = 0; x < MODEL.sw; x += 1) {
      if (stripeColumns.has(x)) continue;
      const i = (y * MODEL.sw + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        assertEqual(sprite.data[i + channel], SOURCE[i + channel],
          `the base paint touched ${x},${y} on an unpainted car`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Coverage is the guard rail, and a layer must not get past it
// ---------------------------------------------------------------------------

test("no layer can paint a pixel that is not bodywork, wherever it is put", () => {
  // This is what lets the player drag a layer anywhere without being able to
  // break the car: glass, tyres and the outline are out of reach by construction
  // rather than by the player being careful.
  const unpaintable = unpaintablePixels();
  assert(unpaintable.length > 500, "the fixture found almost no protected pixels");

  // A band and a stripe each stretched over the entire frame.
  let livery = createLivery({ paint: paintOf(120) });
  livery = addLayer(livery, "roof");
  livery = updateLayer(livery, livery.layers[0].id, {
    kind: "band", position: 0.5, size: 1, feather: 0, paint: paintOf(300),
  });
  livery = addLayer(livery, "stripes");
  livery = updateLayer(livery, livery.layers[1].id, {
    kind: "stripe", position: 0.5, size: 1, feather: 0, mirrored: false, paint: paintOf(60),
  });

  const sprite = bake(livery);
  for (const { k } of unpaintable) {
    for (let channel = 0; channel < 4; channel += 1) {
      assertEqual(sprite.data[k * 4 + channel], SOURCE[k * 4 + channel],
        `a layer painted a protected pixel at index ${k}`);
    }
  }
});

test("a layer leaves the tail lights alone even when it covers them", () => {
  // The lamps are their own region and a full-frame band sits right on top of
  // them; a red car with green tail lights reads as a bug even to someone who
  // could not say why.
  let livery = addLayer(createLivery(), "rear");
  livery = updateLayer(livery, livery.layers[0].id, {
    position: 0.5, size: 1, paint: paintOf(120),
  });
  const sprite = bake(livery);

  let checked = 0;
  for (let y = 0; y < MODEL.sh; y += 1) {
    for (let x = 0; x < MODEL.sw; x += 1) {
      const k = y * MODEL.sw + x;
      const i = k * 4;
      if (SOURCE[i + 3] === 0 || COVERAGE[k] > 0) continue;
      if (classifyPixel(SOURCE[i], SOURCE[i + 1], SOURCE[i + 2], y / MODEL.sh) !== REGION_LAMP) continue;
      checked += 1;
      assert(sprite.data[i] >= sprite.data[i + 1], `a lamp at ${x},${y} stopped being red`);
    }
  }
  assert(checked > 100, `only found ${checked} lamp pixels to check`);
});

// ---------------------------------------------------------------------------
// Geometry: which axis each shape runs along
// ---------------------------------------------------------------------------

// Probe points are pinned to an exact row or an exact column, never to the
// nearest bodywork in any direction. A car has large holes in it — the rear
// screen is most of the middle — so a nearest-pixel search silently drifts to a
// different row, and a test that thought it was sampling outside a band ends up
// sampling inside it. That mistake reads as the renderer being wrong.

/** Confident bodywork on the row at `yf`, as close to `xf` across as it gets. */
function bodyPixelInRow(yf, xf = 0.5) {
  const y = Math.round(MODEL.sh * yf);
  const target = MODEL.sw * xf;
  let best = null;
  for (let x = 0; x < MODEL.sw; x += 1) {
    if (COVERAGE[y * MODEL.sw + x] < 1) continue;
    const distance = Math.abs(x - target);
    if (!best || distance < best.distance) best = { x, y, distance };
  }
  assert(best, `no bodywork on the row at ${yf} — the probe point is unusable`);
  return best;
}

/** Confident bodywork in the column at `xf`, as close to `yf` down as it gets. */
function bodyPixelInColumn(xf, yf = 0.5) {
  const x = Math.round(MODEL.sw * xf);
  const target = MODEL.sh * yf;
  let best = null;
  for (let y = 0; y < MODEL.sh; y += 1) {
    if (COVERAGE[y * MODEL.sw + x] < 1) continue;
    const distance = Math.abs(y - target);
    if (!best || distance < best.distance) best = { x, y, distance };
  }
  assert(best, `no bodywork in the column at ${xf} — the probe point is unusable`);
  return best;
}

test("a band runs across the car and a stripe runs down it", () => {
  // A band across the top third: a pixel on a row inside it changes, one on a
  // row outside it does not — whatever column either happens to sit in.
  let banded = addLayer(createLivery(), "roof");
  banded = updateLayer(banded, banded.layers[0].id, {
    kind: "band", position: 0.18, size: 0.2, feather: 0, mirrored: false, paint: paintOf(300),
  });
  const bandSprite = bake(banded);
  assert(changedAt(bandSprite, bodyPixelInRow(0.18, 0.5)), "a band missed the centre of its row");
  assert(changedAt(bandSprite, bodyPixelInRow(0.18, 0.05)), "a band missed the edge of its row");
  assert(!changedAt(bandSprite, bodyPixelInRow(0.72)), "a band reached a row it was not placed on");

  // A stripe down the left flank, judged the same way one axis over.
  let striped = addLayer(createLivery(), "sills");
  striped = updateLayer(striped, striped.layers[0].id, {
    kind: "stripe", position: 0.14, size: 0.1, feather: 0, mirrored: false, paint: paintOf(300),
  });
  const stripeSprite = bake(striped);
  assert(changedAt(stripeSprite, bodyPixelInColumn(0.14, 0.3)), "a stripe missed its column");
  assert(changedAt(stripeSprite, bodyPixelInColumn(0.14, 0.8)), "a stripe did not run the length of the car");
  assert(!changedAt(stripeSprite, bodyPixelInColumn(0.5, 0.3)),
    "a stripe reached a column it was not placed on");
});

function changedAt(sprite, pixel) {
  const [r, g, b] = at(sprite.data, pixel.x, pixel.y);
  const i = (pixel.y * MODEL.sw + pixel.x) * 4;
  return r !== SOURCE[i] || g !== SOURCE[i + 1] || b !== SOURCE[i + 2];
}

test("a curved band bows by the right amount in every column of the bake", () => {
  // The geometry is proved in `paint.test.js`; what this asserts is that the
  // renderer's per-column offset table is wired to the right axis and indexed
  // by the right thing. Resolving a band's curve down the row instead of across
  // it leaves the layer straight and displaced, which looks entirely plausible
  // in a still of a symmetrical car.
  //
  // The probe is a pair of rows per column — where the band sits straight, and
  // where the bow predicts it sits curved — which is hole-proof in a way that
  // measuring the painted region's centre is not: a car is mostly rear screen
  // through the middle, and a mean drifts wherever the glass is.
  const position = 0.62;
  const size = 0.08;
  const curve = 0.2;
  const layered = (bend) => {
    const base = addLayer(createLivery(), "trunk");
    return updateLayer(base, base.layers[0].id, {
      kind: "band", position, size, feather: 0, curve: bend, mirrored: false, paint: paintOf(300),
    });
  };
  const straight = bake(layered(0));
  const bowed = bake(layered(curve), MODEL, createLiveryCache());

  const straightRow = Math.round(MODEL.sh * position);
  let checked = 0;
  const bows = new Set();
  for (let x = 0; x < MODEL.sw; x += 1) {
    const offset = curve * curveBow((x + 0.5) / MODEL.sw);
    // Only where the two positions are far enough apart to tell apart at all.
    if (offset <= size) continue;
    const bowedRow = Math.round(MODEL.sh * (position + offset));
    if (bowedRow >= MODEL.sh) continue;
    if (COVERAGE[straightRow * MODEL.sw + x] < 1 || COVERAGE[bowedRow * MODEL.sw + x] < 1) continue;

    assert(changedAt(straight, { x, y: straightRow }), `column ${x}: the straight band missed its own row`);
    assert(!changedAt(bowed, { x, y: straightRow }), `column ${x}: the curved band did not leave the straight row`);
    assert(changedAt(bowed, { x, y: bowedRow }), `column ${x}: the curved band is not where the bow puts it`);
    assert(!changedAt(straight, { x, y: bowedRow }), `column ${x}: the straight band reached the bowed row`);
    checked += 1;
    bows.add(Math.round(curveBow((x + 0.5) / MODEL.sw) * 10));
  }
  // The sweep has to have actually swept, over a spread of bow amounts — a
  // filter that quietly excluded everything would pass every assertion above.
  assert(checked > 50, `only ${checked} columns were measurable`);
  assert(bows.size >= 4, `every measurable column had the same bow (${[...bows]})`);
});

test("a mirrored stripe lands on both flanks", () => {
  let livery = addLayer(createLivery(), "sills");
  livery = updateLayer(livery, livery.layers[0].id, {
    kind: "stripe", position: 0.14, size: 0.1, feather: 0, mirrored: true, paint: paintOf(300),
  });
  const sprite = bake(livery);
  assert(changedAt(sprite, bodyPixelInColumn(0.14, 0.3)), "the near flank was missed");
  assert(changedAt(sprite, bodyPixelInColumn(0.86, 0.3)), "the mirrored flank was missed");
});

// ---------------------------------------------------------------------------
// The fade, and the axis hoisting that makes it affordable
// ---------------------------------------------------------------------------

test("a fade runs along its own axis and not the other one", () => {
  // The renderer resolves a y-axis fade once per row and an x-axis fade once per
  // column. Resolving down the wrong axis is invisible in a still of a
  // symmetrical car, so it is asserted rather than eyeballed.
  const near = paintOf(0);
  const fade = { enabled: true, hue: 180, saturation: 1, brightness: 1 };

  const downwards = bake(createLivery({ paint: near, fade: { ...fade, axis: "nose-tail" } }));
  const across = bake(createLivery({ paint: near, fade: { ...fade, axis: "left-right" } }));

  const leftPixel = bodyPixelInRow(0.3, 0.2);
  const rightPixel = bodyPixelInRow(0.3, 0.8);

  // Down the car, two pixels on the same row get the same colour treatment...
  assert(hueLeaning(downwards, leftPixel) === hueLeaning(downwards, rightPixel),
    "a nose-to-tail fade varied across a row");
  // ...and across it, they do not.
  assert(hueLeaning(across, leftPixel) !== hueLeaning(across, rightPixel),
    "a left-to-right fade did not vary across a row");
});

/** Whether a painted pixel leans toward the near stop (red) or the far one (cyan). */
function hueLeaning(sprite, pixel) {
  const [r, g, b] = at(sprite.data, pixel.x, pixel.y);
  return r > (g + b) / 2 ? "near" : "far";
}

test("a fade reaches both of its stops", () => {
  const sprite = bake(createLivery({
    paint: paintOf(0),
    fade: { enabled: true, hue: 180, saturation: 1, brightness: 1, axis: "nose-tail" },
  }));
  const nose = bodyPixelInRow(0.04);
  const tail = bodyPixelInRow(0.95);
  assertEqual(hueLeaning(sprite, nose), "near", "the nose did not reach the first stop");
  assertEqual(hueLeaning(sprite, tail), "far", "the tail did not reach the second stop");
});

test("reversing the axis reverses the car", () => {
  const stops = { enabled: true, hue: 180, saturation: 1, brightness: 1 };
  const forward = bake(createLivery({ paint: paintOf(0), fade: { ...stops, axis: "nose-tail" } }));
  const back = bake(createLivery({ paint: paintOf(0), fade: { ...stops, axis: "tail-nose" } }));
  const nose = bodyPixelInRow(0.04);
  assert(hueLeaning(forward, nose) !== hueLeaning(back, nose), "reversing the axis changed nothing");
});

// ---------------------------------------------------------------------------
// Stacking
// ---------------------------------------------------------------------------

test("a later layer paints over an earlier one where they overlap", () => {
  // Order is part of what a livery is, and the only place it becomes visible is
  // here.
  const overlap = (firstHue, secondHue) => {
    let livery = createLivery({ paint: paintOf(0, { saturation: 0 }) });
    for (const hue of [firstHue, secondHue]) {
      livery = addLayer(livery, "roof");
      livery = updateLayer(livery, livery.layers.at(-1).id, {
        kind: "band", position: 0.3, size: 0.4, feather: 0, paint: paintOf(hue),
      });
    }
    return bake(livery);
  };
  const pixel = bodyPixelInRow(0.3);
  const redOverCyan = at(overlap(180, 0).data, pixel.x, pixel.y);
  const cyanOverRed = at(overlap(0, 180).data, pixel.x, pixel.y);

  assert(redOverCyan[0] > redOverCyan[2], "the last layer did not win");
  assert(cyanOverRed[2] > cyanOverRed[0], "the last layer did not win");
});

test("a feathered edge blends rather than stepping", () => {
  const softened = (feather) => {
    let livery = addLayer(createLivery({ paint: paintOf(0, { saturation: 0 }) }), "roof");
    return bake(updateLayer(livery, livery.layers[0].id, {
      kind: "band", position: 0.3, size: 0.3, feather, paint: paintOf(240),
    }));
  };
  const hard = softened(0);
  const soft = softened(0.2);

  // Right on the nominal edge both are half-strength-ish; a little outside it,
  // only the feathered one has any colour at all.
  const outside = bodyPixelInRow(0.48);
  assert(!changedAt(hard, outside), "a hard edge bled past its size");
  assert(changedAt(soft, outside), "a feathered edge did not reach past its size");
});

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

test("the same livery comes back as the same sprite, a different one does not", () => {
  const cache = createLiveryCache();
  const livery = createLivery({ paint: paintOf(120) });
  const first = bake(livery, MODEL, cache);
  assert(bake(createLivery({ paint: paintOf(120) }), MODEL, cache) === first, "an identical livery re-baked");
  assert(bake(createLivery({ paint: paintOf(300) }), MODEL, cache) !== first, "two liveries shared a sprite");
});

test("coverage is cached per model, and one model's mask never reaches another", () => {
  // Coverage depends on the car and not on the colour, so it survives a repaint
  // — but handing the Kaido's mask to the Toro would paint through its glass.
  const cache = createLiveryCache();
  bake(createLivery({ paint: paintOf(120) }), MODEL, cache);
  bake(createLivery({ paint: paintOf(300) }), MODEL, cache);
  assertEqual(cache.coverage.size, 1, "a repaint recomputed the coverage map");

  bake(createLivery({ paint: paintOf(120) }), OTHER, cache);
  assertEqual(cache.coverage.size, 2, "a second model reused the first model's mask");
  assertEqual(cache.coverage.get(MODEL.id).length, MODEL.sw * MODEL.sh);
  assertEqual(cache.coverage.get(OTHER.id).length, OTHER.sw * OTHER.sh);
});

test("the coverage cache is bounded", () => {
  // Each entry is a float per pixel — around 300KB — so holding all 24 models
  // would be most of a spare frame buffer for no benefit.
  const cache = createLiveryCache();
  for (const model of MODELS_A.frames) bake(createLivery({ paint: paintOf(120) }), model, cache);
  assert(cache.coverage.size <= COVERAGE_CACHE_LIMIT,
    `coverage cache grew to ${cache.coverage.size}`);
});

// ---------------------------------------------------------------------------
// Black, end to end
// ---------------------------------------------------------------------------

test("a black car is dark everywhere and still has a lit edge somewhere", () => {
  // The paint tests prove the maths; this proves it survives the bake, which is
  // what the player actually looks at.
  const sprite = bake(createLivery({ paint: { hue: 0, saturation: 0, brightness: 0.16, finish: "gloss" } }));

  let brightest = 0;
  let total = 0;
  let counted = 0;
  for (let y = 0; y < MODEL.sh; y += 1) {
    for (let x = 0; x < MODEL.sw; x += 1) {
      const k = y * MODEL.sw + x;
      if (COVERAGE[k] < 1) continue;
      const lit = luminanceOf(...at(sprite.data, x, y));
      brightest = Math.max(brightest, lit);
      total += lit;
      counted += 1;
    }
  }
  const mean = total / counted;
  assert(mean < 70, `a black car averaged ${Math.round(mean)} — that is grey`);
  assert(brightest > 140, `a black car's brightest pixel was only ${Math.round(brightest)}`);
});

finish();
