import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PERFORMANCE_MODE_STORAGE_KEY,
  applyPerformanceMode,
  loadPerformanceMode,
  savePerformanceMode,
  shouldUseLowCostBoardPresentation,
  shouldUseReducedMotionPresentation,
} from "../src/ui/performanceSettings.js";
import { reducedMotion } from "../src/ui/effectDom.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("full presentation is the default and is applied to the document root", () => {
  const root = { dataset: {} };

  assert.equal(loadPerformanceMode(memoryStorage()), "full");
  assert.equal(applyPerformanceMode("unexpected", root), "full");
  assert.equal(root.dataset.performance, "full");
});

test("balanced battery-saver mode can be persisted and restored", () => {
  const storage = memoryStorage();

  savePerformanceMode("balanced", storage);

  assert.equal(storage.getItem(PERFORMANCE_MODE_STORAGE_KEY), "balanced");
  assert.equal(loadPerformanceMode(storage), "balanced");
});

test("combat reduced-motion only follows the OS accessibility setting", () => {
  const media = (matchesFor) => ({
    matchMedia: (query) => ({ matches: matchesFor.includes(query) }),
  });

  assert.equal(shouldUseReducedMotionPresentation({ windowRef: media(["(prefers-reduced-motion: reduce)"]) }), true);
  assert.equal(shouldUseReducedMotionPresentation({ windowRef: media(["(pointer: coarse)"]) }), false);

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { documentElement: { dataset: { performance: "balanced" } } };
  globalThis.window = media(["(pointer: coarse)"]);
  try {
    assert.equal(reducedMotion(), false, "phone/battery-saver play must keep rolls, combat motion, and float text");
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("low-cost board presentation applies to battery-saver, OS reduced-motion, and touch play", () => {
  const fullRoot = { dataset: { performance: "full" } };
  const balancedRoot = { dataset: { performance: "balanced" } };
  const media = (matchesFor) => ({
    matchMedia: (query) => ({ matches: matchesFor.includes(query) }),
  });

  assert.equal(shouldUseLowCostBoardPresentation({ root: balancedRoot, windowRef: media([]) }), true);
  assert.equal(shouldUseLowCostBoardPresentation({ root: fullRoot, windowRef: media(["(prefers-reduced-motion: reduce)"]) }), true);
  assert.equal(shouldUseLowCostBoardPresentation({ root: fullRoot, windowRef: media(["(pointer: coarse)"]) }), true);
  assert.equal(shouldUseLowCostBoardPresentation({ root: fullRoot, windowRef: media([]) }), false);
});

test("balanced mode neutralizes continuous action-selection and backdrop repaint costs", () => {
  const css = readFileSync(new URL("../styles/responsive/performance.css", import.meta.url), "utf8");

  assert.match(css, /data-performance=["']balanced["']/);
  assert.match(css, /\.tile\.legal-move \.tile-face/);
  assert.match(css, /\.tile\.legal-attack \.tile-face/);
  assert.match(css, /\.tile-fire-flame/);
  assert.match(css, /\.dais-aura/);
  assert.match(css, /#boardLayer/);
  assert.match(css, /\.bk-aurora/);
  assert.match(css, /\.bk-rain/);
  assert.match(css, /\.weather-flake/);
  assert.match(css, /animation\s*:\s*none\s*!important/);
  assert.match(css, /filter\s*:\s*none/);
});

test("inactive full-scene weather pauses its particle animations without hiding active weather", () => {
  const css = readFileSync(new URL("../styles/battle/scene.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.bk-weather:not\(\.is-active\)\s+\.bk-(?:snow|rain|heat-haze|heat-band|storm-clouds|lightning)[^{]*\{[^}]*animation-play-state\s*:\s*paused\s*!important/s,
  );
  assert.doesNotMatch(
    css,
    /\.bk-weather\.is-active[^{]*\{[^}]*(?:animation\s*:\s*none|animation-play-state\s*:\s*paused)/s,
  );
});

test("the living sky avoids an animated full-screen filter", () => {
  const css = readFileSync(new URL("../styles/battle/scene.css", import.meta.url), "utf8");
  const start = css.indexOf("@keyframes bk-sky-drift");
  const drift = css.slice(start, css.indexOf("/* Stars:", start));

  assert.doesNotMatch(drift, /filter\s*:/, "sky drift should stay on compositor-friendly opacity");
  assert.match(css, /\.bk-sky::after\s*\{[^}]*background/s, "the brightness pulse should retain a visible overlay");
  assert.match(drift, /opacity\s*:/, "the replacement sky pulse should remain animated");
});

test("the default renderer preserves the original full-board stone texture", () => {
  const boardCss = readFileSync(new URL("../styles/battle/board.css", import.meta.url), "utf8");
  const matchHtml = readFileSync(new URL("../html/match-screen.html", import.meta.url), "utf8");

  assert.doesNotMatch(matchHtml, /id="boardTextureLayer"/);
  assert.match(boardCss, /#boardLayer\s*\{[^}]*filter\s*:\s*url\(#boardStone\)/s);
  assert.doesNotMatch(boardCss, /#boardTextureLayer/);
  assert.match(boardCss, /\.unit\.idle:not\(\.spent\) \.body-group\s*\{[^}]*animation\s*:\s*none/s);
});
