import assert from 'node:assert/strict';

import {
  getMobileViewportState,
  renderMobileLandscapeGate,
} from '../scripts/mobile-ui.js';

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

function testPortraitTouchDevicesAreGated() {
  const state = getMobileViewportState(makeWindow({ width: 390, height: 844 }));
  assert.equal(state.isTouch, true);
  assert.equal(state.isLandscape, false);
  assert.equal(state.needsRotation, true);
  assert.equal(state.shouldGate, true);
}

function testLandscapeTouchDevicesAskForFullscreen() {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }));
  assert.equal(state.isTouch, true);
  assert.equal(state.isLandscape, true);
  assert.equal(state.needsRotation, false);
  assert.equal(state.needsFullscreen, true);
  assert.equal(state.shouldGate, true);
}

function testLandscapeTouchDevicesAreReadyInFullscreen() {
  const state = getMobileViewportState(makeWindow({
    width: 844,
    height: 390,
    fullscreenElement: {},
  }));
  assert.equal(state.needsRotation, false);
  assert.equal(state.needsFullscreen, false);
  assert.equal(state.shouldGate, false);
}

function testDesktopDevicesAreNotGated() {
  const state = getMobileViewportState(makeWindow({
    width: 1280,
    height: 720,
    coarse: false,
    userAgent: 'Desktop',
  }));
  assert.equal(state.isTouch, false);
  assert.equal(state.shouldGate, false);
}

function testFullscreenRequestIsNotRepeatedAfterAction() {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }), {
    fullscreenRequested: true,
  });
  assert.equal(state.needsFullscreen, false);
  assert.equal(state.shouldGate, false);
}

function testGateCopyNamesIlluminauts() {
  const html = renderMobileLandscapeGate();
  assert.match(html, /Illuminauts/);
  assert.match(html, /Landscape/);
  assert.match(html, /Fullscreen/);
  assert.match(html, /maze|beacon|touch controls/i);
}

function run() {
  testPortraitTouchDevicesAreGated();
  testLandscapeTouchDevicesAskForFullscreen();
  testLandscapeTouchDevicesAreReadyInFullscreen();
  testDesktopDevicesAreNotGated();
  testFullscreenRequestIsNotRepeatedAfterAction();
  testGateCopyNamesIlluminauts();
  console.log('Illuminauts mobile UI tests passed.');
}

run();
