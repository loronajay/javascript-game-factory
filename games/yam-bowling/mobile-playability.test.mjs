import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Every stylesheet index.html links, concatenated in link order — the cascade
// the browser actually applies, now that the sheet is split per screen.
const readStyles = () => [...read("index.html").matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/g)]
  .map((match) => read(match[1]))
  .join("\n");

test("touch phones are gated until they are landscape and fullscreen-ready", async () => {
  const { getMobileViewportState, renderMobileLandscapeGate } = await import("./mobile-ui.mjs");
  const makeWindow = ({ width, height, fullscreen = null }) => ({
    innerWidth: width,
    innerHeight: height,
    navigator: { userAgent: "iPhone" },
    matchMedia: () => ({ matches: true }),
    document: {
      fullscreenElement: fullscreen,
      documentElement: { requestFullscreen() {} },
    },
  });

  const portrait = getMobileViewportState(makeWindow({ width: 390, height: 844 }));
  assert.equal(portrait.needsRotation, true);
  assert.equal(portrait.shouldGate, true);

  const landscape = getMobileViewportState(makeWindow({ width: 844, height: 390, fullscreen: {} }));
  assert.equal(landscape.isLandscape, true);
  assert.equal(landscape.shouldGate, false);

  const gate = renderMobileLandscapeGate();
  assert.match(gate, /Rotate to Landscape/);
  assert.match(gate, /lane, bowler, and shot controls/i);
});

test("the game initializes the mobile landscape gate", () => {
  const game = read("game.js");
  assert.match(game, /import\s+\{\s*initMobileLandscapeGate\s*\}\s+from\s+["']\.\/mobile-ui\.mjs["']/);
  assert.match(game, /initMobileLandscapeGate\(\)/);
});

test("landscape phones retain the desktop three-rail match inside one viewport", () => {
  const html = read("index.html");
  const css = readStyles();
  assert.match(css, /\.mobile-landscape-gate\s*\{[^}]*position:\s*fixed;[^}]*env\(safe-area-inset-top\)[^}]*env\(safe-area-inset-left\)/s);
  assert.match(css, /\.mobile-landscape-gate\.is-visible\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /\.mobile-play-gated\s+#app\s*\{[^}]*pointer-events:\s*none/s);

  const landscapeBlock = css.match(/@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\),\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\),\s*\(max-height:\s*520px\)\s*and\s*\(min-width:\s*560px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(landscapeBlock, /\.game-screen\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden/s);
  assert.match(landscapeBlock, /\.match-layout\s*\{[^}]*grid-template-columns:\s*minmax\([^;]+\)\s+minmax\([^;]+\)\s+minmax\(/s);
  assert.match(landscapeBlock, /\.lane-shell\s*\{[^}]*height:\s*100%;[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
  assert.match(landscapeBlock, /\.game-panel\s*\{[^}]*max-height:\s*100%;[^}]*overflow:\s*hidden/s);
  assert.match(landscapeBlock, /\.button--throw\s*\{[^}]*min-height:\s*44px/s);
  assert.match(landscapeBlock, /input\[type=["']range["']\][^}]*touch-action:\s*none/s);
  assert.ok(
    html.indexOf('class="scoreboard"') < html.indexOf('class="mobile-line-controls"'),
    "mobile strafe and aim controls should follow the scorecard in the left rail",
  );
  assert.match(landscapeBlock, /\.mobile-line-controls\s*\{[^}]*display:\s*grid/s);
  assert.match(landscapeBlock, /\.game-panel--shot\s+\.desktop-line-control\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*360px\),\s*\(pointer:\s*coarse\)\s*and\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*360px\),\s*\(max-height:\s*360px\)\s*and\s*\(min-width:\s*560px\)/);
});

test("desktop and mobile line controls stay linked to one shot state", () => {
  const html = read("index.html");
  const bindings = read("input/bindings.mjs");
  const shotHud = read("ui/shot-hud.mjs");

  assert.equal((html.match(/data-shot-control=["']position["']/g) || []).length, 2);
  assert.equal((html.match(/data-shot-control=["']aim["']/g) || []).length, 2);
  assert.match(bindings, /querySelectorAll\([^)]*data-shot-control/);
  assert.match(shotHud, /querySelectorAll\([^)]*data-shot-control/);
  assert.match(shotHud, /querySelectorAll\([^)]*data-shot-output/);
});

test("long-pressing controls never raises the mobile text-selection callout", () => {
  const css = readStyles();
  assert.match(css, /body\s*\{[^}]*-webkit-touch-callout:\s*none;[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none/s);
  assert.match(css, /body\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/s);
  assert.match(
    css,
    /input,\s*textarea,\s*\[data-selectable\]\s*\{[^}]*-webkit-touch-callout:\s*default;[^}]*user-select:\s*text/s,
  );

  assert.match(read("input/bindings.mjs"), /addEventListener\("contextmenu"/);
});

test("landscape phone menus use compact desktop-like columns", () => {
  const css = readStyles();
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.setup-layout,\s*\.online-setup-layout\s*\{[^}]*grid-template-columns:\s*minmax\([^;]+\)\s+minmax\(/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.character-grid\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.character-grid\s*\{[^}]*grid-auto-rows:\s*max-content/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.character-grid\s*\{[^}]*align-content:\s*start/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.character-grid\s*\{[^}]*row-gap:\s*\.55rem/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.character-card:hover,\s*\.character-card\.is-selected\s*\{[^}]*transform:\s*none/s);
  assert.match(css, /@media\s*\(hover:\s*none\)\s*and\s*\(orientation:\s*landscape\)[\s\S]*?\.results-card\s*\{[^}]*max-height:\s*100%/s);
});
