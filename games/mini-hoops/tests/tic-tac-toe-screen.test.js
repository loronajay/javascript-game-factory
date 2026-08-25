import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, finish } from "./harness.js";

import { createBinTargets, binClearance, BIN_MOUTH_RADIUS } from "../scripts/sim/bin-physics.js";
import { binRings } from "../scripts/render/bin.js";
import { floorScreenY } from "../scripts/sim/projection.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameSource = fs.readFileSync(path.join(gameRoot, "scripts", "tic-tac-toe-game.js"), "utf8");
const shellSource = fs.readFileSync(path.join(gameRoot, "scripts", "init-game.js"), "utf8");
const gameCss = fs.readFileSync(path.join(gameRoot, "styles", "game.css"), "utf8");
const onlineCss = fs.readFileSync(path.join(gameRoot, "styles", "online.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
const setupViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "setup-view.js"), "utf8");
const onlineViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "online-view.js"), "utf8");

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

test("the loop stops when the screen does", () => {
  // Left running behind the menu, the CPU goes on taking its turns against a
  // board nobody is looking at.
  assert(/if \(active\) requestAnimationFrame\(frame\)/.test(gameSource), "the loop must be gated on the screen");
  assert(gameSource.includes("function exit()"), "the screen needs a way to be left");
  assert(shellSource.includes("ticTacToe.exit()"), "the cabinet must stop it on the way out");
});

// ---------------------------------------------------------------------------
// The bins are drawn from the collider. This is the other half of the rebuild:
// `open-bin.png` was rendered from a near-horizontal camera and this room's
// looks steeply down at the floor, so the painted mouth and the physical one
// could never be made to agree.
// ---------------------------------------------------------------------------

test("no bin sprite is loaded any more", () => {
  assert(!gameSource.includes("open-bin.png"), "the bin sprite could not match this camera; it must not come back");
  assert(gameSource.includes("drawBinBody"), "bins must be drawn from the collider's own numbers");
});

test("the drawn mouth is the mouth the physics tests, at every row", () => {
  // The whole defect, as one assertion. The sprite drew a 71px-wide bin around a
  // 94px physical mouth at the front row — the player aimed at one thing and the
  // sim scored another.
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

test("a bin's mouth is an open ellipse, not a slot", () => {
  // The sprite's painted mouth was 0.13 as tall as it was wide — a camera this
  // cabinet does not have. On this one the opening is genuinely open, which is
  // what lets a player judge the depth that POWER is choosing.
  for (const bin of createBinTargets()) {
    const { lip } = binRings(bin);
    const openness = lip.radiusY / lip.radiusX;
    assert(openness > 0.35, `bin ${bin.index} draws as a slot (${openness.toFixed(3)}), not an opening`);
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

test("a claimed cell keeps its bin", () => {
  // The mark used to REPLACE the bin, so claiming a cell deleted a solid object
  // out of a board the player is aiming at and the grid changed shape each turn.
  assert(gameSource.includes("drawBinMark"), "a claimed cell is a capped bin");
  assert(/drawBinBody\(ctx, bin\)/.test(gameSource), "every bin draws its body, claimed or not");
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

test("a tic-tac-toe hotseat puts the classic pickers away", () => {
  for (const id of ["setupModePanel", "setupDurationPanel", "setupBallPanel", "setupLocationPanel"]) {
    assert(indexHtml.includes(`id="${id}"`), `the setup screen needs #${id} to be addressable`);
    assert(setupViewSource.includes(`#${id}`), `the setup view must be able to hide #${id}`);
  }
  // Read from BOTH, or a player who once picked tic-tac-toe finds a solo setup
  // screen with no pickers left on it.
  assert(
    setupViewSource.includes('selection.playMode === "hotseat" && selection.gameType === "tic-tac-toe"'),
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
