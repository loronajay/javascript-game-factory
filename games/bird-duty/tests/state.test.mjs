import { MENU_ACTIONS } from "../scripts/menu-input.js";
import { SCREEN, applyMenuAction, createInitialState } from "../scripts/state.js";
import { TWO_PLAYER_ACTIONS } from "../scripts/two-player-menu.js";

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

test("two players opens the two-player mode selector", () => {
  const state = applyMenuAction(createInitialState(), MENU_ACTIONS.TWO_PLAYERS);

  assertEqual(state.screen, SCREEN.TWO_PLAYER_MENU);
  assertEqual(state.mode, "two-player");
});

test("local two-player action starts hotseat mode", () => {
  const state = applyMenuAction(
    { ...createInitialState(), screen: SCREEN.TWO_PLAYER_MENU, mode: "two-player" },
    TWO_PLAYER_ACTIONS.LOCAL
  );

  assertEqual(state.screen, SCREEN.HOTSEAT_PLAY);
  assertEqual(state.mode, "hotseat");
});

test("online two-player action records online placeholder", () => {
  const state = applyMenuAction(
    { ...createInitialState(), screen: SCREEN.TWO_PLAYER_MENU, mode: "two-player" },
    TWO_PLAYER_ACTIONS.ONLINE
  );

  assertEqual(state.screen, SCREEN.TWO_PLAYER_MENU);
  assertEqual(state.mode, "online-pending");
});

test("two-player back action returns to main menu", () => {
  const state = applyMenuAction(
    { ...createInitialState(), screen: SCREEN.TWO_PLAYER_MENU, mode: "two-player" },
    TWO_PLAYER_ACTIONS.BACK
  );

  assertEqual(state.screen, SCREEN.MENU);
  assertEqual(state.mode, null);
});

test("navigation actions keep the current screen for the caller to handle", () => {
  const state = applyMenuAction(createInitialState(), MENU_ACTIONS.BACK_ARCADE);

  assertEqual(state.screen, SCREEN.MENU);
  assertEqual(state.lastAction, MENU_ACTIONS.BACK_ARCADE);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
