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

function curbAlignmentScore(track, radius = 5, bounds = {}) {
  const art = readPng(fs.readFileSync(path.join(GAME_DIR, track.src)));
  const { image: maskImage } = maskFor(track);
  const { width, height, pixels } = art;
  const isRoad = (x, y) => maskImage.pixels[(y * width + x) * 4] === 255;
  const isCurbPaint = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const offset = (y * width + x) * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const white = Math.min(red, green, blue) >= 88 && Math.max(red, green, blue) - Math.min(red, green, blue) <= 58;
    const curbRed = red >= 72 && red >= green * 1.35 && red >= blue * 1.15;
    return white || curbRed;
  };

  let aligned = 0;
  let sampled = 0;
  const left = Math.max(1, bounds.x ?? 1);
  const top = Math.max(1, bounds.y ?? 1);
  const right = Math.min(width - 1, left + (bounds.width ?? width - 2));
  const bottom = Math.min(height - 1, top + (bounds.height ?? height - 2));
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (!isRoad(x, y)) continue;
      if (isRoad(x - 1, y) && isRoad(x + 1, y) && isRoad(x, y - 1) && isRoad(x, y + 1)) continue;
      if ((x + y) % 5 !== 0) continue;
      sampled += 1;
      let found = false;
      for (let dy = -radius; dy <= radius && !found; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radius * radius) continue;
          if (isCurbPaint(x + dx, y + dy)) {
            found = true;
            break;
          }
        }
      }
      if (found) aligned += 1;
    }
  }
  return aligned / sampled;
}

function columnEdgeRoughness(track, bounds, edge) {
  const { image } = maskFor(track);
  const values = [];
  for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
    const roadRows = [];
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      if (image.pixels[(y * image.width + x) * 4] === 255) roadRows.push(y);
    }
    if (roadRows.length > 0) values.push(edge === "top" ? roadRows[0] : roadRows.at(-1));
  }
  const deviations = [];
  const radius = 10;
  for (let index = radius; index < values.length - radius; index += 1) {
    const window = values.slice(index - radius, index + radius + 1).sort((a, b) => a - b);
    deviations.push(Math.abs(values[index] - window[Math.floor(window.length / 2)]));
  }
  deviations.sort((a, b) => a - b);
  return deviations[Math.floor(deviations.length * 0.95)];
}

function columnEdgeCurvature(track, bounds, edge) {
  const { image } = maskFor(track);
  const values = [];
  for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
    const roadRows = [];
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
      if (image.pixels[(y * image.width + x) * 4] === 255) roadRows.push(y);
    }
    if (roadRows.length > 0) values.push(edge === "top" ? roadRows[0] : roadRows.at(-1));
  }
  const span = 5;
  const slopes = values.slice(span).map((value, index) => value - values[index]);
  const changes = slopes.slice(span).map((value, index) => Math.abs(value - slopes[index])).sort((a, b) => a - b);
  return changes[Math.floor(changes.length * 0.95)];
}

test("the catalog contains three location-named circuits rather than one named theme", () => {
  assertDeepEqual(CIRCUIT_TRACKS.map((track) => track.id), [
    "old-town-shrine-loop",
    "docklands-freight-loop",
    "downtown-canal-ring",
  ]);
  assertDeepEqual(CIRCUIT_TRACKS.map((track) => track.label), [
    "Old Town Shrine Loop",
    "Docklands Freight Loop",
    "Downtown Canal Ring",
  ]);
  assertEqual(DEFAULT_CIRCUIT_TRACK_ID, "old-town-shrine-loop");
  assertEqual(new Set(CIRCUIT_TRACKS.map((track) => track.id)).size, CIRCUIT_TRACKS.length);
  assert(CIRCUIT_TRACKS.every((track) => !/japan|noir/i.test(`${track.id} ${track.label} ${track.blurb}`)));
  assert(!/japan|noir/i.test(modeById(MODE_CIRCUIT).blurb));
});

