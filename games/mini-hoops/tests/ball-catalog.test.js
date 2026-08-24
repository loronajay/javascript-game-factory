import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  BALLS,
  BALL_FRAME_SIZE,
  DEFAULT_BALL,
  ballById,
  ballFrameIndex,
  ballFramePaths,
  ballIds,
  rollPhasePerRadian,
} from "../scripts/assets/ball-catalog.js";

suite("ball catalog — many balls, each with its own frame count");

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Catalog integrity
// ---------------------------------------------------------------------------

test("every ball is uniquely identified and carries the copy the picker needs", () => {
  const ids = BALLS.map((ball) => ball.id);
  assertEqual(new Set(ids).size, ids.length, "an id is what a saved preference stores");
  for (const ball of BALLS) {
    assert(ball.label, `${ball.id} has no label`);
    assert(ball.blurb, `${ball.id} has no blurb`);
    assert(Number.isInteger(ball.frameCount) && ball.frameCount > 0, `${ball.id} has a bad frame count`);
  }
});

test("the default ball exists in the catalog", () => {
  assert(ballIds().includes(DEFAULT_BALL));
  assertEqual(ballById(DEFAULT_BALL).id, DEFAULT_BALL);
});

test("an unknown ball id falls back to the default instead of throwing", () => {
  assertEqual(ballById("beach-ball").id, DEFAULT_BALL);
  assertEqual(ballById(undefined).id, DEFAULT_BALL);
  assertEqual(ballById(null).id, DEFAULT_BALL);
});

test("balls genuinely differ in frame count, which is the case this catalog exists for", () => {
  const counts = new Set(BALLS.map((ball) => ball.frameCount));
  assert(counts.size > 1, "if every ball had the same count a constant would do");
});

// ---------------------------------------------------------------------------
// Frame paths — these are what the preloader fetches
// ---------------------------------------------------------------------------

test("frame paths are zero-padded, in order, and one per declared frame", () => {
  for (const ball of BALLS) {
    const paths = ballFramePaths(ball.id);
    assertEqual(paths.length, ball.frameCount, `${ball.id} path count`);
    assertEqual(paths[0], `assets/balls/${ball.id}/roll-00.png`);
    assertEqual(paths[ball.frameCount - 1], `assets/balls/${ball.id}/roll-${String(ball.frameCount - 1).padStart(2, "0")}.png`);
  }
});

test("every declared frame actually exists on disk", () => {
  // A missing frame is otherwise a silent hole in the roll that only shows up in
  // a browser, at the exact rotation that reveals it.
  for (const ball of BALLS) {
    for (const relative of ballFramePaths(ball.id)) {
      assert(fs.existsSync(path.join(gameRoot, relative)), `missing ${relative}`);
    }
  }
});

test("no stray frames sit in a ball folder beyond the declared count", () => {
  // The opposite failure: art was added but the catalog was not updated, so the
  // extra frames never draw and the roll quietly skips.
  for (const ball of BALLS) {
    const dir = path.join(gameRoot, "assets", "balls", ball.id);
    const onDisk = fs.readdirSync(dir).filter((name) => /^roll-\d+\.png$/.test(name));
    assertEqual(onDisk.length, ball.frameCount, `${ball.id} has ${onDisk.length} frames on disk`);
  }
});

test("every ball folder on disk is declared in the catalog", () => {
  // Art for a new ball can land in the tree long before anyone adds the catalog
  // row, and until they do the ball simply does not exist in the game — silently,
  // with every other test still green. This is the check that notices.
  const onDisk = fs
    .readdirSync(path.join(gameRoot, "assets", "balls"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const undeclared = onDisk.filter((name) => !ballIds().includes(name));
  assertEqual(undeclared.join(", "), "", "ball art present but never registered");
});

test("every frame is the standard size, so no ball is secretly a megabyte", () => {
  for (const ball of BALLS) {
    for (const relative of ballFramePaths(ball.id)) {
      const buffer = fs.readFileSync(path.join(gameRoot, relative));
      // PNG IHDR: width at byte 16, height at byte 20.
      assertEqual(buffer.readUInt32BE(16), BALL_FRAME_SIZE, `${relative} width`);
      assertEqual(buffer.readUInt32BE(20), BALL_FRAME_SIZE, `${relative} height`);
    }
  }
});

// ---------------------------------------------------------------------------
// Roll phase -> frame
// ---------------------------------------------------------------------------

test("frame index walks the sequence and wraps at the ball's own count", () => {
  for (const ball of BALLS) {
    assertEqual(ballFrameIndex(ball.id, 0), 0);
    assertEqual(ballFrameIndex(ball.id, ball.frameCount - 1), ball.frameCount - 1);
    assertEqual(ballFrameIndex(ball.id, ball.frameCount), 0, `${ball.id} wraps at its own count`);
    assertEqual(ballFrameIndex(ball.id, ball.frameCount * 3 + 2), 2);
  }
});

test("a ball rolling backward gets a valid frame, never a negative index", () => {
  for (const ball of BALLS) {
    for (const phase of [-0.5, -1, -7, -ball.frameCount, -ball.frameCount * 2 - 3]) {
      const index = ballFrameIndex(ball.id, phase);
      assert(index >= 0 && index < ball.frameCount, `${ball.id} at ${phase} gave ${index}`);
    }
  }
});

test("a fractional phase holds the frame it is inside", () => {
  assertEqual(ballFrameIndex(DEFAULT_BALL, 2.0), 2);
  assertEqual(ballFrameIndex(DEFAULT_BALL, 2.99), 2);
});

test("a non-finite phase degrades to the first frame instead of crashing the draw", () => {
  assertEqual(ballFrameIndex(DEFAULT_BALL, NaN), 0);
  assertEqual(ballFrameIndex(DEFAULT_BALL, Infinity), 0);
});

test("one full rotation advances exactly one full frame cycle, per ball", () => {
  for (const ball of BALLS) {
    const phase = rollPhasePerRadian(ball.id) * Math.PI * 2;
    assertClose(phase, ball.frameCount, 1e-9, `${ball.id} must consume its whole sequence in one turn`);
  }
});

finish();
