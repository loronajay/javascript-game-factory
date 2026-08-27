import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";
import { COURT_SCREENS, SCREENS, SCREEN_TRICK_SHOT } from "../scripts/ui/screens.js";

suite("trick-shot lab — editor screen and reusable rendering seam");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shell = fs.readFileSync(path.join(root, "scripts", "init-game.js"), "utf8");
const game = fs.readFileSync(path.join(root, "scripts", "trick-shot-game.js"), "utf8");
const renderer = fs.readFileSync(path.join(root, "scripts", "render", "trick-shot.js"), "utf8");

test("the lab is a routed court reached from the marquee", () => {
  assertEqual(SCREEN_TRICK_SHOT, "trickshot");
  assert(SCREENS.includes(SCREEN_TRICK_SHOT));
  assert(COURT_SCREENS.includes(SCREEN_TRICK_SHOT));
  assert(html.includes('id="trickShotScreen"'));
  assert(html.includes('data-command="trickshot"'));
  assert(shell.includes("bootTrickShot"));
});

test("the editor exposes creation, tuning, testing, and a named shot bank", () => {
  for (const id of [
    "trickShotCourt", "trickAddBoard", "trickAddCannon", "trickResetBall",
    "trickDepth", "trickAngle", "trickPitch", "trickPower", "trickDelay",
    "trickShotName", "trickSave", "trickNew", "trickBankList",
  ]) {
    assert(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test("piece art and hit testing use the cabinet's one projection", () => {
  assert(renderer.includes('from "../sim/projection.js"'));
  assert(renderer.includes("projectPoint("));
  assert(!renderer.includes("PROJECTION_ORIGIN_X"), "the piece renderer must not restate the camera");
});

test("the lab resolves sandbox contacts on physics substeps, not just rendered frames", () => {
  assert(game.includes("PHYSICS_SUBSTEP_SECONDS"));
  assert(game.includes("stepTrickShotPieces("));
  assert(game.includes("stepBall("));
  assert(/while \(accumulator >= TICK_MS\)/.test(game));
});

finish();
