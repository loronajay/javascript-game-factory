import {
  MENU_ACTIONS,
  createMenuInteractionState,
  getMenuButtonByAction,
  resolveMenuActionAtCanvasPoint,
  resolveMenuActionAtScratchPoint,
} from "../scripts/menu-input.js";

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

test("menu hitboxes resolve mode buttons in Scratch coordinates", () => {
  assertEqual(resolveMenuActionAtScratchPoint({ x: 0, y: -15 }), MENU_ACTIONS.SINGLE_PLAYER);
  assertEqual(resolveMenuActionAtScratchPoint({ x: 0, y: -85 }), MENU_ACTIONS.TWO_PLAYERS);
});

test("menu hitboxes resolve bottom navigation buttons in Scratch coordinates", () => {
  assertEqual(resolveMenuActionAtScratchPoint({ x: -255, y: -155 }), MENU_ACTIONS.BACK_HOME);
  assertEqual(resolveMenuActionAtScratchPoint({ x: -165, y: -155 }), MENU_ACTIONS.BACK_ARCADE);
  assertEqual(resolveMenuActionAtScratchPoint({ x: 255, y: -155 }), MENU_ACTIONS.RESET_SCORE);
});

test("menu hitboxes reject empty sky space", () => {
  assertEqual(resolveMenuActionAtScratchPoint({ x: 0, y: 120 }), null);
  assertEqual(resolveMenuActionAtScratchPoint({ x: -120, y: -85 }), null);
});

test("menu hitboxes can resolve browser canvas points", () => {
  assertEqual(resolveMenuActionAtCanvasPoint(333, 199), MENU_ACTIONS.SINGLE_PLAYER);
  assertEqual(resolveMenuActionAtCanvasPoint(333, 269), MENU_ACTIONS.TWO_PLAYERS);
});

test("interaction state stores selected and last action", () => {
  const state = createMenuInteractionState({ selectedAction: null }, MENU_ACTIONS.SINGLE_PLAYER);

  assertEqual(state.selectedAction, MENU_ACTIONS.SINGLE_PLAYER);
  assertEqual(state.lastAction, MENU_ACTIONS.SINGLE_PLAYER);
});

test("button lookup returns the hover geometry for an action", () => {
  const button = getMenuButtonByAction(MENU_ACTIONS.RESET_SCORE);

  assertEqual(button.x, 255);
  assertEqual(button.y, -155);
  assertEqual(button.width, 85.6);
  assertEqual(button.height, 37.6);
});

test("interaction state clears selection when pointer leaves buttons", () => {
  const state = createMenuInteractionState({ selectedAction: MENU_ACTIONS.SINGLE_PLAYER }, null);

  assertEqual(state.selectedAction, null);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