test("each track owns its camera zoom and apparent car scale", () => {
  for (const track of CIRCUIT_TRACKS) {
    assert(Number.isFinite(track.presentation?.carScale) && track.presentation.carScale > 0,
      `${track.id} has no positive car scale`);
    assert(Number.isFinite(track.presentation?.camera?.minZoom) && track.presentation.camera.minZoom > 0,
      `${track.id} has no minimum camera zoom`);
    assert(
      Number.isFinite(track.presentation?.camera?.maxZoom)
        && track.presentation.camera.maxZoom >= track.presentation.camera.minZoom,
      `${track.id} has an invalid maximum camera zoom`,
    );
  }

  const oldTown = circuitTrackById("old-town-shrine-loop");
  const downtown = circuitTrackById("downtown-canal-ring");
  assert(downtown.presentation.carScale < oldTown.presentation.carScale,
    "Downtown's thinner road needs a smaller world-space car");
  assert(downtown.presentation.camera.minZoom > oldTown.presentation.camera.minZoom,
    "Downtown's thinner road needs a tighter high-speed camera");
  assert(downtown.presentation.camera.maxZoom > oldTown.presentation.camera.maxZoom,
    "Downtown's thinner road needs a tighter low-speed camera");
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
    { x: 300, y: 455, label: "asphalt beside the upper freight-yard curb" },
    { x: 300, y: 550, label: "lower edge of the freight-yard sweep" },
    { x: 1000, y: 225, label: "inside edge of the harbor hairpin" },
    { x: 1320, y: 500, label: "inside edge of the right-hand climb" },
    { x: 700, y: 590, label: "asphalt beside the upper central-return curb" },
    { x: 720, y: 850, label: "asphalt beside the outside start-straight curb" },
    { x: 782, y: 480, label: "wide side of the upper S-bend" },
    { x: 850, y: 500, label: "central S-bend asphalt" },
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
    { x: 1485, y: 438, label: "dock apron beyond the right-hand climb" },
    { x: 1304, y: 315, label: "paved shoulder beyond the upper-right curb" },
    { x: 1182, y: 209, label: "paved shoulder beyond the top-right crest" },
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
  const averageRoadWidth = roadPixels / lapLength;
  assert(averageRoadWidth >= 105, `Docklands average road width ${averageRoadWidth.toFixed(1)} is implausibly narrow`);
});

test("Docklands collision edge hugs its painted curbs as closely as the Old Town mask", () => {
  const oldTownScore = curbAlignmentScore(circuitTrackById("old-town-shrine-loop"));
  const docklandsScore = curbAlignmentScore(circuitTrackById("docklands-freight-loop"));
  assert(
    docklandsScore >= oldTownScore * 0.95,
    `Docklands curb alignment ${docklandsScore.toFixed(3)} must be at least 95% of Old Town ${oldTownScore.toFixed(3)}`,
  );
});

test("Downtown collision follows the paired canal curbs instead of swallowing its infields", () => {
  const track = circuitTrackById("downtown-canal-ring");
  const { mask } = maskFor(track);
  const paintedRoadAnchors = [
    { x: 845, y: 835, label: "start straight" },
    { x: 1375, y: 500, label: "right-side canal climb" },
    { x: 1240, y: 140, label: "upper-right hairpin" },
    { x: 960, y: 470, label: "central double-apex" },
    { x: 580, y: 340, label: "upper-left return" },
    { x: 240, y: 155, label: "left hairpin" },
    { x: 150, y: 500, label: "left-side canal descent" },
  ];
  for (const point of paintedRoadAnchors) {
    assert(mask.containsPoint(point.x, point.y), `${point.label} is incorrectly blocked`);
  }

  const sceneryAnchors = [
    { x: 960, y: 120, label: "canal above the upper-right hairpin" },
    { x: 700, y: 600, label: "central tower infield" },
    { x: 1150, y: 600, label: "right canal infield" },
    { x: 300, y: 500, label: "left tower infield" },
    { x: 20, y: 500, label: "city beyond the outer left curb" },
    { x: 1260, y: 220, label: "upper-right plaza infield" },
    { x: 980, y: 610, label: "lower central infield" },
    { x: 1050, y: 390, label: "central canal shoulder above the double-apex" },
    { x: 1080, y: 370, label: "central hairpin shoulder outside the curb" },
  ];
  for (const point of sceneryAnchors) {
    assert(!mask.containsPoint(point.x, point.y), `${point.label} is incorrectly driveable`);
  }

  // Downtown's curb blocks carry darker seams and broader wet reflections than
  // the original art, so compare both tracks with the same eight-pixel radius.
  const oldTownScore = curbAlignmentScore(circuitTrackById("old-town-shrine-loop"), 8);
  const downtownScore = curbAlignmentScore(track, 8);
  assert(
    downtownScore >= oldTownScore * 0.95,
    `Downtown curb alignment ${downtownScore.toFixed(3)} must be at least 95% of Old Town ${oldTownScore.toFixed(3)}`,
  );
});

