import {
  MENU_BIRD_FRAME_FILES,
  MENU_BIRD_FRAME_TICKS,
  MENU_BIRD_PLACEMENTS,
  advanceMenuBirdState,
  getMenuBirdFrameIndex,
} from "../scripts/menu-birds.js";

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

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

test("menu birds use three white PNG flap frames", () => {
  assertEqual(MENU_BIRD_FRAME_FILES.length, 3);
  assertEqual(MENU_BIRD_FRAME_FILES[0], "assets/scratch/pngs/white1.png");
  assertEqual(MENU_BIRD_FRAME_FILES[1], "assets/scratch/pngs/white2.png");
  assertEqual(MENU_BIRD_FRAME_FILES[2], "assets/scratch/pngs/white3.png");
});

test("menu bird frame advances at a fixed cadence", () => {
  assertEqual(getMenuBirdFrameIndex(0), 0);
  assertEqual(getMenuBirdFrameIndex(MENU_BIRD_FRAME_TICKS - 1), 0);
  assertEqual(getMenuBirdFrameIndex(MENU_BIRD_FRAME_TICKS), 1);
  assertEqual(getMenuBirdFrameIndex(MENU_BIRD_FRAME_TICKS * 2), 2);
  assertEqual(getMenuBirdFrameIndex(MENU_BIRD_FRAME_TICKS * 3), 0);
});

test("menu uses one bird frame set and mirrors the right bird", () => {
  const left = MENU_BIRD_PLACEMENTS.find((bird) => bird.id === "left");
  const right = MENU_BIRD_PLACEMENTS.find((bird) => bird.id === "right");

  assert(left, "expected left menu bird placement");
  assert(right, "expected right menu bird placement");
  assertEqual(left.mirrored, false);
  assertEqual(right.mirrored, true);
});

test("menu bird state ticks forward without mutating the input state", () => {
  const state = { tick: 7 };
  const next = advanceMenuBirdState(state);

  assertEqual(state.tick, 7);
  assertEqual(next.tick, 8);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
