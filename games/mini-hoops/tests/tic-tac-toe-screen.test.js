import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, finish } from "./harness.js";

import { createBinTargets, binClearance, BIN_MOUTH_RADIUS } from "../scripts/sim/bin-physics.js";
import { binRings, binSpriteLayout, paintedMouthEllipse } from "../scripts/render/bin.js";

import { floorScreenY } from "../scripts/sim/projection.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameSource = fs.readFileSync(path.join(gameRoot, "scripts", "tic-tac-toe-game.js"), "utf8");
const shellSource = fs.readFileSync(path.join(gameRoot, "scripts", "init-game.js"), "utf8");
const gameCss = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");
const onlineCss = fs.readFileSync(path.join(gameRoot, "styles", "online.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
const setupViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "setup-view.js"), "utf8");
const onlineViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "online-view.js"), "utf8");

// Measured off `open-bin.png` and mirrored from `render/bin.js`'s own SPRITE
// block. Deliberately a second copy: these tests exist to catch the placement
// drifting, and reading the numbers out of the file under test would let it
// drift with them.
const SPRITE_WIDTH = 1187;
const SPRITE_HEIGHT = 1326;
const SPRITE_MOUTH_CENTER_X = 590;
const SPRITE_MOUTH_CENTER_Y = 160;
const SPRITE_MOUTH_RADIUS_X = 468;
const SPRITE_MOUTH_RADIUS_Y = 116;
const SPRITE_BASE_Y = 1272;

suite("floor tic-tac-toe — a screen of the cabinet, drawn on the cabinet's camera");

// ---------------------------------------------------------------------------
// It is a screen, not a page. This is the fact the whole file hangs off: a
// separate document meant a separate <audio> element, and a page navigation
// destroys the one streaming the soundtrack. Entering a match cut the music
// dead, and the mode had no sound effects at all because `createGameAudio`
// lived in the cabinet it had left.
// ---------------------------------------------------------------------------

test("the stage page and its stylesheet are gone, and nothing points at them", () => {
  for (const orphan of [
    "tic-tac-toe-stage.html",
    path.join("styles", "tic-tac-toe-stage.css"),
    path.join("scripts", "staging", "tic-tac-toe-stage.js"),
  ]) {
    assert(!fs.existsSync(path.join(gameRoot, orphan)), `${orphan} must stay deleted`);
  }
  assert(!indexHtml.includes("tic-tac-toe-stage"), "the markup still references the deleted page");
});

test("the court is a section of index.html, reached through the router", () => {
  assert(indexHtml.includes('id="ticTacToeScreen"'), "the tic-tac-toe court needs a section");
  assert(indexHtml.includes('id="ticTacToeOnlineScreen"'), "its lobby needs a section");
  assert(shellSource.includes("SCREEN_TIC_TAC_TOE"), "the cabinet must route to it");
  assert(!/location\.href/.test(shellSource), "entering tic-tac-toe must not navigate");
});

test("both courts hold the viewport lock, so neither needs its own phone rules", () => {
  // `is-playing` used to be withheld from tic-tac-toe because its page carried a
  // heading the classic court has never had — and withholding it is what forced
  // a second stylesheet to undo `game.css` wholesale, for a DOM those rules were
  // not written for. As a court it simply takes the lock.
  const screens = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "screens.js"), "utf8");
  assert(screens.includes("COURT_SCREENS"), "the router must name which screens are courts");
  assert(/COURT_SCREENS\.includes\(current\)/.test(screens), "is-playing must follow COURT_SCREENS");
  assert(gameCss.includes(".hud-turn"), "the tic-tac-toe HUD additions belong in game.css");
  assert(onlineCss.includes(".ttt-online-panel"), "the lobby styles belong in online.css");
});

test("leaving for the menu silences the court but never the soundtrack", () => {
  // `silence()` stops the effects engine and deliberately does not touch music —
  // but calling it on the way INTO tic-tac-toe would cut the bounce of the shot
  // the player is watching, which is what a `next !== SCREEN_GAME` test did.
  assert(
    /if \(!COURT_SCREENS\.includes\(next\)\) audio\.silence\(\)/.test(shellSource),
    "audio.silence() must spare every court, not just the classic one",
  );
});

