import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";
import { readPng } from "./png.js";
import { createRoadMask, maskPixelsFromRgba } from "../scripts/circuit/road-mask.js";
import {
  CIRCUIT_TRACKS,
  DEFAULT_CIRCUIT_TRACK_ID,
  circuitTrackById,
} from "../scripts/circuit/tracks.js";
import { modeById, MODE_CIRCUIT } from "../scripts/sim/modes.js";
import { eventById } from "../scripts/campaign/events.js";

suite("circuit tracks — campaign geography and collision-authored catalog");

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(TEST_DIR, "..");

function maskFor(track) {
  const image = readPng(fs.readFileSync(path.join(GAME_DIR, track.roadMask)));
  return {
    image,
    mask: createRoadMask({
      width: image.width,
      height: image.height,
      pixels: maskPixelsFromRgba(image.pixels),
    }),
  };
}

test("the catalog contains two location-named circuits rather than one named theme", () => {
  assertDeepEqual(CIRCUIT_TRACKS.map((track) => track.id), [
    "old-town-shrine-loop",
    "docklands-freight-loop",
  ]);
  assertDeepEqual(CIRCUIT_TRACKS.map((track) => track.label), [
    "Old Town Shrine Loop",
    "Docklands Freight Loop",
  ]);
  assertEqual(DEFAULT_CIRCUIT_TRACK_ID, "old-town-shrine-loop");
  assertEqual(new Set(CIRCUIT_TRACKS.map((track) => track.id)).size, CIRCUIT_TRACKS.length);
  assert(CIRCUIT_TRACKS.every((track) => !/japan|noir/i.test(`${track.id} ${track.label} ${track.blurb}`)));
  assert(!/japan|noir/i.test(modeById(MODE_CIRCUIT).blurb));
});

test("TOLL BOOTH names the Old Town circuit and its actual shrine-road setting", () => {
  const event = eventById("ch1-toll-booth");
  assertEqual(event.trackId, "old-town-shrine-loop");
  assertEqual(event.where, "Old Town — shrine road");
});

test("every circuit ships a world-sized binary mask matching its art", () => {
  for (const track of CIRCUIT_TRACKS) {
    const art = readPng(fs.readFileSync(path.join(GAME_DIR, track.src)));
    const { image } = maskFor(track);
    assertEqual(art.width, track.world.width, `${track.id} art width`);
    assertEqual(art.height, track.world.height, `${track.id} art height`);
    assertEqual(image.width, track.world.width, `${track.id} mask width`);
    assertEqual(image.height, track.world.height, `${track.id} mask height`);
    for (let index = 0; index < image.pixels.length; index += 4) {
      const value = image.pixels[index];
      assert(value === 0 || value === 255, `${track.id} mask has a gray edge at pixel ${index / 4}`);
      assertEqual(image.pixels[index + 1], value, `${track.id} mask is not grayscale`);
      assertEqual(image.pixels[index + 2], value, `${track.id} mask is not grayscale`);
      assertEqual(image.pixels[index + 3], 255, `${track.id} mask is translucent`);
    }
  }
});

test("every spawn, checkpoint and racing-line pose fits fully inside its own mask", () => {
  for (const track of CIRCUIT_TRACKS) {
    const { mask } = maskFor(track);
    for (const [index, spawn] of track.spawns.entries()) {
      assert(mask.containsVehicle(spawn), `${track.id} spawn ${index} crosses the collision edge`);
    }
    for (const [index, checkpoint] of track.checkpoints.entries()) {
      assert(mask.containsPoint(checkpoint.x, checkpoint.y), `${track.id} checkpoint ${index} is off road`);
    }
    for (const [index, point] of track.racingLine.entries()) {
      const next = track.racingLine[(index + 1) % track.racingLine.length];
      const angle = Math.atan2(next.x - point.x, -(next.y - point.y));
      assert(mask.containsVehicle({ ...point, angle }), `${track.id} racing-line pose ${index} clips the mask`);
    }
  }
});

test("Docklands collision reaches the visibly painted asphalt instead of a narrow centre ribbon", () => {
  const track = circuitTrackById("docklands-freight-loop");
  const { image, mask } = maskFor(track);
  const paintedRoadAnchors = [
    { x: 720, y: 770, label: "inside edge of the start straight" },
    { x: 300, y: 440, label: "upper edge of the freight-yard sweep" },
    { x: 300, y: 550, label: "lower edge of the freight-yard sweep" },
    { x: 1000, y: 225, label: "inside edge of the harbor hairpin" },
    { x: 1320, y: 500, label: "inside edge of the right-hand climb" },
    { x: 700, y: 575, label: "upper edge of the central return" },
    { x: 720, y: 905, label: "outside edge of the start straight" },
    { x: 782, y: 480, label: "wide side of the upper S-bend" },
    { x: 768, y: 490, label: "wide side of the central S-bend" },
    { x: 1485, y: 438, label: "outside edge of the right-hand climb" },
  ];
  for (const point of paintedRoadAnchors) {
    assert(mask.containsPoint(point.x, point.y), `${point.label} is incorrectly blocked`);
  }
  const sceneryAnchors = [
    { x: 720, y: 940, label: "water below the start straight" },
    { x: 1100, y: 500, label: "right-side freight infield" },
    { x: 500, y: 350, label: "upper freight yard" },
    { x: 1100, y: 600, label: "lower freight infield" },
    { x: 100, y: 200, label: "harbor crane apron" },
    { x: 912, y: 405, label: "narrow-side S-bend infield" },
    { x: 933, y: 533, label: "central crane infield" },
  ];
  for (const point of sceneryAnchors) {
    assert(!mask.containsPoint(point.x, point.y), `${point.label} is incorrectly driveable`);
  }

  let roadPixels = 0;
  for (let index = 0; index < image.pixels.length; index += 4) {
    if (image.pixels[index] === 255) roadPixels += 1;
  }
  let lapLength = 0;
  for (let index = 0; index < track.racingLine.length; index += 1) {
    const point = track.racingLine[index];
    const next = track.racingLine[(index + 1) % track.racingLine.length];
    lapLength += Math.hypot(next.x - point.x, next.y - point.y);
  }
  assert(roadPixels / lapLength >= 132, "Docklands usable width must be comparable to the original circuit");
});

test("the track viewer exercises the real catalog, vehicle step and collision resolver", () => {
  const html = fs.readFileSync(path.join(GAME_DIR, "tools", "circuit-track-viewer.html"), "utf8");
  const source = fs.readFileSync(path.join(GAME_DIR, "tools", "circuit-track-viewer.js"), "utf8");
  assert(html.includes("Circuit Track Viewer"));
  assert(source.includes('from "../scripts/circuit/tracks.js"'));
  assert(source.includes('from "../scripts/circuit/vehicle.js"'));
  assert(source.includes('from "../scripts/circuit/collision.js"'));
  assert(source.includes("resolveTrackCollision"));
  assert(source.includes("buildMaskEdge"));
  assert(source.includes("maskEdgeCanvas"));
  assert(!source.includes("ctx.drawImage(maskImage"), "viewer must draw the mask boundary, not wash over the whole road");
});

test("both location ids resolve through the shared catalog", () => {
  assertEqual(circuitTrackById("old-town-shrine-loop")?.label, "Old Town Shrine Loop");
  assertEqual(circuitTrackById("docklands-freight-loop")?.label, "Docklands Freight Loop");
  assertEqual(circuitTrackById("japan-noir"), null);
});

finish();
