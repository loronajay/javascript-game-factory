import {
  suite,
  test,
  assert,
  assertEqual,
  assertDeepEqual,
  assertThrows,
  finish,
} from "./harness.js";

import { LAYER_PRESETS } from "../scripts/garage/livery.js";
import { CIRCUIT_DIRECTIONS } from "../scripts/circuit/assets.js";
import {
  CIRCUIT_MASK_ATLAS_SLOTS,
  CIRCUIT_MASK_FRAME_COUNT,
  CIRCUIT_MASK_FRAME_HEIGHT,
  CIRCUIT_MASK_FRAME_WIDTH,
  CIRCUIT_MASK_HEADINGS,
  CIRCUIT_MASK_KIND,
  CIRCUIT_MASK_LAYER_TARGETS,
  CIRCUIT_MASK_SCHEMA_VERSION,
  CIRCUIT_MASK_SURFACES,
  addGuidePath,
  createCircuitMaskData,
  decodeCircuitMaskProject,
  encodeCircuitMaskProject,
  floodMaskRegion,
  guidePathCount,
  maskCompletion,
  maskedPixelCount,
  migrateLegacyCircuitMaskProject,
  paintMaskStroke,
} from "../tools/circuit-mask-core.js";

suite("circuit mask editor — canonical customization truth for every view");

test("display headings name the direction the car nose actually faces", () => {
  assertDeepEqual(CIRCUIT_MASK_ATLAS_SLOTS, CIRCUIT_DIRECTIONS);
  assertDeepEqual(CIRCUIT_MASK_HEADINGS, CIRCUIT_DIRECTIONS);
  assertEqual(CIRCUIT_MASK_HEADINGS[2], "east", "the east-facing car was mislabeled west");
  assertEqual(CIRCUIT_MASK_HEADINGS[6], "west", "the west-facing car was mislabeled east");
});

test("surface routing contains only customization categories the renderer owns", () => {
  assertDeepEqual(CIRCUIT_MASK_SURFACES.map(({ id, key }) => ({ id, key })), [
    { id: 0, key: "unassigned" },
    { id: 1, key: "body" },
    { id: 2, key: "windows" },
    { id: 3, key: "tail-lights" },
    { id: 4, key: "excluded" },
  ]);
  assertEqual(CIRCUIT_MASK_SURFACES.find((surface) => surface.key === "windows").color, "#2787ff");
  assertEqual(CIRCUIT_MASK_SURFACES.find((surface) => surface.key === "tail-lights").color, "#ff354d");
});

test("guide masks are sourced from the canonical editor rather than a second catalog", () => {
  assertDeepEqual(
    CIRCUIT_MASK_LAYER_TARGETS.map(({ id, label, kind }) => ({ id, label, kind })),
    LAYER_PRESETS.map(({ id, label, kind }) => ({ id, label, kind })),
  );
});

test("a new project has independent overlapping masks for all eight views", () => {
  const data = createCircuitMaskData();
  const pixels = 8 * 64 * 64;
  assertEqual(data.surfaces.length, pixels);
  assertEqual(Object.keys(data.layers).length, LAYER_PRESETS.length);
  assert(Object.values(data.layers).every((mask) => mask.length === pixels));
  data.layers.roof[123] = 1;
  data.layers.stripes[123] = 1;
  assertEqual(data.layers.roof[123], 1);
  assertEqual(data.layers.stripes[123], 1, "overlapping canonical guides overwrote each other");
  assertEqual(CIRCUIT_MASK_FRAME_COUNT, 8);
  assertEqual(CIRCUIT_MASK_FRAME_WIDTH, 64);
  assertEqual(CIRCUIT_MASK_FRAME_HEIGHT, 64);
  assertEqual(data.guides.stripes.length, 8);
  assertEqual(data.guides.bands.length, 8);
  assert(data.guides.stripes.every((paths) => paths.length === 0));
});

