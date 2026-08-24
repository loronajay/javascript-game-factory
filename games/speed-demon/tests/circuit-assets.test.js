import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";
import { readPng } from "./png.js";
import { allModels } from "../scripts/assets/car-atlas.js";
import {
  CIRCUIT_DIRECTIONS,
  CIRCUIT_FRAME_SIZE,
  CIRCUIT_FRAME_HEADINGS,
  CIRCUIT_MODELS,
  circuitModelById,
  hasCircuitAtlas,
} from "../scripts/circuit/assets.js";
import {
  circuitDrawBox,
  circuitFrameIndex,
  localCarCoordinates,
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

test("the JSON catalog and runtime share one heading and scale contract", () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(CARS_DIR, "catalog.json"), "utf8"));
  assertEqual(catalog.render.headingConvention, "physical-nose-clockwise-from-north");
  assertDeepEqual(catalog.render.order, CIRCUIT_DIRECTIONS);
  for (const model of CIRCUIT_MODELS) {
    const entry = catalog.models.find((candidate) => candidate.modelId === model.modelId);
    assert(entry, `${model.modelId} is missing from the JSON catalog`);
    assertEqual(entry.renderScale, model.renderScale, `${model.modelId} has two render scales`);
  }
});

test("runtime atlas URLs carry the heading revision so repaired PNGs cannot stay cached", () => {
  for (const model of CIRCUIT_MODELS) {
    assert(
      model.src.endsWith("?v=circuit-headings-20260824-2"),
      `${model.modelId} can reuse a stale pre-repair atlas from browser cache`,
    );
  }
});

test("world headings select the artwork frame whose nose points forward", () => {
  // Physics and every atlas use the same clockwise-from-north nose headings.
  // Cover all eight views so an east/west workaround cannot invert the other
  // six directions without this regression test catching it.
  for (let frame = 0; frame < CIRCUIT_DIRECTIONS.length; frame += 1) {
    assertEqual(circuitFrameIndex(frame * Math.PI / 4), frame, CIRCUIT_DIRECTIONS[frame]);
  }
  assertDeepEqual(CIRCUIT_FRAME_HEADINGS, CIRCUIT_DIRECTIONS);
});

test("atlas pixels use the same nose direction as their declared frame", () => {
  const noseSamples = [
    [0, 31.5, 0],
    [2, 63, 31.5],
    [4, 31.5, 63],
    [6, 0, 31.5],
  ];
  for (const [frame, x, y] of noseSamples) {
    assertClose(
      localCarCoordinates(frame, x, y).v,
      0.5 / CIRCUIT_FRAME_SIZE,
      1e-9,
      `frame ${frame} reversed its nose and tail`,
    );
  }
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
    assertEqual(
      manifest.headingConvention,
      "physical-nose-clockwise-from-north",
      `${model.modelId} can regress to camera-side frame labels`,
    );
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

test("each atlas records whether its generated source labels describe the camera side or the nose", () => {
  for (const model of CIRCUIT_MODELS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, model.manifest), "utf8"));
    assertEqual(
      manifest.source.headingConvention,
      "camera-side-opposite-physical-nose",
      `${model.modelId} source convention is undocumented, so a blanket repair can reverse it`,
    );
  }
});

test("every canonical manifest pins the source column selected for its east slot", () => {
  const eastSourceX = new Map([
    ["kaido-gts", 1629],
    ["tsunami-rz", 1482],
    ["meridian-rs", 1617],
    ["skyward-r", 1656],
    ["toro-sv", 1629],
    ["scalpel-r", 1651],
    ["chrono-12", 1627],
    ["colt-gt", 1559],
  ]);
  for (const model of CIRCUIT_MODELS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, model.manifest), "utf8"));
    assertEqual(manifest.frames[2].direction, "east");
    assertEqual(
      manifest.frames[2].sourceBounds.x,
      eastSourceX.get(model.modelId),
      `${model.modelId} east was replaced by its west-facing source view`,
    );
  }
});

