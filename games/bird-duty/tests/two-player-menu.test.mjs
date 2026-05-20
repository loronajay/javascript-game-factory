import {
  TWO_PLAYER_ACTIONS,
  getTwoPlayerButtonByAction,
  resolveTwoPlayerActionAtCanvasPoint,
  resolveTwoPlayerActionAtScratchPoint,
} from "../scripts/two-player-menu.js";

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

test("two-player menu resolves local online and back buttons", () => {
  assertEqual(resolveTwoPlayerActionAtScratchPoint({ x: 0, y: -20 }), TWO_PLAYER_ACTIONS.LOCAL);
  assertEqual(resolveTwoPlayerActionAtScratchPoint({ x: 0, y: -90 }), TWO_PLAYER_ACTIONS.ONLINE);
  assertEqual(resolveTwoPlayerActionAtScratchPoint({ x: 0, y: -147 }), TWO_PLAYER_ACTIONS.BACK);
});

test("two-player menu rejects empty sky space", () => {
  assertEqual(resolveTwoPlayerActionAtScratchPoint({ x: 0, y: 100 }), null);
  assertEqual(resolveTwoPlayerActionAtScratchPoint({ x: 150, y: -80 }), null);
});

test("two-player menu resolves browser canvas points", () => {
  assertEqual(resolveTwoPlayerActionAtCanvasPoint(333, 204), TWO_PLAYER_ACTIONS.LOCAL);
  assertEqual(resolveTwoPlayerActionAtCanvasPoint(333, 274), TWO_PLAYER_ACTIONS.ONLINE);
  assertEqual(resolveTwoPlayerActionAtCanvasPoint(333, 331), TWO_PLAYER_ACTIONS.BACK);
});

test("two-player button lookup returns render geometry", () => {
  const local = getTwoPlayerButtonByAction(TWO_PLAYER_ACTIONS.LOCAL);
  const back = getTwoPlayerButtonByAction(TWO_PLAYER_ACTIONS.BACK);

  assertEqual(local.label, "LOCAL");
  assertEqual(local.asset, "assets/scratch/local-button.svg");
  assertEqual(local.width, 128.4);
  assertEqual(back.asset, "assets/scratch/back-button.svg");
  assertEqual(back.width, 88);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
