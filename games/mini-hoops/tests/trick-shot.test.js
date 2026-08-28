import { suite, test, assert, assertClose, assertEqual, finish } from "./harness.js";

import {
  BOARD_PIECE,
  CANNON_PIECE,
  boardFrame,
  cannonDirection,
  createSandboxPiece,
  normalizeTrickShot,
} from "../scripts/sim/trick-shot.js";
import {
  createTrickShotPhysics,
  stepTrickShotPieces,
} from "../scripts/sim/trick-shot-physics.js";

suite("trick-shot sandbox — reusable pieces and deterministic contacts");

test("piece records are normalized into a bounded, reusable catalog", () => {
  const board = createSandboxPiece(BOARD_PIECE, {
    id: "bank-1", x: 99, y: -4, z: 2, angle: 99, length: 9, restitution: -1,
  });
  assertEqual(board.type, BOARD_PIECE);
  assertEqual(board.id, "bank-1");
  assert(board.x <= 0.9 && board.y >= 0.12 && board.z <= 0.94, "placement is clamped to the room");
  assert(board.length <= 0.76, "boards cannot span outside the editor");
  assert(board.restitution >= 0.45, "a malformed board cannot absorb every shot");

  const cannon = createSandboxPiece(CANNON_PIECE, {
    id: "cannon-1", yaw: -99, pitch: 99, speed: 100, delay: 0,
  });
  assert(cannon.yaw >= -Math.PI / 2 && cannon.pitch < Math.PI / 2);
  assert(cannon.speed <= 7.5);
  assert(cannon.delay >= 0.25);
});

test("launchers and pads can be oriented around the room, not only toward the hoop", () => {
  const backwardCannon = createSandboxPiece(CANNON_PIECE, {
    id: "backward", yaw: Math.PI, pitch: Math.PI / 6,
  });
  const launch = cannonDirection(backwardCannon);
  assert(launch.z < -0.8, "a launcher can fire back toward the camera for a combo");

  const depthPad = createSandboxPiece(BOARD_PIECE, {
    id: "depth-pad", yaw: 0, angle: 0,
  });
  const frame = boardFrame(depthPad);
  assertClose(frame.normal.x, 0, 1e-9);
  assert(frame.normal.z > 0.99, "a pad face can point toward the hoop");
  assertClose(frame.right.x, 1, 1e-9);
  assertClose(frame.up.y, 1, 1e-9);
  assertClose(
    frame.normal.x * frame.right.x + frame.normal.y * frame.right.y + frame.normal.z * frame.right.z,
    0,
    1e-9,
    "the square face axes stay perpendicular",
  );
});

test("a square pad rebounds from its face and does not act like a long thin bar", () => {
  const board = createSandboxPiece(BOARD_PIECE, {
    id: "depth-board", x: 0, y: 0.65, z: 0.5,
    yaw: 0, angle: 0, length: 0.48, restitution: 0.9,
  });
  const ball = { x: 0.08, y: 0.72, z: 0.405, vx: 0, vy: 0, vz: 2, omegaX: 0 };
  const result = stepTrickShotPieces(ball, { x: 0.08, y: 0.72, z: 0.385 }, [board], createTrickShotPhysics(), 0.008);
  assert(result.contacts.includes("sandbox-board"));
  assert(ball.vz < -1.7, "the ball bounces from the pad's visible face normal");

  const outside = { x: 0.42, y: 0.65, z: 0.405, vx: 0, vy: 0, vz: 2, omegaX: 0 };
  const missed = stepTrickShotPieces(outside, { ...outside, z: 0.385 }, [board], createTrickShotPhysics(), 0.008);
  assert(!missed.contacts.includes("sandbox-board"), "empty space beside the square face is not a hidden capsule");
});

test("saved trick shots keep sandbox layouts separate from HORSE state", () => {
  const shot = normalizeTrickShot({
    id: "shot-1",
    name: "  Ceiling ricochet  ",
    ballId: "basketball",
    locationId: "bedroom",
    pieces: [
      { type: "horse-standing-shot", id: "not-a-piece" },
      { type: BOARD_PIECE, id: "b", x: 0.2, y: 0.8, z: 0.5 },
    ],
    horse: { phase: "match", standingShot: {} },
  });
  assertEqual(shot.name, "Ceiling ricochet");
  assertEqual(shot.pieces.length, 1);
  assertEqual(shot.horse, undefined, "the bank schema has no HORSE match/config field");
});

test("a tilted pad reflects only the velocity normal to its face", () => {
  const board = createSandboxPiece(BOARD_PIECE, {
    id: "board", x: 0, y: 0.7, z: 0.45, yaw: Math.PI / 2, angle: 0, length: 0.5, restitution: 0.9,
  });
  const ball = { x: -0.095, y: 0.775, z: 0.45, vx: 2, vy: 0.4, vz: 1, omegaX: 0 };
  const previous = { x: -0.12, y: 0.77, z: 0.438 };
  const result = stepTrickShotPieces(ball, previous, [board], createTrickShotPhysics(), 0.008);

  assert(result.contacts.includes("sandbox-board"));
  assert(ball.vx < -1.7, "the approaching normal velocity bounces away with restitution");
  assertClose(ball.vy, 0.4, 0.03, "vertical velocity along the face is preserved");
  assertClose(ball.vz, 1, 0.03, "depth velocity along the face is preserved");
});

test("a cannon catches a descending ball, waits its delay, then fires on its set trajectory", () => {
  const cannon = createSandboxPiece(CANNON_PIECE, {
    id: "cannon", x: 0.1, y: 0.32, z: 0.45,
    yaw: Math.PI / 6, pitch: Math.PI / 4, speed: 6, delay: 0.5,
  });
  const runtime = createTrickShotPhysics();
  const ball = { x: 0.1, y: 0.36, z: 0.45, vx: 0, vy: -2, vz: 0, omegaX: 0 };
  const caught = stepTrickShotPieces(
    ball, { x: 0.1, y: 0.46, z: 0.45 }, [cannon], runtime, 0.008,
  );
  assert(caught.captured);
  assertEqual(runtime.capture.pieceId, "cannon");
  assertClose(ball.vx, 0, 1e-9);
  assertClose(ball.vy, 0, 1e-9);

  let launched = false;
  for (let i = 0; i < 60 && !launched; i++) {
    launched = stepTrickShotPieces(ball, { ...ball }, [cannon], runtime, 1 / 60).launched;
  }
  assert(launched, "the cannon fires after its authored delay");
  assertClose(Math.hypot(ball.vx, ball.vy, ball.vz), 6, 1e-9, "authored speed is the launch magnitude");
  assert(ball.vy > 0 && ball.vx > 0 && ball.vz > 0, "yaw and pitch point the launch up, right, and into the room");
  assertEqual(runtime.capture, null);
});

finish();