test("Meridian and Skyward replace every duplicated opposite view from a valid heading", () => {
  const expectedRepairs = [
    { targetFrame: 1, mirroredFromFrame: 5, transform: "rotate-180" },
    { targetFrame: 2, mirroredFromFrame: 6, transform: "mirror-x" },
    { targetFrame: 3, mirroredFromFrame: 7, transform: "rotate-180" },
    { targetFrame: 4, mirroredFromFrame: 0, transform: "mirror-y" },
  ];
  for (const modelId of ["meridian-rs", "skyward-r"]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, modelId, "spritesheet.json"), "utf8"));
    const sheet = readPng(fs.readFileSync(path.join(
      CARS_DIR,
      modelId,
      "spritesheet-clockwise-from-north.png",
    )));
    assertEqual(
      manifest.repairFrameConvention,
      "physical-nose-clockwise-from-north",
      `${modelId} repair indices can be remapped during a future source normalization`,
    );
    assertDeepEqual(
      (manifest.repairs ?? []).map(({ targetFrame, mirroredFromFrame, transform }) => (
        { targetFrame, mirroredFromFrame, transform }
      )),
      expectedRepairs,
      `${modelId} does not declare all four duplicated source views`,
    );
    for (const repair of expectedRepairs) {
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const sourceX = repair.transform === "mirror-x" || repair.transform === "rotate-180"
            ? 63 - x
            : x;
          const sourceY = repair.transform === "mirror-y" || repair.transform === "rotate-180"
            ? 63 - y
            : y;
          const targetPixel = (y * sheet.width + repair.targetFrame * 64 + x) * 4;
          const sourcePixel = (sourceY * sheet.width + repair.mirroredFromFrame * 64 + sourceX) * 4;
          assertEqual(
            sheet.pixels[targetPixel + 3],
            sheet.pixels[sourcePixel + 3],
            `${modelId} frame ${repair.targetFrame} alpha repair drifted at ${x},${y}`,
          );
          if (sheet.pixels[sourcePixel + 3] <= 8) continue;
          for (let channel = 0; channel < 3; channel += 1) {
            assertClose(
              sheet.pixels[targetPixel + channel],
              sheet.pixels[sourcePixel + channel],
              2,
              `${modelId} frame ${repair.targetFrame} repair drifted at ${x},${y},${channel}`,
            );
          }
        }
      }
    }
  }
});

test("asset repair metadata uses the canonical physical heading of each frame", () => {
  for (const model of CIRCUIT_MODELS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, model.manifest), "utf8"));
    for (const repair of manifest.repairs ?? []) {
      assertEqual(
        repair.targetHeading,
        manifest.frames[repair.targetFrame]?.direction,
        `${model.modelId} repair target frame is mislabeled`,
      );
      assertEqual(
        repair.mirroredFromHeading,
        manifest.frames[repair.mirroredFromFrame]?.direction,
        `${model.modelId} repair source frame is mislabeled`,
      );
    }
  }
});

test("all eight views normalize to one apparent car size", () => {
  for (const model of CIRCUIT_MODELS) {
    const sheet = readPng(fs.readFileSync(path.join(CARS_DIR, model.spritesheet)));
    const geometry = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
    assertEqual(geometry[0].scale, 1, `${model.modelId} authored front was resized`);
    const targetArea = geometry[0].alphaArea;
    for (const [frameIndex, frame] of geometry.entries()) {
      assertClose(
        frame.alphaArea * frame.scale ** 2,
        targetArea,
        targetArea * 0.01,
        `${model.modelId} frame ${frameIndex} changes apparent size`,
      );
    }
  }
});

test("every model is normalized to the same apparent race size", () => {
  const normalizedAreas = [];
  for (const model of CIRCUIT_MODELS) {
    assert(Number.isFinite(model.renderScale) && model.renderScale > 0,
      `${model.modelId} has no model-to-model render scale`);
    const sheet = readPng(fs.readFileSync(path.join(CARS_DIR, model.spritesheet)));
    const geometry = measureCircuitFrameGeometry(sheet.pixels, sheet.width, sheet.height);
    const meanArea = geometry.reduce(
      (sum, frame) => sum + frame.alphaArea * frame.scale ** 2,
      0,
    ) / geometry.length;
    normalizedAreas.push({ modelId: model.modelId, area: meanArea * model.renderScale ** 2 });
  }

  const target = normalizedAreas.reduce((sum, entry) => sum + entry.area, 0)
    / normalizedAreas.length;
  for (const entry of normalizedAreas) {
    assertClose(entry.area, target, target * 0.01,
      `${entry.modelId} still renders at a different apparent size`);
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

test("track presentation scale resizes around the measured vehicle centre", () => {
  const geometry = { scale: 0.75, sourceCentreX: 40, sourceCentreY: 24 };
  const box = circuitDrawBox(120, 80, 64, geometry, 0.8);
  assertClose(box.x, 96, 1e-9);
  assertClose(box.y, 65.6, 1e-9);
  assertClose(box.width, 38.4, 1e-9);
  assertClose(box.height, 38.4, 1e-9);
  assertClose(box.x + geometry.sourceCentreX / 64 * box.width, 120, 1e-9);
  assertClose(box.y + geometry.sourceCentreY / 64 * box.height, 80, 1e-9);
});

test("Tsunami East is the opposite side of the same car, not a generated substitute", () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(CARS_DIR, "tsunami-rz", "spritesheet.json"),
    "utf8",
  ));
  const sheet = readPng(fs.readFileSync(path.join(
    CARS_DIR,
    "tsunami-rz",
    "spritesheet-clockwise-from-north.png",
  )));
  assertEqual(manifest.repairs?.[0]?.targetFrame, 2);
  assertEqual(manifest.repairs?.[0]?.targetHeading, "east");
  assertEqual(manifest.repairs?.[0]?.mirroredFromFrame, 6);
  assertEqual(manifest.repairs?.[0]?.mirroredFromHeading, "west");
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        const west = (y * sheet.width + 6 * 64 + x) * 4 + channel;
        const east = (y * sheet.width + 2 * 64 + (63 - x)) * 4 + channel;
        assertEqual(sheet.pixels[east], sheet.pixels[west], `Tsunami side mismatch at ${x},${y},${channel}`);
      }
    }
  }
});

finish();
