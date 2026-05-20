import {
  PLAYER_BOUNDS,
  PLAYER_FRAME_FILES,
  PLAYER_FRAME_TICKS,
  PLAYER_RENDER_SCALE,
  PLAYER_SPEED,
  createPlayerState,
  getPlayerFrameIndex,
  updatePlayer,
} from "../scripts/player.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

test("player starts at the tuned gameplay bird position", () => {
  const player = createPlayerState();

  assertEqual(player.x, 0);
  assertEqual(player.y, 35);
  assertEqual(player.facing, "right");
});

test("player render scale keeps the baked target compact on the 1280x720 playfield", () => {
  assertEqual(PLAYER_RENDER_SCALE, 3);
});

test("player moves left and flips left", () => {
  const player = updatePlayer(createPlayerState(), { left: true });

  assertEqual(player.x, -PLAYER_SPEED);
  assertEqual(player.facing, "left");
});

test("player moves right and flips right", () => {
  const player = updatePlayer({ ...createPlayerState(), facing: "left" }, { right: true });

  assertEqual(player.x, PLAYER_SPEED);
  assertEqual(player.facing, "right");
});

test("opposing inputs cancel movement and preserve facing", () => {
  const player = updatePlayer({ ...createPlayerState(), facing: "left" }, { left: true, right: true });

  assertEqual(player.x, 0);
  assertEqual(player.facing, "left");
});

test("player movement clamps to original bounds", () => {
  const left = updatePlayer({ ...createPlayerState(), x: PLAYER_BOUNDS.minX }, { left: true });
  const right = updatePlayer({ ...createPlayerState(), x: PLAYER_BOUNDS.maxX }, { right: true });

  assertEqual(PLAYER_BOUNDS.minX, -375);
  assertEqual(PLAYER_BOUNDS.maxX, 375);
  assertEqual(left.x, PLAYER_BOUNDS.minX);
  assertEqual(right.x, PLAYER_BOUNDS.maxX);
});

test("player uses the three game PNG flap frames", () => {
  assertEqual(PLAYER_FRAME_FILES[0], "assets/scratch/pngs/white-game-1.png");
  assertEqual(PLAYER_FRAME_FILES[1], "assets/scratch/pngs/white-game-2.png");
  assertEqual(PLAYER_FRAME_FILES[2], "assets/scratch/pngs/white-game-3.png");
});

test("player frame advances at a fixed cadence", () => {
  assertEqual(getPlayerFrameIndex(0), 0);
  assertEqual(getPlayerFrameIndex(PLAYER_FRAME_TICKS - 1), 0);
  assertEqual(getPlayerFrameIndex(PLAYER_FRAME_TICKS), 1);
  assertEqual(getPlayerFrameIndex(PLAYER_FRAME_TICKS * 2), 2);
  assertEqual(getPlayerFrameIndex(PLAYER_FRAME_TICKS * 3), 0);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
