import { createPlayerState } from "../scripts/player.js";
import {
  POOP_BACKSIDE_OFFSET_X,
  POOP_BACKSIDE_OFFSET_Y,
  POOP_FALL_SPEED,
  POOP_LANDING_Y,
  SPLAT_TICKS,
  createPoopState,
  isPoopHitboxActive,
  spawnPoopFromPlayer,
  updatePoop,
} from "../scripts/poop.js";

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

test("poop starts inactive", () => {
  const poop = createPoopState();

  assertEqual(poop.phase, "inactive");
  assertEqual(isPoopHitboxActive(poop), false);
});

test("poop spawns from the backside when the bird faces right", () => {
  const player = createPlayerState();
  const poop = spawnPoopFromPlayer(player);

  assertEqual(poop.phase, "airborne");
  assertEqual(isPoopHitboxActive(poop), true);
  assertEqual(poop.x, 640 - POOP_BACKSIDE_OFFSET_X);
  assertEqual(poop.y, 325 - POOP_BACKSIDE_OFFSET_Y);
});

test("poop spawns from the opposite backside when the bird faces left", () => {
  const player = { ...createPlayerState(), facing: "left" };
  const poop = spawnPoopFromPlayer(player);

  assertEqual(poop.x, 640 + POOP_BACKSIDE_OFFSET_X);
});

test("active poop falls at a fixed speed", () => {
  const poop = updatePoop({ phase: "airborne", x: 100, y: 200, splatTicks: 0 });

  assertEqual(poop.y, 200 + POOP_FALL_SPEED);
  assertEqual(poop.phase, "airborne");
});

test("poop turns into a non-hitbox splat halfway through the grey floor band", () => {
  const poop = updatePoop({ phase: "airborne", x: 100, y: POOP_LANDING_Y - 1, splatTicks: 0 });

  assertEqual(poop.y, POOP_LANDING_Y);
  assertEqual(poop.phase, "splat");
  assertEqual(isPoopHitboxActive(poop), false);
});

test("splat remains briefly and then disappears", () => {
  let poop = { phase: "splat", x: 100, y: POOP_LANDING_Y, splatTicks: SPLAT_TICKS - 2 };
  poop = updatePoop(poop);

  assertEqual(poop.phase, "splat");
  assertEqual(poop.splatTicks, SPLAT_TICKS - 1);

  poop = updatePoop(poop);
  assertEqual(poop.phase, "inactive");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
