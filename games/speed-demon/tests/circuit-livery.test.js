import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";
import { readPng } from "./png.js";
import { createLivery, addLayer, updateLayer } from "../scripts/garage/livery.js";
import { classifyPixel, REGION_BODY, REGION_CABIN, REGION_LAMP } from "../scripts/garage/paint.js";
import { circuitPreviewFrame } from "../scripts/ui/garage-editor.js";

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
  localCarCoordinates,
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

test("local coordinates rotate with the frame at every cardinal heading", () => {
  const north = localCarCoordinates(0, 48, 32);
  const east = localCarCoordinates(2, 32, 48);
  const south = localCarCoordinates(4, 16, 32);
  const west = localCarCoordinates(6, 32, 16);
  for (const point of [north, east, south, west]) {
    // Pixel centres cannot land on the exact same sub-pixel after a 90-degree
    // turn on an even-sized frame; one pixel is the tight meaningful bound.
    assertClose(point.u, north.u, 1 / 64);
    assertClose(point.v, north.v, 1 / 64);
  }
});

test("a complex livery paints body, glass and lamps at north, east, south and west", () => {
  const atlas = circuitLiveryAtlas(createCircuitLiveryCache(), {
    image,
    modelId: "kaido-gts",
    livery: complexLivery(),
  });
  assert(atlas, "the loaded atlas should bake");

  for (const frame of [0, 2, 4, 6]) {
    const changed = { [REGION_BODY]: 0, [REGION_CABIN]: 0, [REGION_LAMP]: 0 };
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * sheet.width + frame * 64 + x) * 4;
        if (sheet.pixels[index + 3] === 0) continue;
        const local = localCarCoordinates(frame, x, y);
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
