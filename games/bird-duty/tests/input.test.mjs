import {
  consumeDropRequest,
  createInputState,
  directionForKey,
  shouldPreventGameKey,
  updateInputForKey,
} from "../scripts/input.js";

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

test("input starts with no horizontal movement", () => {
  const input = createInputState();

  assertEqual(input.left, false);
  assertEqual(input.right, false);
  assertEqual(input.dropHeld, false);
  assertEqual(input.dropRequested, false);
});

test("directionForKey maps arrows and A/D", () => {
  assertEqual(directionForKey("ArrowLeft"), "left");
  assertEqual(directionForKey("a"), "left");
  assertEqual(directionForKey("ArrowRight"), "right");
  assertEqual(directionForKey("D"), "right");
});

test("unknown keys are ignored", () => {
  const input = createInputState();

  assertEqual(directionForKey("Enter"), null);
  assertEqual(updateInputForKey(input, "Enter", true), input);
});

test("updateInputForKey toggles movement flags", () => {
  const pressed = updateInputForKey(createInputState(), "ArrowLeft", true);
  const released = updateInputForKey(pressed, "ArrowLeft", false);

  assertEqual(pressed.left, true);
  assertEqual(released.left, false);
});

test("mapped movement keys prevent browser defaults", () => {
  assertEqual(shouldPreventGameKey("ArrowLeft"), true);
  assertEqual(shouldPreventGameKey("d"), true);
  assertEqual(shouldPreventGameKey(" "), true);
  assertEqual(shouldPreventGameKey("Space"), true);
  assertEqual(shouldPreventGameKey("Enter"), false);
});

test("spacebar queues one drop request until consumed", () => {
  const pressed = updateInputForKey(createInputState(), " ", true);
  const repeat = updateInputForKey(pressed, " ", true);
  const consumed = consumeDropRequest(repeat);
  const released = updateInputForKey(consumed, " ", false);
  const pressedAgain = updateInputForKey(released, "Space", true);

  assertEqual(pressed.dropHeld, true);
  assertEqual(pressed.dropRequested, true);
  assertEqual(repeat.dropRequested, true);
  assertEqual(consumed.dropHeld, true);
  assertEqual(consumed.dropRequested, false);
  assertEqual(released.dropHeld, false);
  assertEqual(pressedAgain.dropRequested, true);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
