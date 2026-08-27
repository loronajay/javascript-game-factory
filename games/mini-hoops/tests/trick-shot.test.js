import { suite, test, assert, assertClose, assertEqual, finish } from "./harness.js";

import {
  BOARD_PIECE,
  CANNON_PIECE,
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

test("a rotated board reflects only the velocity normal to its face", () => {
  const board = createSandboxPiece(BOARD_PIECE, {
    id: "board", x: 0, y: 0.7, z: 0.45, angle: 0, length: 0.6, restitution: 0.9,
  });
  const ball = { x: 0.08, y: 0.775, z: 0.45, vx: 0.4, vy: -2, vz: 1, omegaX: 0 };
  const previous = { x: 0.077, y: 0.79, z: 0.443 };
  const result = stepTrickShotPieces(ball, previous, [board], createTrickShotPhysics(), 0.008);

  assert(result.contacts.includes("sandbox-board"));
  assert(ball.vy > 1.7, "the approaching normal velocity bounces away with restitution");
  assertClose(ball.vx, 0.4, 0.03, "velocity along the plank is preserved");
  assertClose(ball.vz, 1, 0.03, "a screen-plane plank does not invent depth speed");
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
