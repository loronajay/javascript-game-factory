import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";
import { readPng } from "./png.js";
import { createLivery, addLayer, updateLayer } from "../scripts/garage/livery.js";
import { classifyPixel, REGION_BODY, REGION_CABIN, REGION_LAMP } from "../scripts/garage/paint.js";
import { circuitPreviewFrame } from "../scripts/ui/garage-editor.js";
import {
  localCarCoordinates,
  measureCircuitFrameGeometry,
} from "../scripts/circuit/sprite-geometry.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let lastImage = null;
globalThis.document = {
  createElement() {
    const canvas = { width: 0, height: 0, data: null, getContext: () => context };
    const context = {
      drawImage(image) { lastImage = image; },
      getImageData(x, y, width, height) {
        const data = new Uint8ClampedArray(lastImage.slice(0, width * height * 4));
        canvas.data = data;
        return { data, width, height };
      },
      putImageData(imageData) { canvas.data = imageData.data; },
    };
    return canvas;
  },
};

const {
  CIRCUIT_LIVERY_CACHE_LIMIT,
  createCircuitLiveryCache,
  circuitLiveryAtlas,
  measureCircuitBodyGeometry,
} = await import("../scripts/circuit/livery-atlas.js");
const {
  KAIDO_STRIPE_PANEL_GUIDES,
  TSUNAMI_STRIPE_PANEL_GUIDES,
  circuitStripePanelGuides,
  circuitStripeCoordinates,
} = await import("../scripts/circuit/stripe-projection.js");

suite("circuit livery — one canonical paint across eight headings");

const sheet = readPng(readFileSync(join(
  root,
  "assets/circuit-cars/kaido-gts/spritesheet-clockwise-from-north.png",
)));
const image = Object.assign(sheet.pixels, {
  width: sheet.width,
  height: sheet.height,
  complete: true,
  naturalWidth: sheet.width,
});

// Distilled from the user's Kaido export. Each neighbouring pair is two rough,
// parallel direction samples over one visible panel. They are not literal
// stripe positions; endpoints are enough to lock the local angle without
// turning the hand-drawn marks into final artwork.
const KAIDO_GUIDED_PATHS = {
  1: [
    [[11.27, 44.3], [20.64, 34.47]], [[14.93, 46.13], [23.16, 36.07]],
    [[29.33, 21.56], [37.1, 14.47]], [[34.47, 23.84], [42.81, 15.96]],
    [[10.7, 45.44], [10.24, 52.76]], [[14.36, 47.61], [13.67, 54.59]],
    [[43.5, 16.41], [45.33, 15.04]], [[46.24, 18.24], [48.19, 15.61]],
  ],
  2: [
    [[19.5, 26.7], [7.04, 30.36]], [[20.07, 28.99], [7.04, 33.21]],
    [[31.61, 22.13], [44.3, 22.24]], [[31.39, 24.87], [41.67, 24.64]],
    [[51.96, 26.47], [54.13, 27.16]], [[51.73, 28.41], [53.9, 29.33]],
  ],
  3: [
    [[27.96, 19.04], [37.79, 24.07]], [[32.07, 16.99], [40.53, 21.67]],
    [[47.16, 34.93], [50.36, 37.9]], [[49.56, 32.87], [51.61, 34.81]],
    [[49.9, 37.79], [49.9, 44.99]], [[52.76, 35.73], [53.1, 42.59]],
    [[21.44, 18.01], [14.59, 16.3]], [[18.24, 20.87], [11.27, 18.24]],
  ],
  5: [
    [[23.16, 20.99], [31.84, 14.47]], [[27.27, 23.04], [34.24, 16.99]],
    [[42.59, 16.99], [47.73, 14.47]], [[43.96, 19.16], [50.81, 16.07]],
    [[14.24, 33.33], [12.19, 35.39]], [[17.33, 34.59], [14.7, 36.87]],
    [[12.53, 36.99], [11.96, 43.04]], [[14.93, 39.16], [14.47, 43.96]],
  ],
  6: [
    [[18.36, 21.44], [30.13, 21.21]], [[18.01, 24.07], [29.56, 24.19]],
    [[41.79, 26.24], [56.3, 29.79]], [[41.79, 29.21], [55.73, 32.41]],
    [[55.96, 32.41], [57.9, 35.27]], [[56.53, 30.59], [58.59, 33.33]],
    [[11.04, 26.81], [9.56, 26.81]], [[11.73, 28.99], [9.9, 28.99]],
  ],
  7: [
    [[20.64, 16.87], [27.04, 22.93]], [[27.5, 14.93], [32.99, 20.41]],
    [[36.99, 37.56], [43.39, 46.59]], [[42.24, 34.93], [49.56, 44.87]],
    [[46.93, 48.53], [46.59, 55.39]], [[50.36, 46.93], [51.16, 54.13]],
    [[17.56, 17.33], [16.3, 16.19]], [[15.73, 18.01], [13.9, 17.1]],
  ],
};

