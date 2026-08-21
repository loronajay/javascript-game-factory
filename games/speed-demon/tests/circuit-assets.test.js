import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";
import { readPng } from "./png.js";
import { allModels } from "../scripts/assets/car-atlas.js";
import {
  CIRCUIT_DIRECTIONS,
  CIRCUIT_MODELS,
  circuitModelById,
  hasCircuitAtlas,
} from "../scripts/circuit/assets.js";
import {
  circuitDrawBox,
  circuitFrameIndex,
  measureCircuitFrameGeometry,
} from "../scripts/circuit/sprite-geometry.js";

suite("circuit assets — representative canonical atlas set");

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(TEST_DIR, "..");
const CARS_DIR = path.join(GAME_DIR, "assets", "circuit-cars");
const canonicalIds = new Set(allModels().map((model) => model.id));

test("catalog exposes exactly the representative eight canonical models", () => {
  const expected = [
    "kaido-gts",
    "tsunami-rz",
    "meridian-rs",
    "skyward-r",
    "toro-sv",
    "scalpel-r",
    "chrono-12",
    "colt-gt",
  ];
  assertDeepEqual(CIRCUIT_MODELS.map((model) => model.modelId), expected);
  assertEqual(new Set(expected).size, 8);
  for (const id of expected) assert(canonicalIds.has(id), `${id} is not a canonical model id`);
});

test("availability never substitutes another model", () => {
  assert(hasCircuitAtlas("kaido-gts"));
  assert(!hasCircuitAtlas("shutter-z"));
  assertEqual(circuitModelById("shutter-z"), null);
});

test("world headings select the artwork frame whose nose points forward", () => {
  // The generated sheets are stored rear-first: frame 0's nose points south,
  // frame 4's nose points north. The renderer must account for that instead of
  // presenting the cars tail-first while the physics moves them forward.
  assertEqual(circuitFrameIndex(0), 4);
  assertEqual(circuitFrameIndex(Math.PI / 2), 6);
  assertEqual(circuitFrameIndex(Math.PI), 0);
  assertEqual(circuitFrameIndex(-Math.PI / 2), 2);
});

test("every atlas is eight transparent 64px frames clockwise from north", () => {
  const expectedOrder = [
    "north",
    "north-east",
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
  ];
  assertDeepEqual(CIRCUIT_DIRECTIONS, expectedOrder);

  for (const model of CIRCUIT_MODELS) {
    const manifestPath = path.join(CARS_DIR, model.manifest);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const sheet = readPng(fs.readFileSync(path.join(CARS_DIR, model.spritesheet)));

    assertEqual(manifest.modelId, model.modelId);
    assertDeepEqual(manifest.order, expectedOrder);
    assertEqual(manifest.frameWidth, 64);
    assertEqual(manifest.frameHeight, 64);
    assertEqual(manifest.frameCount, 8);
    assertEqual(sheet.width, 512);
    assertEqual(sheet.height, 64);

    for (let frame = 0; frame < 8; frame += 1) {
      let visible = 0;
      for (let y = 0; y < 64; y += 1) {
        for (let x = frame * 64; x < (frame + 1) * 64; x += 1) {
          if (sheet.pixels[(y * sheet.width + x) * 4 + 3] > 8) visible += 1;
        }
      }
      assert(visible > 250, `${model.modelId} frame ${frame} is empty or clipped`);
    }

    assertEqual(sheet.pixels[3], 0, `${model.modelId} top-left must be transparent`);
    assertEqual(
      sheet.pixels[(sheet.width * sheet.height - 1) * 4 + 3],
      0,
      `${model.modelId} bottom-right must be transparent`,
    );
  }
});

test("three-quarter views get a modest lift and direct sides get the stronger measured correction", () => {
  for (const model of CIRCUIT_MODELS) {
    const sheet = readPng(fs.readFileSync(path.join(CARS_DIR, model.spritesheet)));
    const geometry = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
    for (const frame of [0, 4]) {
      assertEqual(geometry[frame].scale, 1, `${model.modelId} front/rear frame ${frame} was resized`);
    }
    for (const frame of [1, 3, 5, 7]) {
      assertEqual(geometry[frame].scale, 1.05, `${model.modelId} frame ${frame} missed the 3/4 lift`);
    }
    for (const frame of [2, 6]) {
      const before = geometry[(frame + 7) % 8].alphaArea;
      const after = geometry[(frame + 1) % 8].alphaArea;
      const targetArea = (before + after) / 2;
      const expectedScale = Math.max(1.1, Math.sqrt(targetArea / geometry[frame].alphaArea));
      assert(geometry[frame].scale > 1.05, `${model.modelId} frame ${frame} needs the stronger lift`);
      assertEqual(Number(geometry[frame].scale.toFixed(6)), Number(expectedScale.toFixed(6)));
    }
  }
});

test("normalized sprites anchor their measured visual centre on the vehicle", () => {
  const geometry = { scale: 0.75, sourceCentreX: 40, sourceCentreY: 24 };
  const box = circuitDrawBox(120, 80, 64, geometry);
  assertDeepEqual(box, {
    x: 90,
    y: 62,
    width: 48,
    height: 48,
  });
  assertEqual(box.x + geometry.sourceCentreX / 64 * box.width, 120);
  assertEqual(box.y + geometry.sourceCentreY / 64 * box.height, 80);
});

finish();