test("nothing but the router decides which screen is up", () => {
  // `onShowLobby` swaps the court for its online lobby, and it used to do that
  // unconditionally — so the boot-time render, which reports "no lobby", turned
  // the COURT on and the tic-tac-toe game view sat over the title screen from
  // the moment the cabinet loaded.
  const opens = shellSource.indexOf("onShowLobby:");
  const callback = shellSource.slice(opens, shellSource.indexOf("onLeave:", opens));
  assert(callback.includes("is-active"), "the test is reading the wrong block");
  assert(
    /screens\.current\(\)\s*!==\s*SCREEN_TIC_TAC_TOE\)\s*return;/.test(callback),
    "the lobby swap must be gated on tic-tac-toe already being the current screen",
  );
});

test("the loop stops when the screen does", () => {
  // Left running behind the menu, the CPU goes on taking its turns against a
  // board nobody is looking at.
  assert(/if \(active\) requestAnimationFrame\(frame\)/.test(gameSource), "the loop must be gated on the screen");
  assert(gameSource.includes("function exit()"), "the screen needs a way to be left");
  assert(shellSource.includes("ticTacToe.exit()"), "the cabinet must stop it on the way out");
});

// ---------------------------------------------------------------------------
// The bins are the game's own art, ANCHORED to the collider.
//
// `open-bin.png` is the object this mode is about and it stays. What is pinned
// here is the placement: the sprite's painted mouth has to land on the projected
// mouth, at every row's depth, and the sprite has to be foreshortened the way
// this camera foreshortens every other world height. Both were free-floating
// before — the drawn bin and the tested mouth simply disagreed.
// ---------------------------------------------------------------------------

test("the bins are drawn from the sprite", () => {
  assert(gameSource.includes("open-bin.png"), "the bin art is the bin");
  assert(/drawBinBody\(ctx, bin, art\.bin\)/.test(gameSource), "the sprite must be handed to the renderer");
});

test("the sprite's painted mouth lands on the projected mouth", () => {
  // Half the defect: the old placement worked back from a hand-tuned
  // visible-height ratio and drew a 71px-wide bin around a 94px physical mouth
  // at the front row — the player aimed at one thing and the sim scored another.
  for (const bin of createBinTargets()) {
    const layout = binSpriteLayout(bin);
    const { outer } = binRings(bin);
    const scaleX = layout.width / SPRITE_WIDTH;
    const left = layout.x + (SPRITE_MOUTH_CENTER_X - SPRITE_MOUTH_RADIUS_X) * scaleX;
    const right = layout.x + (SPRITE_MOUTH_CENTER_X + SPRITE_MOUTH_RADIUS_X) * scaleX;

    assert(
      Math.abs((right - left) / 2 - outer.radiusX) < 0.5,
      `bin ${bin.index}: the painted mouth must be as wide as the projected one`,
    );
    assert(
      Math.abs((left + right) / 2 - outer.cx) < 0.5,
      `bin ${bin.index}: the painted mouth must be centred on the projected one`,
    );
    assert(Math.abs(layout.splitY - outer.cy) < 0.5, `bin ${bin.index}: the near/far split is the mouth's centre line`);
  }
});

test("the sprite is drawn at ONE uniform scale — the art is never warped", () => {
  // The rule, as an assertion. Two earlier passes bent the picture to fit the
  // collider: one replaced the sprite with a procedural drum, the next stretched
  // its mouth band to open the ellipse. The collider is ours to choose and the
  // picture is not, so the sprite gets exactly one scale factor.
  for (const bin of createBinTargets()) {
    const layout = binSpriteLayout(bin);
    const scaleX = layout.width / SPRITE_WIDTH;
    const scaleY = layout.height / SPRITE_HEIGHT;
    assert(
      Math.abs(scaleX - scaleY) < 1e-9,
      `bin ${bin.index}: the sprite must keep its own aspect ratio (${scaleX} vs ${scaleY})`,
    );
  }
});

