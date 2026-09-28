import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("the cabinet exposes pet selection, best-of-five score, controls, and Pet Games return path", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  for (const id of ["arenaCanvas", "petChoices", "startMatch", "scoreboard", "roundResult", "touchControls"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /\.\.\/pet-games\//);
  assert.match(html, /First to 3/);
  assert.match(html, /scripts\/main\.js\?v=20260927-countdown/);
});

test("the 3D browser entry uses real farm animals and a fixed timestep", () => {
  const source = readFileSync(resolve(root, "scripts", "main.js"), "utf8");
  assert.match(source, /GLTFLoader/);
  assert.match(source, /farm\/assets\/animals/);
  assert.match(source, /createSurfaceMaterial/);
  assert.match(source, /findGround\(DEFAULT_GROUND_ID\)/);
  assert.match(source, /yawForFacing\(player\.facingX, player\.facingY\)/);
  assert.match(source, /const TICK_SECONDS = 1 \/ 60/);
  assert.match(source, /while \(accumulator >= TICK_SECONDS\)/);
  assert.match(source, /isCountdownBlocking\(roundCountdown\)/);
  assert.match(source, /stepRoundCountdown\(roundCountdown, TICK_SECONDS\)/);
  assert.match(source, /stepMatch\(match, controls, TICK_SECONDS\)/);
  assert.doesNotMatch(source, /getContext\(["']2d/);
});

test("the pre-match menu uses the shared Farm Field Day presentation", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  const css = readFileSync(resolve(root, "style.css"), "utf8");

  assert.match(html, /class="panel__header"/);
  assert.match(html, /class="event-chip"/);
  assert.match(html, /class="menu-rules"/);
  assert.match(html, /Pick a pet, hold your line, and send the competition swimming/);
  assert.match(css, /\.setup-panel::before/);
  assert.match(css, /\.event-chip/);
  assert.match(css, /\.menu-rules/);
});
