import {
  getMobileViewportState,
  renderMobileLandscapeGate,
} from '../scripts/mobile-ui.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(source, text, message) {
  if (!source.includes(text)) {
    throw new Error(message || `Expected ${JSON.stringify(source)} to include ${JSON.stringify(text)}`);
  }
}

function makeWindow({
  width = 390,
  height = 844,
  coarse = true,
  userAgent = 'iPhone',
  fullscreenElement = null,
  requestFullscreen = () => Promise.resolve(),
} = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    navigator: { userAgent },
    matchMedia(query) {
      return { matches: coarse && query.includes('pointer: coarse') };
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

console.log('\nmobile-ui');

test('portrait touch devices are gated for landscape play', () => {
  const state = getMobileViewportState(makeWindow({ width: 390, height: 844 }));
  assertEqual(state.isTouch, true);
  assertEqual(state.isLandscape, false);
  assertEqual(state.needsRotation, true);
  assertEqual(state.shouldGate, true);
});

test('landscape touch devices ask for fullscreen when supported', () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }));
  assertEqual(state.isTouch, true);
  assertEqual(state.isLandscape, true);
  assertEqual(state.needsRotation, false);
  assertEqual(state.needsFullscreen, true);
  assertEqual(state.shouldGate, true);
});

test('landscape touch devices are ready once fullscreen is active', () => {
  const state = getMobileViewportState(makeWindow({
    width: 844,
    height: 390,
    fullscreenElement: {},
  }));
  assertEqual(state.needsRotation, false);
  assertEqual(state.needsFullscreen, false);
  assertEqual(state.shouldGate, false);
});

test('desktop devices are not gated', () => {
  const state = getMobileViewportState(makeWindow({
    width: 1280,
    height: 720,
    coarse: false,
    userAgent: 'Desktop',
  }));
  assertEqual(state.isTouch, false);
  assertEqual(state.shouldGate, false);
});

test('fullscreen request is not repeated after user action', () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }), {
    fullscreenRequested: true,
  });
  assertEqual(state.needsFullscreen, false);
  assertEqual(state.shouldGate, false);
});

test('gate copy names Battleshits and landscape fullscreen board play', () => {
  const html = renderMobileLandscapeGate();
  assertIncludes(html, 'Battleshits', 'expected game-specific gate copy');
  assertIncludes(html, 'Landscape', 'expected landscape guidance');
  assertIncludes(html, 'Fullscreen', 'expected fullscreen guidance');
  assertIncludes(html, 'boards', 'expected board-play guidance');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