function complexLivery() {
  let livery = createLivery({
    paint: { hue: 212, saturation: 0.86, brightness: 0.82, finish: "metallic" },
    fade: { enabled: true, hue: 14, saturation: 0.92, brightness: 1, axis: "nose-tail" },
    windowTint: 0.72,
    tailLightHue: 180,
    underglow: { enabled: true, hue: 286, intensity: 0.8 },
  });
  livery = addLayer(livery, "rear");
  livery = updateLayer(livery, livery.layers[0].id, {
    feather: 0.08,
    curve: 0.09,
    paint: { hue: 118, saturation: 0.9, brightness: 0.92, finish: "gloss" },
  });
  livery = addLayer(livery, "stripes");
  return updateLayer(livery, livery.layers[1].id, {
    mirrored: true,
    curve: -0.08,
    paint: { hue: 320, saturation: 0.88, brightness: 0.9, finish: "matte" },
  });
}

test("each generated view maps the same authored UV to the same car-local point", () => {
  const silhouette = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
  const geometry = measureCircuitBodyGeometry(sheet.pixels, sheet.width, sheet.height, silhouette);
  const expected = { u: 0.27, v: 0.18 };
  for (let frame = 0; frame < 8; frame += 1) {
    const measured = geometry[frame];
    const angle = ((frame + 4) % 8) * Math.PI / 4;
    const lateral = measured.lateralMin
      + expected.u * (measured.lateralMax - measured.lateralMin);
    const longitudinal = measured.longitudinalMax
      - expected.v * (measured.longitudinalMax - measured.longitudinalMin);
    const x = 31.5 + longitudinal * Math.sin(angle) + lateral * Math.cos(angle);
    const y = 31.5 - longitudinal * Math.cos(angle) + lateral * Math.sin(angle);
    const point = localCarCoordinates(frame, x, y, 64, measured);
    assertClose(point.u, expected.u, 1e-9, `frame ${frame} drifted across the body`);
    assertClose(point.v, expected.v, 1e-9, `frame ${frame} drifted nose-to-tail`);
  }
});

test("paint projection is calibrated to bodywork, not wheels, wings or shadows", () => {
  const silhouette = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
  const body = measureCircuitBodyGeometry(sheet.pixels, sheet.width, sheet.height, silhouette);
  let tightenedViews = 0;
  for (let frame = 0; frame < 8; frame += 1) {
    const fullLong = silhouette[frame].longitudinalMax - silhouette[frame].longitudinalMin;
    const fullWide = silhouette[frame].lateralMax - silhouette[frame].lateralMin;
    const bodyLong = body[frame].longitudinalMax - body[frame].longitudinalMin;
    const bodyWide = body[frame].lateralMax - body[frame].lateralMin;
    assert(bodyLong <= fullLong, `frame ${frame} body projection exceeds its silhouette length`);
    assert(bodyWide <= fullWide, `frame ${frame} body projection exceeds its silhouette width`);
    if (bodyLong < fullLong - 1 || bodyWide < fullWide - 1) tightenedViews += 1;
  }
  assert(tightenedViews >= 6, "body projection did not reject exterior sprite features");
});

test("a complex livery paints body, glass and lamps in every generated view", () => {
  const silhouette = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
  const geometry = measureCircuitBodyGeometry(sheet.pixels, sheet.width, sheet.height, silhouette);
  const atlas = circuitLiveryAtlas(createCircuitLiveryCache(), {
    image,
    modelId: "kaido-gts",
    livery: complexLivery(),
  });
  assert(atlas, "the loaded atlas should bake");

  for (let frame = 0; frame < 8; frame += 1) {
    const changed = { [REGION_BODY]: 0, [REGION_CABIN]: 0, [REGION_LAMP]: 0 };
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * sheet.width + frame * 64 + x) * 4;
        if (sheet.pixels[index + 3] === 0) continue;
        const local = localCarCoordinates(frame, x, y, 64, geometry[frame]);
        const region = classifyPixel(
          sheet.pixels[index],
          sheet.pixels[index + 1],
          sheet.pixels[index + 2],
          local.v,
        );
        const differs = atlas.data[index] !== sheet.pixels[index]
          || atlas.data[index + 1] !== sheet.pixels[index + 1]
          || atlas.data[index + 2] !== sheet.pixels[index + 2];
        if (differs && Object.hasOwn(changed, region)) changed[region] += 1;
      }
    }
    assert(changed[REGION_BODY] > 100, `frame ${frame} did not paint its body`);
    assert(changed[REGION_CABIN] > 5, `frame ${frame} did not tint its glass`);
    assert(changed[REGION_LAMP] > 0, `frame ${frame} did not recolour its lamps`);
  }
});

test("cache identity is modelId:liveryKey and excludes world-space underglow", () => {
  const cache = createCircuitLiveryCache();
  const livery = complexLivery();
  const first = circuitLiveryAtlas(cache, { image, modelId: "kaido-gts", livery });
  const glowOnly = { ...livery, underglow: { enabled: true, hue: 30, intensity: 0.2 } };
  const second = circuitLiveryAtlas(cache, { image, modelId: "kaido-gts", livery: glowOnly });
  assert(first === second, "underglow split the directional sprite cache");
  assertEqual(cache.atlases.size, 1);
  assert(CIRCUIT_LIVERY_CACHE_LIMIT > 0);
});