test("the art's own proportions already stand the bin on the floor", () => {
  // Worth pinning because it is the reason no second constant is needed. At the
  // scale the painted rim asks for, the painted base lands on the bin's own near
  // base edge — the art and `BIN_MOUTH_Y` describe the same object, so nothing
  // has to be nudged to make them agree.
  for (const bin of createBinTargets()) {
    const layout = binSpriteLayout(bin);
    const { base } = binRings(bin);
    const paintedBase = layout.y + SPRITE_BASE_Y * (layout.height / SPRITE_HEIGHT);
    const body = base.cy + base.radiusY - layout.splitY;
    assert(
      Math.abs(paintedBase - (base.cy + base.radiusY)) < body * 0.09,
      `bin ${bin.index}: the painted base drifted ${(paintedBase - base.cy - base.radiusY).toFixed(1)}px off the floor`,
    );
  }
});

test("the mouth is only ever mismatched front-to-back, and the gap is recorded", () => {
  // THE ONE PLACE THE ART AND THE COLLIDER CANNOT AGREE. The sprite was rendered
  // from a nearly horizontal camera — a painted mouth 0.248 as tall as it is
  // wide — and a horizontal circle through this camera is 0.42 to 0.59. Sideways
  // they match exactly, which is where most lip strikes happen; front-to-back
  // the collider is up to 2.4x deeper than the paint, and that is not closeable:
  // a mouth whose world depth matched the paint would be 0.13 across and the
  // ball is 0.156. The overlay draws both so it can be seen rather than argued.
  for (const bin of createBinTargets()) {
    const painted = paintedMouthEllipse(bin);
    const { outer } = binRings(bin);
    assert(
      Math.abs(painted.radiusX - outer.radiusX) < 0.5,
      `bin ${bin.index}: sideways, the paint and the collider must agree exactly`,
    );
    assert(
      Math.abs(painted.cx - outer.cx) < 0.5 && Math.abs(painted.cy - outer.cy) < 0.5,
      `bin ${bin.index}: the two mouths must at least be concentric`,
    );
    const ratio = outer.radiusY / painted.radiusY;
    assert(ratio > 1, `bin ${bin.index}: the collider is the deeper of the two`);
    assert(ratio < 2.5, `bin ${bin.index}: the depth gap grew to ${ratio.toFixed(2)}x — re-check the camera`);
  }
});

test("the colliders can be drawn over the art", () => {
  // Not a nicety. "The rim is not aligned to the art" is a claim about two things
  // that cannot both be seen at once, and the overlay is the only way to settle
  // it. It must stay reachable and stay OFF by default.
  assert(gameSource.includes("drawBinColliders"), "the court must be able to draw its colliders");
  assert(gameSource.includes("let showColliders = false"), "the overlay must default to off");
  assert(/event\.key !== "c"/.test(gameSource), "C is the toggle");
});

test("a claimed cell is tinted, because its glyph can be hidden by a nearer bin", () => {
  // Measured, not guessed: from this camera a bin standing in the row in front
  // covers the floor behind it at EVERY bin height down to 12cm. The glyph stays
  // on the concrete where it belongs; the cell's own panel carries the colour so
  // the board still reads.
  const grid = gameSource.slice(gameSource.indexOf("function drawGrid()"));
  assert(/claimed === "o"/.test(grid), "the claimed cell must be tinted by its owner");
});

test("the make window stays inside the lip at every row", () => {
  for (const bin of createBinTargets()) {
    const { lip, clear } = binRings(bin);
    const expected = (BIN_MOUTH_RADIUS / binClearance(bin)) * clear.radiusX;
    assert(
      Math.abs(lip.radiusX - expected) < 0.5,
      `bin ${bin.index}: the drawn lip and the clearance circle must share one scale`,
    );
    assert(clear.radiusX < lip.radiusX, `bin ${bin.index}: the make window is inside the lip`);
    assert(clear.radiusY > 0, `bin ${bin.index}: the mouth must have real front-to-back depth on screen`);
  }
});

