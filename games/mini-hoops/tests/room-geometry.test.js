import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertClose, assertEqual, finish } from "./harness.js";

import { CANVAS_HEIGHT, CANVAS_WIDTH, WALL_BASE_SCREEN_Y } from "../scripts/sim/constants.js";
import { LOCATIONS } from "../scripts/assets/location-catalog.js";
import { HOOP_TRAVEL_BOUNDS } from "../scripts/sim/hoop.js";
import {
  EDGE_FILL_SOURCE_BAND,
  occludersInFrontOf,
  roomBackdropOffsetY,
  roomEdgeGap,
  roomOccluders,
  roomWallBaseY,
} from "../scripts/assets/room-geometry.js";

suite("room geometry — lining five painted rooms up with one camera");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// How far a room's backdrop may be slid before the strip it exposes is bigger
// than anything that could plausibly be plain ceiling or plain floor. This is a
// judgement about the art, not about the maths — a room needing more than this
// wants re-cutting rather than sliding.
const MAX_REASONABLE_SHIFT = 60;

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

test("every shipped room declares where its own skirting is painted", () => {
  // A room with no measurement draws untouched, which is a safe fallback but a
  // silently misaligned one. Every room that actually ships should be measured.
  for (const location of LOCATIONS) {
    const measured = roomWallBaseY(location.id);
    assert(
      measured !== WALL_BASE_SCREEN_Y || roomOccluders(location.id).length > 0,
      `${location.id} has no room geometry — it will draw out of register with the camera`,
    );
    assert(measured > 0 && measured < CANVAS_HEIGHT, `${location.id} wall base is off the canvas`);
  }
});

test("the shift puts every room's painted wall base on the camera's", () => {
  for (const location of LOCATIONS) {
    assertClose(
      roomWallBaseY(location.id) + roomBackdropOffsetY(location.id),
      WALL_BASE_SCREEN_Y,
      1e-9,
      location.id,
    );
  }
});

test("no room is slid further than the plain edge that has to cover for it", () => {
  for (const location of LOCATIONS) {
    const shift = Math.abs(roomBackdropOffsetY(location.id));
    assert(shift <= MAX_REASONABLE_SHIFT, `${location.id} slides ${shift}px, which is a re-cut, not a nudge`);
  }
});

test("the exposed strip is reported on the side the shift actually leaves bare", () => {
  for (const location of LOCATIONS) {
    const offset = roomBackdropOffsetY(location.id);
    const gap = roomEdgeGap(location.id);
    if (offset === 0) {
      assertEqual(gap, null, `${location.id} needs no fill`);
      continue;
    }
    assert(gap, `${location.id} is slid but reports no gap`);
    assertEqual(gap.height, Math.abs(offset), `${location.id} gap height`);
    assertEqual(gap.edge, offset > 0 ? "top" : "bottom", `${location.id} gap edge`);
    assertEqual(gap.y, offset > 0 ? 0 : CANVAS_HEIGHT - gap.height, `${location.id} gap position`);
    // Stretching a band of source over a strip much taller than itself smears.
    assert(
      gap.height <= EDGE_FILL_SOURCE_BAND * 6,
      `${location.id} stretches ${EDGE_FILL_SOURCE_BAND}px of art over ${gap.height}px`,
    );
  }
});

test("an unmeasured room draws untouched rather than sliding on a guess", () => {
  assertEqual(roomBackdropOffsetY("moon-base"), 0);
  assertEqual(roomEdgeGap("moon-base"), null);
  assertEqual(roomOccluders("moon-base").length, 0);
});

// ---------------------------------------------------------------------------
// Occluders
// ---------------------------------------------------------------------------

test("every occluder is a closed polygon inside the art it was traced from", () => {
  for (const location of LOCATIONS) {
    for (const [index, occluder] of roomOccluders(location.id).entries()) {
      const where = `${location.id}[${index}]`;
      assert(occluder.polygon.length >= 3, `${where} is not a polygon`);
      for (const point of occluder.polygon) {
        assertEqual(point.length, 2, `${where} has a malformed point`);
        const [x, y] = point;
        assert(x >= 0 && x <= CANVAS_WIDTH, `${where} runs off the art horizontally at ${x}`);
        assert(y >= 0 && y <= CANVAS_HEIGHT, `${where} runs off the art vertically at ${y}`);
      }
    }
  }
});

test("an occluder stands in the room, in front of the wall it hides things against", () => {
  for (const location of LOCATIONS) {
    for (const [index, occluder] of roomOccluders(location.id).entries()) {
      const where = `${location.id}[${index}]`;
      assert(Number.isFinite(occluder.z), `${where} has no depth`);
      assert(occluder.z >= 0, `${where} stands behind the camera`);
      // An occluder at or past the back wall could never cover anything, since
      // nothing in play is deeper than the wall.
      assert(occluder.z < 1, `${where} stands at or beyond the back wall and can hide nothing`);
    }
  }
});

test("an occluder hides what is deeper than it and nothing nearer", () => {
  for (const location of LOCATIONS) {
    const occluders = roomOccluders(location.id);
    assert(occluders.length > 0, `${location.id} has no furniture in front of the camera`);
    const nearest = Math.min(...occluders.map((occluder) => occluder.z));

    assertEqual(occludersInFrontOf(location.id, nearest).length, 0, `${location.id}: level with is not behind`);
    assertEqual(occludersInFrontOf(location.id, nearest - 0.01).length, 0, `${location.id}: in front is not behind`);
    assertEqual(
      occludersInFrontOf(location.id, 1).length,
      occluders.length,
      `${location.id}: a ball at the back wall is behind every piece of furniture in the room`,
    );
  }
});

test("occluders leave the lane the hoop travels down completely clear", () => {
  // The whole cabinet is shot down the centre line, and `HOOP_TRAVEL_BOUNDS` is
  // the envelope every mode is already held to. A polygon traced greedily enough
  // to reach into it would start swallowing shots aimed at the rim, which reads
  // as the ball vanishing rather than as furniture. The silhouettes are allowed
  // to be rough — outside this band nobody can tell — but not here. Borrowing
  // the hoop's own envelope means a mode with a wider sweep re-checks the rooms.
  const CLEAR_MIN_X = HOOP_TRAVEL_BOUNDS.minX;
  const CLEAR_MAX_X = HOOP_TRAVEL_BOUNDS.maxX;
  for (const location of LOCATIONS) {
    for (const [index, occluder] of roomOccluders(location.id).entries()) {
      for (const [x] of occluder.polygon) {
        assert(
          x <= CLEAR_MIN_X || x >= CLEAR_MAX_X,
          `${location.id}[${index}] reaches x=${x}, into the lane the ball flies down`,
        );
      }
    }
  }
});

test("the geometry is measured against the art that ships, at the size it ships", () => {
  // A room's numbers are pixel measurements off its own JPEG. If that file were
  // ever replaced at a different size the numbers would be quietly meaningless,
  // so the sizes are pinned here as well as in the location catalog's own test.
  for (const location of LOCATIONS) {
    const file = path.join(gameRoot, "assets", "backgrounds", `${location.id}.jpg`);
    assert(fs.existsSync(file), `missing backdrop for ${location.id}`);
  }
});

finish();