test("a stripe-flow guide preserves the authored direction and curve", () => {
  const data = createCircuitMaskData();
  addGuidePath(data, "stripes", 6, [
    { x: 10, y: 31 },
    { x: 24, y: 28 },
    { x: 42, y: 27 },
    { x: 58, y: 31 },
  ]);
  assertEqual(guidePathCount(data, "stripes"), 1);
  assertEqual(guidePathCount(data, "stripes", 6), 1);
  assertDeepEqual(data.guides.stripes[6][0], [
    { x: 10, y: 31 },
    { x: 24, y: 28 },
    { x: 42, y: 27 },
    { x: 58, y: 31 },
  ]);
  assertEqual(data.guides.stripes[6][0][0].x, 10, "the guide direction was reversed");
  assertEqual(data.guides.stripes[6][0].at(-1).x, 58, "the arrow end moved");
});

test("JSON export round-trips routing and overlapping canonical layer guides", () => {
  const data = createCircuitMaskData();
  data.surfaces[0] = 1;
  data.surfaces[4095] = 2;
  data.surfaces[4096] = 3;
  data.layers.roof[87] = 1;
  data.layers.stripes[87] = 1;
  data.layers.spine[data.layers.spine.length - 1] = 1;
  addGuidePath(data, "stripes", 0, [{ x: 30, y: 58 }, { x: 31, y: 6 }]);
  addGuidePath(data, "bands", 2, [{ x: 5, y: 30 }, { x: 58, y: 32 }]);

  const project = encodeCircuitMaskProject("kaido-gts", data);
  assertEqual(project.kind, CIRCUIT_MASK_KIND);
  assertEqual(project.schemaVersion, CIRCUIT_MASK_SCHEMA_VERSION);
  assertEqual(project.surfaceFrames[0].heading, "north");
  assertEqual(project.surfaceFrames[7].heading, "north-west");
  assertEqual(project.layerGuides.length, LAYER_PRESETS.length);

  const decoded = decodeCircuitMaskProject(JSON.stringify(project), "kaido-gts");
  assertDeepEqual(Array.from(decoded.data.surfaces), Array.from(data.surfaces));
  for (const preset of LAYER_PRESETS) {
    assertDeepEqual(Array.from(decoded.data.layers[preset.id]), Array.from(data.layers[preset.id]));
  }
  assertDeepEqual(decoded.data.guides, data.guides);
  assertThrows(() => decodeCircuitMaskProject(project, "toro-sv"));
});

test("the transitional schema-2 atlas field names remain readable", () => {
  const data = createCircuitMaskData();
  data.surfaces[20] = 2;
  data.layers.stripes[20] = 1;
  const project = encodeCircuitMaskProject("kaido-gts", data);
  project.atlasSlots = project.legacyAtlasSlots;
  delete project.legacyAtlasSlots;
  for (const frame of project.surfaceFrames) {
    frame.atlasSlot = frame.legacyAtlasSlot;
    delete frame.legacyAtlasSlot;
  }
  for (const guide of project.layerGuides) {
    for (const frame of guide.frames) {
      frame.atlasSlot = frame.legacyAtlasSlot;
      delete frame.legacyAtlasSlot;
    }
  }

  const decoded = decodeCircuitMaskProject(project, "kaido-gts");
  assertEqual(decoded.data.surfaces[20], 2);
  assertEqual(decoded.data.layers.stripes[20], 1);
});

