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
    new URL("../styles/responsive.css", import.meta.url),
    "utf8",
  );
  const boardCss = readFileSync(new URL("../styles/board.css", import.meta.url), "utf8");

  assert.match(
    html,
    /maximum-scale=1, user-scalable=no/,
    "mobile viewport should prevent accidental double-tap zoom during play",
  );
  assert.match(html, /id="landscapeGate"/, "portrait phones need a rotate gate");
  assert.match(
    responsiveCss,
    /\[data-landscape-gate="on"\]\s+\.landscape-gate/,
    "JS-updated viewport state should control the gate",
  );
  assert.match(
    boardCss,
    /\.tap-target/,
    "units need a larger invisible touch target than their painted figurine",
  );
  assert.match(
    readFileSync(new URL("../src/render/unitRenderer.js", import.meta.url), "utf8"),
    /rx:\s*30,[\s\S]*?ry:\s*38/,
    "unit touch targets should not steal taps from nearby floor tiles",
  );
  assert.match(
    responsiveCss,
    /grid-template-areas:\s*"top top"\s*"stage hud"/,
    "landscape phones should move commands beside the battlefield instead of crushing it vertically",
  );
  const appJs = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(
    appJs,
    /const requestAppFullscreen = \(\) => \{[\s\S]*?requestMobileFullscreen/,
    "the app-level fullscreen handler should call the Fullscreen API helper",
  );
  assert.match(
    appJs,
    /addEventListener\("click", requestAppFullscreen, \{ capture: true \}\)/,
    "the app should request mobile fullscreen from taps anywhere in the app, not just match start",
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
