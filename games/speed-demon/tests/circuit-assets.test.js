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

test("catalog exposes only canonical models with a verified eight-heading atlas", () => {
  const expected = allModels().map((model) => model.id);
  assertDeepEqual(CIRCUIT_MODELS.map((model) => model.modelId), expected);
  assertEqual(new Set(expected).size, 24);
  for (const id of expected) assert(canonicalIds.has(id), `${id} is not a canonical model id`);
});

test("previously quarantined models have complete replacement turntables", () => {
  for (const modelId of ["meridian-rs", "skyward-r"]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, modelId, "spritesheet.json"), "utf8"));
    assertEqual(manifest.circuitStatus, "ready");
    assertEqual(manifest.invalidHeadings?.length ?? 0, 0);
    assert(hasCircuitAtlas(modelId));
  }
});

test("availability never substitutes another model", () => {
  assert(hasCircuitAtlas("kaido-gts"));
  assert(!hasCircuitAtlas("not-a-car"));
  assertEqual(circuitModelById("not-a-car"), null);
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
      model.src.endsWith("?v=circuit-full-roster-20260910-1"),
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
          const offset = (y * sheet.width + x) * 4;
          const [r, g, b, a] = sheet.pixels.subarray(offset, offset + 4);
          assert(!(a > 8 && r > 130 && b > 100 && g < Math.min(r, b) * 0.65),
            `${model.modelId} frame ${frame} contains residual magenta key`);
        }
      }
      assert(visible > 250, `${model.modelId} frame ${frame} is empty or clipped`);
      assert(visible < 3000, `${model.modelId} frame ${frame} has an opaque background`);
      for (let edge = 0; edge < 64; edge += 1) {
        for (const [x, y] of [[edge, 0], [edge, 63], [0, edge], [63, edge]]) {
          assertEqual(sheet.pixels[(y * sheet.width + frame * 64 + x) * 4 + 3], 0,
            `${model.modelId} frame ${frame} has background pixels or clipped bodywork on its border`);
        }
      }
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
    assert(
      ["camera-side-opposite-physical-nose", "physical-nose-clockwise-from-north"].includes(manifest.source.headingConvention),
      `${model.modelId} source convention is undocumented, so a blanket repair can reverse it`,
    );
  }
});

test("every canonical manifest pins the authoritative source column for its lateral repair", () => {
  const westSourceX = new Map([
    ["kaido-gts", 537],
    ["tsunami-rz", 525],
    ["toro-sv", 546],
    ["scalpel-r", 531],
    ["chrono-12", 513],
    ["colt-gt", 524],
  ]);
  for (const model of CIRCUIT_MODELS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, model.manifest), "utf8"));
    assertEqual(manifest.frames[6].direction, "west");
    if (manifest.source.provider !== "OpenAI ImageGen" || manifest.physicalNoseAudit) continue;
    assertEqual(
      manifest.frames[6].sourceBounds.x,
      westSourceX.get(model.modelId),
      `${model.modelId} lost the source view used to repair its lateral continuity`,
    );
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

test("every lateral heading is the mirrored opposite view of the same car", () => {
  const lateralPairs = [
    { targetFrame: 1, targetHeading: "north-east", sourceFrame: 7, sourceHeading: "north-west" },
    { targetFrame: 2, targetHeading: "east", sourceFrame: 6, sourceHeading: "west" },
    { targetFrame: 3, targetHeading: "south-east", sourceFrame: 5, sourceHeading: "south-west" },
  ];

  for (const model of CIRCUIT_MODELS) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARS_DIR, model.manifest), "utf8"));
    const sheet = readPng(fs.readFileSync(path.join(CARS_DIR, model.spritesheet)));

    for (const pair of lateralPairs) {
      const repair = (manifest.repairs ?? []).find((entry) => entry.targetFrame === pair.targetFrame);
      assert(repair, `${model.modelId} ${pair.targetHeading} has no continuity repair record`);
      assertEqual(repair.targetHeading, pair.targetHeading);
      assertEqual(repair.mirroredFromFrame, pair.sourceFrame);
      assertEqual(repair.mirroredFromHeading, pair.sourceHeading);
      assertEqual(repair.transform, "mirror-x");

      for (let y = 0; y < CIRCUIT_FRAME_SIZE; y += 1) {
        for (let x = 0; x < CIRCUIT_FRAME_SIZE; x += 1) {
          for (let channel = 0; channel < 4; channel += 1) {
            const targetPixel = (
              y * sheet.width + pair.targetFrame * CIRCUIT_FRAME_SIZE + x
            ) * 4 + channel;
            const sourcePixel = (
              y * sheet.width
              + pair.sourceFrame * CIRCUIT_FRAME_SIZE
              + (CIRCUIT_FRAME_SIZE - 1 - x)
            ) * 4 + channel;
            assertEqual(
              sheet.pixels[targetPixel],
              sheet.pixels[sourcePixel],
              `${model.modelId} ${pair.targetHeading} changes body at ${x},${y},${channel}`,
            );
          }
        }
      }
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
  const eastRepair = manifest.repairs?.find((repair) => repair.targetFrame === 2);
  assertEqual(eastRepair?.targetHeading, "east");
  assertEqual(eastRepair?.mirroredFromFrame, 6);
  assertEqual(eastRepair?.mirroredFromHeading, "west");
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
