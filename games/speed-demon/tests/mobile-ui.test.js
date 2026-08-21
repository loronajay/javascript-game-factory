import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";
import {
  SPEED_DEMON_MOBILE_PROFILE,
  getMobileViewportState,
  getMobilePlayContext,
  inputHintsFor,
  mobileCoachLine,
  renderMobileLandscapeGate,
  renderMobilePlayHelper,
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

test("title and menu contexts remove race-only controls", () => {
  const title = getMobilePlayContext({ screen: "title" });
  assertEqual(title.group, "menu");
  assertEqual(title.padLabel, "MENU");
  assertEqual(title.controls.includes("gas"), false);
  assertEqual(title.controls.includes("shift"), false);
  assertEqual(title.controls.includes("confirm"), true);
  assertEqual(title.controls.includes("back"), false, "there is nowhere to back out to on the title");
  assert(/tap/i.test(title.copy));

  const modes = getMobilePlayContext({ screen: "modes" });
  assertEqual(modes.controls.includes("back"), true);
  assertEqual(modes.labels.confirm, "GO");
});

test("setup-style screens present selection controls and direct-tap help", () => {
  for (const screen of ["setup", "garage", "collection", "campaign", "profile", "online", "radio"]) {
    const context = getMobilePlayContext({ screen });
    assertEqual(context.group, "detail", `${screen} did not use the mobile detail layout`);
    assertEqual(context.controls.includes("pad"), true);
    assertEqual(context.controls.includes("confirm"), true);
    assertEqual(context.controls.includes("back"), true);
    assertEqual(context.controls.includes("gas"), false);
    assert(/tap|touch/i.test(context.copy), `${screen} gives no direct-touch guidance`);
  }

  const boards = getMobilePlayContext({ screen: "boards" });
  assertEqual(boards.controls.includes("pad"), true);
  assertEqual(boards.controls.includes("back"), true);
  assertEqual(boards.controls.includes("confirm"), false, "the boards have no confirm action to offer");
});

test("drag-race controls teach the actual lift, clutch, gate, catch sequence", () => {
  const staging = getMobilePlayContext({ screen: "race", runtime: "drag", phase: "staging" });
  assertEqual(staging.group, "drag");
  assertEqual(staging.padLabel, "H-GATE");
  assertEqual(staging.labels.shift, "CLUTCH");
  assertEqual(staging.labels.back, "PAUSE");
  assertEqual(staging.controls.includes("confirm"), false);
  assert(/clutch/i.test(staging.copy));
  assert(/stage/i.test(staging.copy));

  const racing = getMobilePlayContext({ screen: "race", runtime: "drag", phase: "racing" });
  assert(/lift/i.test(racing.copy));
  assert(/gate/i.test(racing.copy));
  assert(/gas/i.test(racing.copy));
});

test("circuit controls support gas and steering at the same time without a dead shift button", () => {
  const context = getMobilePlayContext({ screen: "race", runtime: "circuit" });
  assertEqual(context.group, "circuit");
  assertEqual(context.padLabel, "STEER / BRAKE");
  assertEqual(context.controls.includes("gas"), true);
  assertEqual(context.controls.includes("pad"), true);
  assertEqual(context.controls.includes("shift"), false);
  assertEqual(context.controls.includes("confirm"), false);
  assert(/hold gas/i.test(context.copy));
  assert(/brake/i.test(context.copy));
});

test("tutorial holds and versus curtains collapse to one obvious continue action", () => {
  const coach = getMobilePlayContext({
    screen: "race",
    runtime: "drag",
    phase: "staging",
    coach: { holding: true },
  });
  assertEqual(coach.group, "coach");
  assertEqual(coach.controls.join(","), "confirm,back");
  assertEqual(coach.labels.confirm, "GOT IT");

  const versus = getMobilePlayContext({ screen: "versus" });
  assertEqual(versus.group, "versus");
  assertEqual(versus.controls.join(","), "confirm");
  assertEqual(versus.labels.confirm, "RACE");
});

test("mobile canvas instructions name touch controls while desktop copy stays intact", () => {
  const mobileTitle = inputHintsFor("title", { mobile: true });
  assert(/GAS/.test(mobileTitle.primary));
  assert(/TAP/.test(mobileTitle.secondary));
  assert(!/SPACE|ARROWS|ESC/.test(`${mobileTitle.primary} ${mobileTitle.secondary}`));

  const desktopTitle = inputHintsFor("title");
  assert(/SPACE/.test(desktopTitle.primary));
  assert(/ESC/.test(desktopTitle.secondary));

  const mobileSetup = inputHintsFor("setup", { mobile: true });
  assert(/TAP/.test(mobileSetup.footer));
  assert(!/WASD|ENTER|ESC/.test(mobileSetup.footer));
  assertEqual(mobileSetup.promptPrefix, "CHOOSE");

  const mobileStaging = inputHintsFor("staging", { mobile: true });
  assert(/CLUTCH/.test(mobileStaging.action));
  assert(/GAS/.test(mobileStaging.action));
  assert(!/ENTER|SPACE|press SHIFT|ARROWS/i.test(Object.values(mobileStaging).join(" ")));
});

test("tutorial copy translates physical key names into the controls on screen", () => {
  assertEqual(mobileCoachLine("Press ENTER to roll up to the line."), "Tap CLUTCH to roll up to the line.");
  assertEqual(
    mobileCoachLine("Hold SPACE the instant it lights — not before, or you red-light."),
    "Hold GAS the instant it lights — not before, or you red-light.",
  );
  assertEqual(mobileCoachLine("Release SPACE, then press SHIFT."), "Release GAS, then tap CLUTCH.");
});

test("the crew-chief helper has a polite live region without stealing canvas touches", () => {
  const html = renderMobilePlayHelper();
  assert(/mobile-play-helper/.test(html));
  assert(/aria-live="polite"/.test(html));
  assert(/data-mobile-helper-title/.test(html));
  assert(/data-mobile-helper-copy/.test(html));
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
  const controllerCall = html.indexOf("const mobileController = mountMobileController({");
  const bootCall = html.indexOf("boot(document.getElementById(\"game\"), { mobile: mobileControlsActive })");
  const shellCall = html.indexOf("initMobilePlayShell({");
  assert(gateCall >= 0, "the mobile landscape gate is not initialized");
  assert(controllerCall >= 0, "the shared touch controller is not mounted");
  assert(bootCall >= 0, "the game is not booted");
  assert(shellCall >= 0, "the context-aware mobile play shell is not initialized");
  assert(/getState:\s*\(\) => game\.mobileState\(\)/.test(html),
    "the mobile shell should read the cheap context state, not rebuild the full debug state every frame");
  assert(gateCall < controllerCall && controllerCall < bootCall && bootCall < shellCall,
    "the gate and controls must exist before the game, then bind to its live state");
});

test("the phone layout fills the dynamic viewport and respects safe areas", () => {
  const css = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");
  assert(/min-height:\s*100dvh/.test(css));
  assert(/\.mobile-landscape-gate\s*\{/.test(css));
  assert(/\.mobile-play-gated\s+\.stage/.test(css));
  assert(/data-mobile-controller-root=["']speed-demon-touch["']/.test(css));
  assert(/\.mobile-play-helper\s*\{/.test(css));
  assert(/data-mobile-context-group=["']menu["']/.test(css));
  assert(/data-mobile-context-group=["']drag["']/.test(css));
  assert(/data-mobile-context-group=["']circuit["']/.test(css));
  assert(/\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/.test(css));
  assert(/env\(safe-area-inset-top\)/.test(css));
  assert(/env\(safe-area-inset-right\)/.test(css));
  assert(/env\(safe-area-inset-bottom\)/.test(css));
  assert(/env\(safe-area-inset-left\)/.test(css));
  assert(/@media[^\{]*(?:hover:\s*none|pointer:\s*coarse)[^\{]*\{/.test(css));
});

finish();
