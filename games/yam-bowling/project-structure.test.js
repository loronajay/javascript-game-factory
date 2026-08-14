const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the cabinet exposes title, setup, match, and results screens", () => {
  const html = read("index.html");
  for (const screen of ["title-screen", "setup-screen", "game-screen", "results-screen"]) {
    assert.match(html, new RegExp(`id=["']${screen}["']`));
  }
  assert.match(html, /id=["']character-grid["']/);
  assert.match(html, /id=["']game-canvas["']/);
  assert.match(html, /Hotseat/i);
  assert.match(html, /Vs CPU/i);
});

test("the title splash keeps the complete painted artwork visible", () => {
  const css = read("styles.css");
  assert.match(
    css,
    /\.title-art\s*\{[^}]*object-fit:\s*contain/s,
    "the splash should fit inside the viewport instead of cropping its painted title",
  );
});

test("the match keeps the bowling lane centered between supporting UI rails", () => {
  const html = read("index.html");
  const leftRail = html.indexOf('class="game-panel game-panel--score');
  const lane = html.indexOf('class="lane-shell"');
  const rightRail = html.indexOf('class="game-panel game-panel--shot');

  assert.ok(leftRail > -1, "score and turn context should live in a left rail");
  assert.ok(rightRail > -1, "shot controls should live in a right rail");
  assert.ok(leftRail < lane && lane < rightRail, "the lane should be the center of the match layout");

  const css = read("styles.css");
  assert.match(css, /\.match-layout\s*\{[^}]*grid-template-columns:\s*minmax\([^;]+\)\s+minmax\([^;]+\)\s+minmax\(/s);
  assert.match(css, /\.lane-shell\s*\{[^}]*aspect-ratio:\s*2\s*\/\s*3/s);
});

test("the runtime owns a fixed-timestep update loop and pixel-sharp canvas", () => {
  const game = read("game.js");
  assert.match(game, /requestAnimationFrame\s*\(/);
  assert.match(game, /while\s*\(accumulator\s*>=\s*TICK_MS\)/);
  assert.match(game, /imageSmoothingEnabled\s*=\s*false/);
});

test("game rules, physics, rendering, and browser orchestration remain separate", () => {
  for (const file of ["audio-core.js", "ball-core.js", "game-core.js", "physics-core.js", "cpu-core.js", "renderer.js", "game.js"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test("ball properties and overcharge consequences are labeled in the shot UI", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']ball-profile["']/);
  assert.match(html, /id=["']charge-warning["']/);
  assert.ok(html.indexOf("ball-core.js") < html.indexOf("game.js"));
  assert.match(game, /BallCore\.profileStats/);
  assert.match(game, /ball\.aimSpeed/);
  assert.match(game, /Physics\.chargeStateAtTime/);
});

test("the physics-aware CPU planner loads after physics and before browser orchestration", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("physics-core.js") < html.indexOf("cpu-core.js"));
  assert.ok(html.indexOf("cpu-core.js") < html.indexOf("game.js"));
});

test("CPU turns plan against the live pin bodies and retain planner ball choice", () => {
  const game = read("game.js");
  assert.match(game, /Cpu\.createCpuPlan\(\{[^}]*pins:\s*scene\.pins[^}]*balls:\s*BALLS/s);
  assert.match(game, /scene\.liveShot\.ballIndex\s*=\s*plan\.ballIndex/);
});

test("the cabinet exposes an accessible audio control and loads audio before the game", () => {
  const html = read("index.html");
  assert.match(html, /id=["']audio-toggle["']/);
  assert.match(html, /aria-pressed=["']true["']/);
  assert.ok(html.indexOf("audio-core.js") < html.indexOf("game.js"));
  assert.match(read("tools/serve.mjs"), /["']\.mp3["']\s*:\s*["']audio\/mpeg/);
});

test("screen transitions reset the viewport for phone navigation", () => {
  assert.match(read("game.js"), /window\.scrollTo\(\{\s*top:\s*0/);
});

test("selection and identity surfaces use portraits while the lane uses throw frames", () => {
  const game = read("game.js");
  assert.match(game, /function characterPortrait/);
  assert.match(game, /characterPortrait\(bowler\.slug\)/);
  assert.match(game, /characterPortrait\(player\.characterSlug\)/);
  assert.match(game, /renderer\.setCharacter\(player\.characterSlug\)/);
});

test("results give both bowlers large outcome-specific character art", () => {
  const game = read("game.js");
  const css = read("styles.css");

  assert.match(game, /getResultPortraitAssetPath/);
  assert.match(game, /is-defeated/);
  assert.match(game, /result-player__portrait/);
  assert.match(game, /result-player__outcome/);
  assert.match(css, /\.result-player__portrait\s*\{[^}]*min-height:/s);
  assert.match(css, /\.result-player__portrait img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.result-player\.is-winner[^}]*box-shadow:/s);
});

test("human throws use a timed spin stage before hold-to-charge power", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']spin-meter["']/);
  assert.match(html, /id=["']spin-cursor["']/);
  assert.doesNotMatch(html, /id=["']hook-control["']/);
  assert.match(game, /function startSpin/);
  assert.match(game, /scene\.phase === ["']spin["']/);
  assert.match(game, /Physics\.spinAtTime/);
});

test("keyboard shot setup keeps A/D on strafe and arrow keys on aim", () => {
  const game = read("game.js");

  assert.match(game, /event\.code === ["']ArrowLeft["']/);
  assert.match(game, /event\.code === ["']ArrowRight["']/);
  assert.match(game, /scene\.liveShot\.position\s*=.*strafeDirection/s);
  assert.match(game, /scene\.liveShot\.aim\s*=.*aimDirection/s);
  assert.match(game, /Math\.min\(0\.45,\s*scene\.liveShot\.aim/);
});
