import { MENU_ACTIONS } from "../scripts/menu-input.js";
import { SCREEN, applyMenuAction, createInitialState } from "../scripts/state.js";

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

test("initial state starts on the menu", () => {
  const state = createInitialState();

  assertEqual(state.screen, SCREEN.MENU);
  assertEqual(state.mode, null);
});

test("single player starts gameplay immediately", () => {
  const state = applyMenuAction(createInitialState(), MENU_ACTIONS.SINGLE_PLAYER);

  assertEqual(state.screen, SCREEN.PLAY);
  assertEqual(state.mode, "single");
  assertEqual(state.lastAction, MENU_ACTIONS.SINGLE_PLAYER);
});

test("two players records a pending two-player state", () => {
  const state = applyMenuAction(createInitialState(), MENU_ACTIONS.TWO_PLAYERS);

  assertEqual(state.screen, SCREEN.TWO_PLAYER_PENDING);
  assertEqual(state.mode, "two-player");
});

test("navigation actions keep the current screen for the caller to handle", () => {
  const state = applyMenuAction(createInitialState(), MENU_ACTIONS.BACK_ARCADE);

  assertEqual(state.screen, SCREEN.MENU);
  assertEqual(state.lastAction, MENU_ACTIONS.BACK_ARCADE);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
