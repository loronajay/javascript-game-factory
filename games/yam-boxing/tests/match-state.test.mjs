import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  directionForViewer,
  movePlayer,
  projectWorldPoint,
  yawToward,
} from "../src/core/match-state.mjs";

test("directionForViewer selects every Maddie angle from world position", () => {
  assert.equal(directionForViewer({ x: 0, z: 4 }, { x: 0, z: 0 }), "front");
  assert.equal(directionForViewer({ x: 4, z: 4 }, { x: 0, z: 0 }), "front-right");
  assert.equal(directionForViewer({ x: 4, z: 0 }, { x: 0, z: 0 }), "right");
  assert.equal(directionForViewer({ x: 4, z: -4 }, { x: 0, z: 0 }), "rear-right");
  assert.equal(directionForViewer({ x: 0, z: -4 }, { x: 0, z: 0 }), "rear");
  assert.equal(directionForViewer({ x: -4, z: -4 }, { x: 0, z: 0 }), "rear-left");
  assert.equal(directionForViewer({ x: -4, z: 0 }, { x: 0, z: 0 }), "left");
  assert.equal(directionForViewer({ x: -4, z: 4 }, { x: 0, z: 0 }), "front-left");
});

test("directionForViewer accounts for a fighter's fixed world yaw", () => {
  assert.equal(
    directionForViewer({ x: 4, z: 0 }, { x: 0, z: 0, yaw: 90 }),
    "front",
  );
});

test("projectWorldPoint centers a point ahead and hides a point behind", () => {
  const camera = { x: 0, z: 4, yaw: 180, height: 1.65 };
  const viewport = { width: 1280, height: 720, horizon: 286, focal: 560 };
  const centered = projectWorldPoint({ x: 0, z: 0, height: 1 }, camera, viewport);

  assert.ok(centered);
  assert.equal(Math.round(centered.x), 640);
  assert.ok(centered.depth > 0);
  assert.equal(projectWorldPoint({ x: 0, z: 6, height: 1 }, camera, viewport), null);
});

test("movePlayer uses camera-relative movement and clamps to the ring", () => {
  const moved = movePlayer(
    { x: 0, z: 4, yaw: 180 },
    { forward: 1, strafe: 0, turn: 0 },
    1,
    { halfSize: 4.5, margin: 0.35, moveSpeed: 2, turnSpeed: 90 },
  );
  assert.ok(moved.z < 4);

  const clamped = movePlayer(
    { x: 4.1, z: 0, yaw: 90 },
    { forward: 1, strafe: 0, turn: 0 },
    2,
    { halfSize: 4.5, margin: 0.35, moveSpeed: 2, turnSpeed: 90 },
  );
  assert.equal(clamped.x, 4.15);
});

test("yawToward returns the camera yaw that faces a world point", () => {
  assert.equal(Math.round(yawToward({ x: 0, z: 4 }, { x: 0, z: 0 })), 180);
  assert.equal(Math.round(yawToward({ x: -4, z: 0 }, { x: 0, z: 0 })), 90);
});

test("the match stylesheet cannot override an element's hidden state", () => {
  const css = readFileSync(new URL("../styles/match.css", import.meta.url), "utf8");
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/i);
});
