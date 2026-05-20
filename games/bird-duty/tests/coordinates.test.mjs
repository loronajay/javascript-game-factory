import {
  GAME_STAGE,
  SCRATCH_STAGE,
  scratchToGamePoint,
  scratchToCanvasPoint,
  canvasToScratchPoint,
  costumeDrawRect,
} from "../scripts/coordinates.js";

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

function assertClose(actual, expected, message, epsilon = 0.001) {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(message || `expected ${actual} to be close to ${expected}`);
  }
}

test("Scratch origin maps to the center of the Bird Duty stage", () => {
  const point = scratchToCanvasPoint(0, 0);

  assertEqual(point.x, SCRATCH_STAGE.width / 2);
  assertEqual(point.y, SCRATCH_STAGE.height / 2);
});

test("Scratch positive y maps upward on the canvas", () => {
  const point = scratchToCanvasPoint(0, 105);

  assertEqual(point.x, 333);
  assertEqual(point.y, 79);
});

test("Scratch canvas conversion round trips", () => {
  const canvasPoint = scratchToCanvasPoint(-55, -115);
  const scratchPoint = canvasToScratchPoint(canvasPoint.x, canvasPoint.y);

  assertEqual(scratchPoint.x, -55);
  assertEqual(scratchPoint.y, -115);
});

test("costume draw rect anchors Scratch position at the costume rotation center", () => {
  const rect = costumeDrawRect({
    x: 0,
    y: 0,
    width: 648.62134,
    height: 368.08709,
    rotationCenterX: 324.31067,
    rotationCenterY: 184.043515,
  });

  assertClose(rect.x, 8.68933);
  assertClose(rect.y, -0.043515);
  assertClose(rect.width, 648.62134);
  assertClose(rect.height, 368.08709);
});

test("costume draw rect applies Scratch size percentage around the rotation center", () => {
  const rect = costumeDrawRect({
    x: 10,
    y: -20,
    width: 20,
    height: 10,
    rotationCenterX: 5,
    rotationCenterY: 2,
    size: 350,
  });

  assertEqual(rect.x, 325.5);
  assertEqual(rect.y, 197);
  assertEqual(rect.width, 70);
  assertEqual(rect.height, 35);
});

test("Scratch origin maps to the center of the larger gameplay background", () => {
  const point = scratchToGamePoint(0, 0);

  assertEqual(point.x, GAME_STAGE.width / 2);
  assertEqual(point.y, GAME_STAGE.height / 2);
});

test("gameplay mapping keeps Scratch offsets in the 1280x720 playfield", () => {
  const point = scratchToGamePoint(0, 105);

  assertClose(point.x, 640);
  assertClose(point.y, 255);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
