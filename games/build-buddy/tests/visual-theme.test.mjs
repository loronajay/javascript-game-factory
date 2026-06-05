import { BackgroundRenderer } from "../js/render/background-renderer.js";

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
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `expected ${actualJson} to equal ${expectedJson}`);
  }
}

test("background renderer exposes a complete construction-daybreak layer plan", () => {
  const renderer = new BackgroundRenderer({ width: 2400, backgroundTheme: {} }, { x: 0, y: 0 });

  assertDeepEqual(renderer.layerPlan.map((layer) => layer.id), [
    "daybreak_sky",
    "sun_core",
    "kite_marks",
    "far_cranes",
    "city_modules",
    "near_rigging",
    "ground_glow",
  ]);
});

test("background renderer creates deterministic blueprint marks from stage width", () => {
  const wide = new BackgroundRenderer({ width: 2400, backgroundTheme: {} }, { x: 0, y: 0 });
  const narrow = new BackgroundRenderer({ width: 1200, backgroundTheme: {} }, { x: 0, y: 0 });

  assertEqual(wide.blueprintMarks.length, 42);
  assertEqual(narrow.blueprintMarks.length, 24);
  assertDeepEqual(wide.blueprintMarks[0], { x: 0, y: 72, size: 18, alpha: 0.12 });
  assertDeepEqual(wide.blueprintMarks[1], { x: 229, y: 269, size: 26, alpha: 0.145 });
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
