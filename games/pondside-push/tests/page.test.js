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
  assert.match(html, /scripts\/main\.js\?v=20260926-impact-grass/);
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
  assert.match(source, /stepMatch\(match, controls, TICK_SECONDS\)/);
  assert.doesNotMatch(source, /getContext\(["']2d/);
});