test("Downtown collision stays curb-tight in each reported failure region", () => {
  const track = circuitTrackById("downtown-canal-ring");
  const regions = [
    { x: 1240, y: 210, width: 220, height: 650, label: "right climb and lower return" },
    { x: 70, y: 70, width: 790, height: 390, label: "upper-left hairpin and straight" },
    { x: 70, y: 650, width: 620, height: 230, label: "lower-left inner exit" },
    { x: 650, y: 250, width: 650, height: 340, radius: 3, label: "central double-apex" },
  ];
  for (const region of regions) {
    const score = curbAlignmentScore(track, region.radius ?? 1, region);
    assert(score >= 0.90, `${region.label} curb alignment ${score.toFixed(3)} must be at least 0.900`);
  }
});

test("Downtown upper-right contour stays directly on the finished curb paint", () => {
  const track = circuitTrackById("downtown-canal-ring");
  const regions = [
    { x: 650, y: 280, width: 520, height: 190, label: "central bend upper edge" },
    { x: 650, y: 430, width: 520, height: 130, label: "central bend lower edge" },
    { x: 900, y: 60, width: 570, height: 320, label: "right hairpin" },
    { x: 1250, y: 200, width: 230, height: 360, label: "right chute" },
  ];
  const scores = regions.map((region) => ({
    label: region.label,
    score: curbAlignmentScore(track, 3, region),
  }));
  const centralBounds = { x: 650, y: 280, width: 520, height: 280 };
  const roughness = {
    upper: columnEdgeRoughness(track, centralBounds, "top"),
    lower: columnEdgeRoughness(track, centralBounds, "bottom"),
  };
  const curvature = {
    upper: columnEdgeCurvature(track, centralBounds, "top"),
    lower: columnEdgeCurvature(track, centralBounds, "bottom"),
  };
  assert(
    scores.every(({ score }) => score >= 0.93)
      && roughness.upper <= 1
      && roughness.lower <= 1
      && curvature.upper <= 3
      && curvature.lower <= 3,
    `${scores.map(({ label, score }) => `${label} ${score.toFixed(3)}`).join(", ")}; central roughness upper ${roughness.upper}, lower ${roughness.lower}; curvature upper ${curvature.upper}, lower ${curvature.lower}`,
  );
});

test("the track viewer exercises the real catalog, vehicle step and collision resolver", () => {
  const html = fs.readFileSync(path.join(GAME_DIR, "tools", "circuit-track-viewer.html"), "utf8");
  const source = fs.readFileSync(path.join(GAME_DIR, "tools", "circuit-track-viewer.js"), "utf8");
  assert(html.includes("Circuit Track Viewer"));
  assert(source.includes('../scripts/circuit/tracks.js'));
  assert(source.includes('../scripts/circuit/vehicle.js'));
  assert(source.includes('../scripts/circuit/collision.js'));
  assert(source.includes("resolveTrackCollision"));
  assert(source.includes("buildMaskEdge"));
  assert(source.includes("maskEdgeCanvas"));
  assert(source.includes("measureCircuitFrameGeometry"));
  assert(source.includes("circuitDrawBox"));
  assert(!source.includes("ctx.drawImage(maskImage"), "viewer must draw the mask boundary, not wash over the whole road");
});

test("all location ids resolve through the shared catalog", () => {
  assertEqual(circuitTrackById("old-town-shrine-loop")?.label, "Old Town Shrine Loop");
  assertEqual(circuitTrackById("docklands-freight-loop")?.label, "Docklands Freight Loop");
  assertEqual(circuitTrackById("downtown-canal-ring")?.label, "Downtown Canal Ring");
  assertEqual(circuitTrackById("japan-noir"), null);
});

finish();
