import {
  getMobileViewportState,
  renderMobileLandscapeGate,
} from "../scripts/mobile-ui.js";

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

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

function makeWindow({
  width = 390,
  height = 844,
  coarse = true,
  userAgent = "iPhone",
  fullscreenElement = null,
  requestFullscreen = () => Promise.resolve(),
} = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    navigator: { userAgent },
    matchMedia(query) {
      return { matches: coarse && query.includes("pointer: coarse") };
    },
    document: {
      fullscreenElement,
      webkitFullscreenElement: null,
      documentElement: {
        requestFullscreen,
      },
    },
  };
}

test("portrait touch devices are gated for landscape play", () => {
  const state = getMobileViewportState(makeWindow({ width: 390, height: 844 }));
  assertEqual(state.isTouch, true);
  assertEqual(state.isLandscape, false);
  assertEqual(state.needsRotation, true);
  assertEqual(state.shouldGate, true);
});

test("landscape touch devices ask for fullscreen when supported", () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }));
  assertEqual(state.isTouch, true);
  assertEqual(state.isLandscape, true);
  assertEqual(state.needsRotation, false);
  assertEqual(state.needsFullscreen, true);
  assertEqual(state.shouldGate, true);
});

test("landscape touch devices are ready once fullscreen is active", () => {
  const state = getMobileViewportState(makeWindow({
    width: 844,
    height: 390,
    fullscreenElement: {},
  }));
  assertEqual(state.needsRotation, false);
  assertEqual(state.needsFullscreen, false);
  assertEqual(state.shouldGate, false);
});

test("desktop devices are not gated", () => {
  const state = getMobileViewportState(makeWindow({
    width: 1280,
    height: 720,
    coarse: false,
    userAgent: "Desktop",
  }));
  assertEqual(state.isTouch, false);
  assertEqual(state.shouldGate, false);
});

test("fullscreen request is not repeated after user action", () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }), {
    fullscreenRequested: true,
  });
  assertEqual(state.needsFullscreen, false);
  assertEqual(state.shouldGate, false);
});

test("gate copy names Bird Duty and the wide drop-shot play space", () => {
  const html = renderMobileLandscapeGate();
  assert(html.includes("Bird Duty"), "expected game-specific gate copy");
  assert(html.includes("Landscape"), "expected landscape guidance");
  assert(html.includes("Fullscreen"), "expected fullscreen guidance");
  assert(html.includes("drop"), "expected drop-shot guidance");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
