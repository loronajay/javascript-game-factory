import {
  getMobileViewportState,
  renderMobileLandscapeGate,
} from '../scripts/mobile-ui.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEq(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
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
  assertEq(state.isTouch, true);
  assertEq(state.isLandscape, false);
  assertEq(state.needsRotation, true);
  assertEq(state.shouldGate, true);
});

test('landscape touch devices ask for fullscreen when supported', () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }));
  assertEq(state.isTouch, true);
  assertEq(state.isLandscape, true);
  assertEq(state.needsRotation, false);
  assertEq(state.needsFullscreen, true);
  assertEq(state.shouldGate, true);
});

test('landscape touch devices are ready once fullscreen is active', () => {
  const state = getMobileViewportState(makeWindow({
    width: 844,
    height: 390,
    fullscreenElement: {},
  }));
  assertEq(state.needsRotation, false);
  assertEq(state.needsFullscreen, false);
  assertEq(state.shouldGate, false);
});

test('desktop devices are not gated', () => {
  const state = getMobileViewportState(makeWindow({
    width: 1280,
    height: 720,
    coarse: false,
    userAgent: 'Desktop',
  }));
  assertEq(state.isTouch, false);
  assertEq(state.shouldGate, false);
});

test('fullscreen request is not repeated after user action', () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }), {
    fullscreenRequested: true,
  });
  assertEq(state.needsFullscreen, false);
  assertEq(state.shouldGate, false);
});

test('gate copy names Sumorai and landscape fullscreen play', () => {
  const html = renderMobileLandscapeGate();
  assert(html.includes('Sumorai'), 'expected game-specific gate copy');
  assert(html.includes('Landscape'), 'expected landscape guidance');
  assert(html.includes('Fullscreen'), 'expected fullscreen guidance');
});

if (failed > 0) {
  console.error(`\n${failed} failing, ${passed} passing`);
  process.exit(1);
}

console.log(`\n${passed} passing`);