test("schema-2 projects exported with the old reversed display labels remain readable", () => {
  const data = createCircuitMaskData();
  data.surfaces[42] = 3;
  data.layers.roof[42] = 1;
  const project = encodeCircuitMaskProject("kaido-gts", data);
  const reversed = [
    "south", "south-west", "west", "north-west",
    "north", "north-east", "east", "south-east",
  ];
  project.headings = [...reversed];
  const relabel = (frames) => frames.forEach((frame, index) => {
    frame.heading = reversed[index];
  });
  relabel(project.surfaceFrames);
  project.layerGuides.forEach((guide) => relabel(guide.frames));
  relabel(project.directionGuides.stripes);
  relabel(project.directionGuides.bands);

  const decoded = decodeCircuitMaskProject(project, "kaido-gts");
  const canonicalNorthPixel = 4 * 64 * 64 + 42;
  assertEqual(decoded.data.surfaces[canonicalNorthPixel], 3);
  assertEqual(decoded.data.layers.roof[canonicalNorthPixel], 1);
  assertEqual(decoded.data.surfaces[42], 0, "legacy South pixels remained mislabeled North");
});

test("legacy physical-part masks migrate without destroying the saved work", () => {
  const empty = [[4096, 0]];
  const first = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8], [1, 9], [1, 10], [1, 11], [1, 12], [1, 13], [4083, 0]];
  const legacy = {
    kind: CIRCUIT_MASK_KIND,
    schemaVersion: 1,
    modelId: "kaido-gts",
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    order: [...CIRCUIT_MASK_ATLAS_SLOTS],
    encoding: "rle-v1",
    frames: CIRCUIT_MASK_ATLAS_SLOTS.map((direction, index) => ({ direction, runs: index ? empty : first })),
  };

  const migrated = migrateLegacyCircuitMaskProject(legacy, "kaido-gts");
  assertDeepEqual(Array.from(migrated.data.surfaces.slice(0, 13)), [
    1, 1, 1, 1, 1, 2, 1, 1, 4, 3, 4, 4, 4,
  ]);
  assertEqual(migrated.data.layers.roof[3], 1);
  assertEqual(migrated.data.layers.nose[2], 1);
  assertEqual(migrated.data.layers.nose[6], 1);
  assertEqual(migrated.data.layers.trunk[4], 1);
  assertEqual(migrated.data.layers.rear[7], 1);
});

test("painting follows a continuous stroke but never writes locked pixels", () => {
  const mask = createCircuitMaskData().surfaces;
  const paintable = new Uint8Array(mask.length).fill(1);
  const locked = 2 * 64 + 4;
  paintable[locked] = 0;

  paintMaskStroke(mask, 0, { x: 1, y: 2 }, { x: 7, y: 2 }, 4, 0, paintable);
  for (let x = 1; x <= 7; x += 1) {
    const value = mask[2 * 64 + x];
    assertEqual(value, x === 4 ? 0 : 4, `unexpected label at ${x},2`);
  }
});

test("flood fill is frame-local and respects the sprite silhouette", () => {
  const mask = createCircuitMaskData().layers.roof;
  const paintable = new Uint8Array(mask.length);
  for (let y = 10; y <= 12; y += 1) {
    for (let x = 20; x <= 22; x += 1) paintable[y * 64 + x] = 1;
  }
  paintable[11 * 64 + 21] = 0;

  const changed = floodMaskRegion(mask, 0, 20, 10, 1, paintable);
  assertEqual(changed, 8);
  assertEqual(mask[11 * 64 + 21], 0);
  assertEqual(mask[4096 + 10 * 64 + 20], 0, "fill leaked into the next direction");
});

test("routing completion and guide pixel counts have honest, different meanings", () => {
  const data = createCircuitMaskData();
  const paintable = new Uint8Array(data.surfaces.length);
  paintable[0] = 1;
  paintable[1] = 1;
  paintable[4096] = 1;
  data.surfaces[0] = 1;
  data.surfaces[4096] = 2;
  data.layers.roof[0] = 1;
  data.layers.roof[1] = 1;

  const completion = maskCompletion(data.surfaces, paintable);
  assertEqual(completion.frames[0].assigned, 1);
  assertEqual(completion.frames[0].total, 2);
  assertEqual(completion.frames[1].percent, 100);
  assertEqual(completion.percent, 67);
  assertEqual(maskedPixelCount(data.layers.roof), 2);
});

finish();
