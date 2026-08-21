import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";
import {
  SPEED_DEMON_MOBILE_PROFILE,
  getMobileViewportState,
  renderMobileLandscapeGate,
} from "../scripts/mobile-ui.js";

suite("mobile UI — landscape gate, controls, and safe viewport shell");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(__dirname, "..");

function makeWindow({
  width = 390,
  height = 844,
  coarse = true,
  userAgent = "iPhone",
  maxTouchPoints = 5,
  fullscreenElement = null,
  requestFullscreen = () => Promise.resolve(),
} = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    navigator: { userAgent, maxTouchPoints },
    matchMedia(query) {
      return { matches: coarse && query.includes("pointer: coarse") };
    },
    document: {
      fullscreenElement,
      webkitFullscreenElement: null,
      documentElement: { requestFullscreen },
    },
  };
}

test("portrait touch devices are held at the landscape gate", () => {
  const state = getMobileViewportState(makeWindow());
  assertEqual(state.isTouch, true);
  assertEqual(state.isLandscape, false);
  assertEqual(state.needsRotation, true);
  assertEqual(state.shouldGate, true);
});

test("landscape touch devices ask for fullscreen when the browser supports it", () => {
  const state = getMobileViewportState(makeWindow({ width: 844, height: 390 }));
  assertEqual(state.isLandscape, true);
  assertEqual(state.needsRotation, false);
  assertEqual(state.needsFullscreen, true);
  assertEqual(state.shouldGate, true);
});

test("landscape play proceeds after fullscreen starts or the player has requested it", () => {
  assertEqual(getMobileViewportState(makeWindow({
    width: 844,
    height: 390,
    fullscreenElement: {},
  })).shouldGate, false);

  assertEqual(getMobileViewportState(
    makeWindow({ width: 844, height: 390 }),
    { fullscreenRequested: true },
  ).shouldGate, false);
});

test("desktop and non-touch portrait windows are never gated", () => {
  const state = getMobileViewportState(makeWindow({
    width: 1024,
    height: 1366,
    coarse: false,
    userAgent: "Desktop",
    maxTouchPoints: 0,
  }));
  assertEqual(state.isTouch, false);
  assertEqual(state.shouldGate, false);
});

test("touch detection includes tablet browsers that present a desktop user agent", () => {
  const state = getMobileViewportState(makeWindow({
    coarse: false,
    userAgent: "Macintosh",
    maxTouchPoints: 5,
  }));
  assertEqual(state.isTouch, true);
  assertEqual(state.needsRotation, true);
});

test("the control profile covers menus, drag racing, and circuit racing", () => {
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.id, "speed-demon-touch");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.layout, "dpad-buttons");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.directionMode, "cardinal");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.dpad.up.code, "ArrowUp");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.dpad.down.code, "ArrowDown");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.dpad.left.code, "ArrowLeft");
  assertEqual(SPEED_DEMON_MOBILE_PROFILE.dpad.right.code, "ArrowRight");

  const buttons = Object.fromEntries(
    SPEED_DEMON_MOBILE_PROFILE.buttons.map((button) => [button.id, button]),
  );
  assertEqual(buttons.gas.key.code, "Space", "GAS must be a held throttle control");
  assertEqual(buttons.shift.key.code, "ShiftLeft", "SHIFT must reach both race runtimes");
  assertEqual(buttons.confirm.key.code, "Enter", "OK must activate menus and stage the car");
  assertEqual(buttons.back.key.code, "Escape", "BACK must cancel and pause");
});

test("the gate copy is specific to Speed Demon and describes the next action", () => {
  const html = renderMobileLandscapeGate();
  assert(/Speed Demon/.test(html));
  assert(/Landscape/.test(html));
  assert(/Fullscreen/.test(html));
  assert(/touch controls|racing/i.test(html));
});

test("the entry page mounts the gate and shared controller before booting the game", () => {
  const html = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
  assert(/viewport-fit=cover/.test(html));
  assert(/from ["']\.\.\/\.\.\/js\/mobile-controller\.mjs["']/.test(html));
  assert(/from ["']\.\/scripts\/mobile-ui\.js["']/.test(html));
  assert(/new URLSearchParams\(window\.location\.search\)\.has\(["']mobileControls["']\)/.test(html));

  assert(/const mobileControlsActive = forceMobileControls \|\| isTouchLike\(window\)/.test(html));
  const gateCall = html.indexOf("initMobileLandscapeGate({ force: mobileControlsActive })");
  const controllerCall = html.indexOf("mountMobileController({ profile: SPEED_DEMON_MOBILE_PROFILE, force: mobileControlsActive })");
  const bootCall = html.indexOf("window.speedDemon = boot");
  assert(gateCall >= 0, "the mobile landscape gate is not initialized");
  assert(controllerCall >= 0, "the shared touch controller is not mounted");
  assert(bootCall >= 0, "the game is not booted");
  assert(gateCall < controllerCall && controllerCall < bootCall, "mobile UI must exist before the first game frame");
});

test("the phone layout fills the dynamic viewport and respects safe areas", () => {
  const css = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");
  assert(/min-height:\s*100dvh/.test(css));
  assert(/\.mobile-landscape-gate\s*\{/.test(css));
  assert(/\.mobile-play-gated\s+\.stage/.test(css));
  assert(/data-mobile-controller-root=["']speed-demon-touch["']/.test(css));
  assert(/env\(safe-area-inset-top\)/.test(css));
  assert(/env\(safe-area-inset-right\)/.test(css));
  assert(/env\(safe-area-inset-bottom\)/.test(css));
  assert(/env\(safe-area-inset-left\)/.test(css));
  assert(/@media[^\{]*(?:hover:\s*none|pointer:\s*coarse)[^\{]*\{/.test(css));
});

finish();
