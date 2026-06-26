import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getViewportPosture } from "../src/ui/mobileViewport.js";

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
});
