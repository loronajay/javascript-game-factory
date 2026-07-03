import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getViewportPosture,
  requestMobileFullscreen,
  shouldRequestFullscreen,
} from "../src/ui/mobileViewport.js";

test("compact touch portrait viewports require the landscape gate", () => {
  assert.deepEqual(
    getViewportPosture({ width: 390, height: 844, coarsePointer: true }),
    {
      orientation: "portrait",
      isCompactTouch: true,
      gateVisible: true,
    },
  );
});

test("compact touch landscape viewports are allowed to play", () => {
  assert.deepEqual(
    getViewportPosture({ width: 844, height: 390, coarsePointer: true }),
    {
      orientation: "landscape",
      isCompactTouch: true,
      gateVisible: false,
    },
  );
});

test("compact touch landscape viewports request fullscreen when possible", () => {
  assert.equal(
    shouldRequestFullscreen({
      width: 844,
      height: 390,
      coarsePointer: true,
      fullscreenElement: null,
    }),
    true,
  );
});

test("portrait phones do not request fullscreen behind the rotate gate", () => {
  assert.equal(
    shouldRequestFullscreen({
      width: 390,
      height: 844,
      coarsePointer: true,
      fullscreenElement: null,
    }),
    false,
  );
});

test("desktop and laptop viewports never show the mobile landscape gate", () => {
  assert.equal(
    getViewportPosture({ width: 1024, height: 1366, coarsePointer: false }).gateVisible,
    false,
  );
});

test("the document exposes the mobile playability shell", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const responsiveCss = readFileSync(
    new URL("../responsive.css", import.meta.url),
    "utf8",
  );
  const menusCss = readFileSync(new URL("../menus.css", import.meta.url), "utf8");

  assert.match(
    html,
    /maximum-scale=1, user-scalable=no/,
    "mobile viewport should prevent accidental double-tap zoom during play",
  );
  assert.match(
    html,
    /class="back-link"[^>]*href="\.\.\/\.\.\/grid\.html"|href="\.\.\/\.\.\/grid\.html"[^>]*class="back-link"/,
    "every screen needs a return-to-arcade link",
  );
  assert.match(html, /id="landscapeGate"/, "portrait phones need a rotate gate");
  assert.match(
    responsiveCss,
    /\[data-landscape-gate="on"\]\s+\.landscape-gate/,
    "JS-updated viewport state should control the gate",
  );
  assert.match(
    responsiveCss,
    /grid-template-areas:\s*"top top"\s*"stage hud"/,
    "landscape phones should move commands beside the battlefield instead of crushing it vertically",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(max-width: 740px\),\s*\(pointer: coarse\) and \(max-height: 540px\)[\s\S]*?\.squad-pickers\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    "mobile setup should stack squad pickers instead of squeezing two squads into cramped columns",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\) and \(max-width: 560px\)[\s\S]*?\.roster-grid\s*\{[\s\S]*?grid-auto-flow:\s*column/,
    "narrow roster pickers should use a horizontal unit rail above the detail pane",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\)[\s\S]*?\.roster-card\s*\{[\s\S]*?var\(--app-height,\s*100vh\)/,
    "touch roster modals should size to the live viewport height instead of overflowing mobile browser chrome",
  );
  assert.match(
    menusCss,
    /\.roster-body\s*\{[^}]*min-height:\s*0/,
    "the roster modal body must be allowed to shrink so its internal panes can scroll",
  );
  assert.match(
    responsiveCss,
    /@media \(pointer: coarse\)[\s\S]*?button\s*\{[\s\S]*?min-height: 44px/,
    "touch targets need a comfortable minimum button height on coarse pointers",
  );

  // Unit touch target = the unit's own tile diamond (see unitRenderer.js), so a
  // tall figurine that overhangs tiles behind it never steals their taps.
  assert.match(
    readFileSync(new URL("../src/ui/unitRenderer.js", import.meta.url), "utf8"),
    /class:\s*"unit-hit"/,
    "units need a board-sized touch target that does not steal taps from nearby floor tiles",
  );

  const mainJs = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(
    mainJs,
    /const requestAppFullscreen = \(\) => \{[\s\S]*?requestMobileFullscreen/,
    "the app-level fullscreen handler should call the Fullscreen API helper",
  );
  assert.match(
    mainJs,
    /addEventListener\("click", requestAppFullscreen, \{ capture: true \}\)/,
    "the app should request mobile fullscreen from taps anywhere in the app, not just match start",
  );
  assert.match(
    mainJs,
    /applyMobileViewport\(\)/,
    "the app should track viewport posture from boot",
  );
});

test("requestMobileFullscreen calls the Fullscreen API only for playable phone landscape", async () => {
  let requested = false;
  const root = {
    requestFullscreen: async (options) => {
      requested = options?.navigationUI === "hide";
    },
  };

  const ok = await requestMobileFullscreen({
    documentRef: {
      documentElement: root,
      fullscreenElement: null,
    },
    windowRef: {
      innerWidth: 844,
      innerHeight: 390,
      matchMedia: () => ({ matches: true }),
      navigator: { maxTouchPoints: 1 },
    },
  });

  assert.equal(ok, true);
  assert.equal(requested, true);
});