test("editor turntable visits all eight headings without changing the livery", () => {
  const livery = complexLivery();
  const before = JSON.stringify(livery);
  const frames = new Set();
  for (let tick = 0; tick < 8 * 24; tick += 24) frames.add(circuitPreviewFrame(tick));
  assertEqual(frames.size, 8);
  assertEqual(JSON.stringify(livery), before);
});

test("Kaido stripe projection has authored panels in six views and preserves North and South", () => {
  const expectedPanelCounts = [0, 4, 3, 4, 0, 4, 4, 4];
  assertEqual(KAIDO_STRIPE_PANEL_GUIDES.length, 8);
  for (let frame = 0; frame < 8; frame += 1) {
    assertEqual(KAIDO_STRIPE_PANEL_GUIDES[frame].length, expectedPanelCounts[frame], `frame ${frame}`);
  }

  const local = { u: 0.31, v: 0.73 };
  const geometry = {
    lateralMin: -10,
    lateralMax: 10,
    longitudinalMin: -20,
    longitudinalMax: 20,
  };
  assertEqual(circuitStripeCoordinates("kaido-gts", 0, local, geometry), local);
  assertEqual(circuitStripeCoordinates("kaido-gts", 4, local, geometry), local);
  assertEqual(circuitStripeCoordinates("tsunami-rz", 6, local, geometry), local);
});

test("Tsunami uses its authored panels and mirrors the valid West guide over repaired East", () => {
  const expectedPanelCounts = [0, 3, 3, 4, 0, 4, 3, 3];
  assertEqual(circuitStripePanelGuides("tsunami-rz"), TSUNAMI_STRIPE_PANEL_GUIDES);
  for (let frame = 0; frame < 8; frame += 1) {
    assertEqual(TSUNAMI_STRIPE_PANEL_GUIDES[frame].length, expectedPanelCounts[frame], `frame ${frame}`);
  }
  for (let panel = 0; panel < TSUNAMI_STRIPE_PANEL_GUIDES[2].length; panel += 1) {
    const west = TSUNAMI_STRIPE_PANEL_GUIDES[2][panel];
    const east = TSUNAMI_STRIPE_PANEL_GUIDES[6][panel];
    for (const line of ["a", "b"]) {
      for (let endpoint = 0; endpoint < 2; endpoint += 1) {
        assertClose(east[line][endpoint][0], 63 - west[line][endpoint][0], 1e-9);
        assertClose(east[line][endpoint][1], west[line][endpoint][1], 1e-9);
      }
    }
  }
});

test("Kaido follows every authored panel angle and uses each pair only as a rough centreline", () => {
  const silhouette = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
  const geometry = measureCircuitBodyGeometry(sheet.pixels, sheet.width, sheet.height, silhouette);

  for (const [frameText, paths] of Object.entries(KAIDO_GUIDED_PATHS)) {
    const frame = Number(frameText);
    for (let pair = 0; pair < paths.length; pair += 2) {
      const samples = paths.slice(pair, pair + 2);
      for (let sample = 0; sample < samples.length; sample += 1) {
        const projected = samples[sample].map(([x, y]) => {
          const local = localCarCoordinates(frame, x, y, 64, geometry[frame]);
          return circuitStripeCoordinates("kaido-gts", frame, local, geometry[frame], { x, y });
        });
        assertClose(projected[0].u, projected[1].u, 0.035,
          `frame ${frame} panel ${pair / 2} sample ${sample} missed its authored angle`);
      }

      const all = samples.flat();
      const centre = {
        x: all.reduce((sum, [x]) => sum + x, 0) / all.length,
        y: all.reduce((sum, [, y]) => sum + y, 0) / all.length,
      };
      const nominal = localCarCoordinates(frame, centre.x, centre.y, 64, geometry[frame]);
      const projectedCentre = circuitStripeCoordinates(
        "kaido-gts",
        frame,
        nominal,
        geometry[frame],
        centre,
      );
      assertClose(projectedCentre.u, 0.5, 1e-9,
        `frame ${frame} panel ${pair / 2} did not keep the stripe pair on its rough centreline`);
    }
  }
});

test("the Kaido viewer shows all eight corrected frames through the real circuit baker", () => {
  const html = readFileSync(join(root, "tools/circuit-livery-viewer.html"), "utf8");
  const source = readFileSync(join(root, "tools/circuit-livery-viewer.js"), "utf8");
  assert(html.includes("Circuit Stripe Viewer"));
  assert(html.includes('id="modelSelect"'));
  assert(html.includes('id="directionGrid"'));
  assert(source.includes('from "../scripts/circuit/livery-atlas.js"'));
  assert(source.includes("circuitLiveryAtlas"));
  assert(source.includes("CIRCUIT_FRAME_HEADINGS"));
  assert(source.includes("CIRCUIT_MODELS"));
  assert(!source.includes("const MODEL_ID"));
});

finish();