test("rows recede through the real room camera", () => {
  const bins = createBinTargets();
  const far = bins.find((bin) => bin.row === 0 && bin.column === 1);
  const middle = bins.find((bin) => bin.row === 1 && bin.column === 1);
  const near = bins.find((bin) => bin.row === 2 && bin.column === 1);

  assert(far.z > middle.z && middle.z > near.z, "row depth should run away from the player");
  assert(floorScreenY(far.z) < floorScreenY(near.z), "far rows should draw higher");
  assert(binRings(far).lip.radiusX < binRings(near).lip.radiusX, "far bins should draw smaller");
});

test("the ball sinks into a bin instead of blinking out at the mouth plane", () => {
  assert(gameSource.includes("drawSinkingBall"), "a captured ball must still be drawn");
  assert(gameSource.includes("ctx.clip()"), "it is clipped to the mouth, which is what reads as sinking");
});

test("a claimed cell loses its bin and keeps the mark", () => {
  // The mark lies flat on the floor WHERE THE BIN WAS. That is the mode's own
  // rule, and it is also the honest picture: `tick` steps the ball against the
  // open bins only, so a bin left standing on a claimed cell would be a
  // solid-looking target the ball passes straight through.
  assert(gameSource.includes("drawFloorMark"), "a claimed cell draws its mark on the floor");
  assert(!gameSource.includes("drawBinMark"), "the mark does not cap a bin that is still standing");
  const claimed = gameSource.slice(gameSource.indexOf("drawFloorMark(ctx, bin"), gameSource.lastIndexOf("drawBinBody"));
  assert(claimed.includes("continue;"), "a claimed cell must skip its bin entirely");
});

// ---------------------------------------------------------------------------
// Gameplay contract, carried over unchanged.
// ---------------------------------------------------------------------------

test("gameplay starts from the ball and shows the normal trajectory guide", () => {
  assert(!gameSource.includes("closestOpenBin"), "shooting must not start by clicking a bin");
  assert(!gameSource.includes("drawSelection"), "the fake selection ring must not be rendered");
  assert(gameSource.includes("drawAim"), "tic-tac-toe must reuse the normal aiming overlay");
  assert(gameSource.includes("trajectoryPoints"), "tic-tac-toe must preview the physical shot arc");
});

test("the room and the ball this mode fixes have exactly one owner", () => {
  assert(gameSource.includes("TIC_TAC_TOE_FIXED_SETUP"), "the screen must read the fixed setup rather than restating it");
  assert(!/"warehouse"/.test(gameSource), "the room id must not be a literal in the composition root");
  assert(!/BALL_ID = "/.test(gameSource), "the ball id must not be a literal in the composition root");
  assert(setupViewSource.includes("TIC_TAC_TOE_FIXED_SETUP"), "the setup screen must describe the mode from the same record");
});

test("a tic-tac-toe setup puts the classic pickers away", () => {
  for (const id of ["setupModePanel", "setupDurationPanel", "setupBallPanel", "setupLocationPanel"]) {
    assert(indexHtml.includes(`id="${id}"`), `the setup screen needs #${id} to be addressable`);
    assert(setupViewSource.includes(`#${id}`), `the setup view must be able to hide #${id}`);
  }
  // Read from BOTH, or a player who once picked tic-tac-toe finds the online
  // setup — which has a Game select of its own — with no pickers left on it.
  assert(
    setupViewSource.includes('selection.playMode !== "online" && selection.gameType === "tic-tac-toe"'),
    "the tic-tac-toe setup must be gated on the play mode as well as the game type",
  );
});

test("an online config row that is hidden actually hides", () => {
  // `.online-config label` sets `display: grid`, which beats the UA stylesheet's
  // `[hidden]` — so `toggleAttribute("hidden")` alone changes nothing on screen.
  assert(onlineViewSource.includes('toggleAttribute("hidden"'), "the online view must be able to hide a config row");
  assert(/\.online-config label\[hidden\][^{]*{\s*display: none/.test(onlineCss), "a hidden config row needs its display reset");
  assert(indexHtml.includes('id="onlineConfigNote"'), "the note describing those rows must be addressable too");
});

finish();
