const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { AVAILABLE_SKINS, CANON_BOWLERS } = require("./animation-core.js");

const root = __dirname;
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every canon bowler has every reusable processed skin package", () => {
  for (const bowler of CANON_BOWLERS) {
    const bowlerDirectory = path.join(root, "assets", "characters", "skins", bowler.slug);
    for (const skin of AVAILABLE_SKINS.filter(({ id }) => id !== "canon")) {
      const skinDirectory = path.join(bowlerDirectory, skin.id);
      const expectedFiles = [
        "source.png",
        "portrait.webp",
        "victory.webp",
        "defeat.webp",
        ...Array.from({ length: 5 }, (_, index) => `throw-${String(index + 1).padStart(2, "0")}.webp`),
      ];

      const imageFiles = fs.readdirSync(skinDirectory).filter((file) => /\.(?:png|webp)$/.test(file));
      for (const expectedFile of expectedFiles) {
        assert.equal(
          imageFiles.includes(expectedFile),
          true,
          `${bowler.name} ${skin.name} should include ${expectedFile}`,
        );
      }
      assert.deepEqual(
        imageFiles.filter(
          (file) => !expectedFiles.includes(file) && !/^throw-0[1-5]\.png$/.test(file),
        ),
        [],
        `${bowler.name} ${skin.name} should contain only runtime assets and optional throw overrides`,
      );
    }
    assert.equal(
      fs.readdirSync(bowlerDirectory).filter((file) => file.endsWith(".png")).length,
      0,
      `${bowler.name} should not keep a legacy sheet outside a skin-id folder`,
    );
  }
});

test("the setup screen exposes skin equipment controls", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']skin-options["']/);
  assert.match(html, /id=["']online-skin-options["']/);
  assert.match(game, /saveEquippedSkinId/);
  assert.match(game, /skinId/);
  assert.match(read("renderer.js"), /getFrameAssetPath/);
});

