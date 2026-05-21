import {
  ONLINE_ACTIONS,
  getOnlineActionSettings,
  resolveOnlineActionAtScratchPoint,
} from "../scripts/online-menu.js";

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

test("online menu resolves public matchmaking size buttons", () => {
  assertEqual(resolveOnlineActionAtScratchPoint({ x: -105, y: 10 }), ONLINE_ACTIONS.PUBLIC_2);
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 0, y: 10 }), ONLINE_ACTIONS.PUBLIC_3);
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 105, y: 10 }), ONLINE_ACTIONS.PUBLIC_4);
});

test("online menu resolves private join and back buttons", () => {
  assertEqual(resolveOnlineActionAtScratchPoint({ x: -70, y: -70 }), ONLINE_ACTIONS.PRIVATE);
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 70, y: -70 }), ONLINE_ACTIONS.JOIN);
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 0, y: -140 }), ONLINE_ACTIONS.BACK);
});

test("online menu rejects empty space", () => {
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 190, y: 10 }), null);
  assertEqual(resolveOnlineActionAtScratchPoint({ x: 0, y: 90 }), null);
});

test("online action settings map public modes to exact player counts", () => {
  assertEqual(getOnlineActionSettings(ONLINE_ACTIONS.PUBLIC_2).minPlayers, 2);
  assertEqual(getOnlineActionSettings(ONLINE_ACTIONS.PUBLIC_2).maxPlayers, 2);
  assertEqual(getOnlineActionSettings(ONLINE_ACTIONS.PUBLIC_3).maxPlayers, 3);
  assertEqual(getOnlineActionSettings(ONLINE_ACTIONS.PUBLIC_4).maxPlayers, 4);
  assertEqual(getOnlineActionSettings(ONLINE_ACTIONS.PRIVATE).private, true);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
