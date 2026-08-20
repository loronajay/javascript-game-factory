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

finish();