test("local and online character selection expose the read-only bowler inspector", () => {
  const html = read("index.html");
  const game = read("game.js");
  const css = read("styles.css");

  for (const id of [
    "inspect-bowler-button", "online-inspect-bowler-button", "character-inspector-dialog",
    "character-inspector-close", "character-inspector-previous", "character-inspector-next",
    "character-inspector-art", "character-inspector-name", "character-inspector-skins",
    "character-inspector-age", "character-inspector-hometown", "character-inspector-occupation",
    "character-inspector-style", "character-inspector-ball", "character-inspector-personality",
    "character-inspector-bio",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }

  assert.ok(html.indexOf("character-catalog-data.js") < html.indexOf("character-catalog.js"));
  assert.ok(html.indexOf("character-catalog.js") < html.indexOf("game.js"));
  assert.match(game, /function openCharacterInspector/);
  assert.match(game, /Catalog\.getCharacter/);
  assert.match(game, /Catalog\.getAdjacentCharacterSlug/);
  assert.match(css, /\.character-inspector-dialog\s*\{/);
  assert.match(css, /\.character-inspector-layout\s*\{[^}]*grid-template-columns:/s);
});

test("inspector skin previews never use the equipment persistence path", () => {
  const game = read("game.js");
  const previewFunction = game.match(/function renderInspectorSkinOptions\([^]*?\n  \}/)?.[0] ?? "";

  assert.match(previewFunction, /inspectorPreviewSkinId/);
  assert.match(previewFunction, /getSkinPreviewLabel/);
  assert.doesNotMatch(previewFunction, /saveEquippedSkinId/);
});

test("the published runtime includes the generated character catalog", () => {
  const manifest = JSON.parse(read("runtime-assets.json"));
  assert.ok(manifest.include.includes("character-catalog-data.js"));
  assert.ok(manifest.include.includes("character-catalog.js"));
});

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

test("the title screen provides a return link to the arcade", () => {
  const html = read("index.html");
  const css = read("styles.css");
  const arcadeLink = html.match(/<a[^>]*class=["'][^"']*arcade-link[^"']*["'][^>]*>[^<]*<\/a>/i)?.[0] ?? "";

  assert.match(arcadeLink, /href=["']\.\.\/\.\.\/grid\.html["']/i);
  assert.match(arcadeLink, /Return to Arcade/i);
  assert.match(css, /\.arcade-link\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.arcade-link\s*\{[^}]*z-index:\s*\d+/s);
});

test("the cabinet exposes complete quick-match and private-room online screens", () => {
  const html = read("index.html");
  for (const id of [
    "online-button", "online-screen", "online-character-grid", "quick-match-button",
    "create-room-button", "join-room-code", "join-room-button", "online-lobby-screen",
    "online-room-code", "online-lobby-players", "online-status", "leave-online-button",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `${id} should exist`);
  }
  assert.match(html, /Quick Match/i);
  assert.match(html, /Create Private Room/i);
  assert.match(html, /Join Private Room/i);
});

test("online play uses the Factory identity, server-owned shots, ratings, and reconnect client", () => {
  const html = read("index.html");
  const game = read("game.js");
  assert.match(html, /type=["']module["'][^>]*src=["']game\.js["']/);
  assert.match(game, /loadFactoryProfile/);
  assert.match(game, /createOnlineIdentityPayload/);
  assert.match(game, /createOnlineClient/);
  assert.match(game, /onlineClient\.submitShot/);
  assert.match(game, /updateGameRating\(["']yam-bowling["']/);
  assert.match(read("online-client.mjs"), /resume_lobby/);
});

test("the title splash keeps the complete painted artwork visible", () => {
  const css = read("styles.css");
  assert.match(
    css,
    /\.title-art\s*\{[^}]*object-fit:\s*contain/s,
    "the splash should fit inside the viewport instead of cropping its painted title",
  );
});

test("players can choose and persist a character-named menu splash", () => {
  const html = read("index.html");
  const game = read("game.js");

  assert.match(html, /id=["']menu-splash-button["']/);
  assert.match(html, /id=["']menu-splash-dialog["']/);
  assert.match(html, /id=["']menu-splash-grid["']/);
  assert.ok(html.indexOf("menu-splash-core.js") < html.indexOf("game.js"));
  assert.match(game, /loadMenuSplashSlug/);
  assert.match(game, /saveMenuSplashSlug/);
  assert.match(game, /data-splash-slug/);
});

test("local setup lets a player choose a lane and remembers it", () => {
  const html = read("index.html");
  const game = read("game.js");

  const setupStart = html.indexOf('id="setup-screen"');
  const lanePick = html.indexOf('id="lane-button"');
  const startMatch = html.indexOf('id="start-match"');
  assert.ok(setupStart > -1 && setupStart < lanePick && lanePick < startMatch,
    "the lane picker should sit inside setup, ahead of the start button");

  assert.match(html, /id=["']lane-dialog["']/);
  assert.match(html, /id=["']lane-grid["']/);
  assert.ok(html.indexOf("lane-core.js") < html.indexOf("game.js"));
  assert.match(game, /loadLaneSlug/);
  assert.match(game, /saveLaneSlug/);
  assert.match(game, /data-lane-slug/);
  assert.match(game, /renderer\.load\(selectedLaneSlug\)/);
});

test("online matches bowl on the lane the server dealt, not the local pick", () => {
  const game = read("game.js");

  const online = game.slice(game.indexOf("function resetSceneForOnline"));
  assert.ok(
    online.indexOf("applyMatchLane(LaneCore.laneFromRoll(snapshot.laneRoll).slug)") <
      online.indexOf("match = structuredClone(snapshot.match)"),
    "an online match should take its lane from the served roll before the scene builds",
  );
  assert.match(game, /function startMatch\(\) \{\s*applyMatchLane\(selectedLaneSlug\);/,
    "a local match should return to the player's own saved lane");
  assert.doesNotMatch(game, /onlineSetup\.lane|laneSlug: *selectedLaneSlug/,
    "a local lane preference must never be published to an online room");
  assert.doesNotMatch(game, /renderer\.ready.*renderer\.setLane/,
    "a served lane must apply even while boot art is still loading");
});

test("lane artwork is resolved through the catalog rather than a hard-coded file", () => {
  const renderer = read("renderer.js");
  const laneCore = read("lane-core.js");

  assert.match(renderer, /async setLane\(/);
  assert.doesNotMatch(renderer, /assets\/lanes\/[^$]/,
    "renderer should never name a lane image directly");
  assert.match(laneCore, /assets\/lanes\/\$\{slug\}\.webp/);
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

test("the lane and default menu artwork use compressed runtime images", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");

  assert.match(html, /assets\/menu-splashes\/reina-sato\.webp/);
  assert.match(renderer, /root\.YamLaneCore\.getLane/);
  assert.match(renderer, /assets\/pins\/1\.webp/);
});

test("screen transitions reset the viewport for phone navigation", () => {
  assert.match(read("game.js"), /window\.scrollTo\(\{\s*top:\s*0/);
});

test("selection and identity surfaces use portraits while the lane uses throw frames", () => {
  const game = read("game.js");
  assert.match(game, /function characterPortrait/);
  assert.match(game, /characterPortrait\(bowler\.slug\)/);
  assert.match(game, /characterPortrait\(player\.characterSlug, playerSkinId\(player\)\)/);
  assert.match(game, /renderer\.setCharacter\(player\.characterSlug, playerSkinId\(player\)\)/);
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

test("strike and spare callouts pop a bowler pose clear of the callout text", () => {
  const html = read("index.html");
  const game = read("game.js");
  const css = read("styles.css");

  assert.match(html, /id=["']callout-pose["']/);
  assert.match(html, /id=["']callout-pose-art["']/);
  assert.match(game, /getCalloutPoseAssetPath/);
  assert.match(game, /function showCalloutPose/);

  const poseRule = css.match(/\.callout-pose\s*\{[^}]*\}/s)?.[0] ?? "";
  const calloutTop = Number(css.match(/\.callout\s*\{[^}]*top:\s*(\d+)%/s)?.[1]);
  const poseBottom = Number(poseRule.match(/bottom:\s*(\d+)%/)?.[1]);
  const poseTop = 100 - Number(poseRule.match(/height:\s*(\d+)%/)?.[1]) - poseBottom;

  assert.match(poseRule, /position:\s*absolute/);
  assert.match(poseRule, /pointer-events:\s*none/);
  assert.match(css, /\.callout-pose img\s*\{[^}]*object-fit:\s*contain/s);
  assert.match(css, /\.callout-pose\.is-visible\s*\{[^}]*opacity:\s*1/s);
  // The pose sits over the bowler sprite, so it needs a frame of its own to read as a popup.
  assert.match(poseRule, /border:\s*1px solid/);
  assert.match(poseRule, /border-radius:/);
  assert.match(poseRule, /background:/);
  assert.match(poseRule, /box-shadow:/);
  assert.ok(Number.isFinite(calloutTop) && Number.isFinite(poseTop));
  assert.ok(poseTop >= calloutTop + 20, "the pose must start well below the callout headline");
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
