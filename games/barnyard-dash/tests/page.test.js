import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

test("the 3D cabinet exposes pet and field-size selection, race HUD, controls, and a farm return path", () => {
  const html = readFileSync(resolve(root, "index.html"), "utf8");
  for (const id of ["raceCanvas", "petChoices", "fieldSize", "startRace", "raceHud", "raceLap", "raceResult", "touchControls"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /\.\.\/\.\.\/farm\//);
  assert.match(html, /platform-config\.mjs"><\/script>\s*<script type="module" src="scripts\/main\.js\?v=20260925-hurdle-upgrade-2"/);
  assert.match(html, /id="raceProgress">Checkpoint 0 \/ 7/);
  assert.doesNotMatch(html, /id="raceProgress">Gate/);
});

test("the browser entry loads farm-owned pets and advances gameplay on a fixed timestep", () => {
  const source = readFileSync(resolve(root, "scripts", "main.js"), "utf8");
  assert.match(source, /loadFarmPets/);
  assert.match(source, /THREE\.WebGLRenderer/);
  assert.match(source, /GLTFLoader/);
  assert.match(source, /farm\/assets\/animals/);
  assert.match(source, /cpuFieldFor\(selectedPet, fieldSize - 1\)/);
  assert.match(source, /const TICK_SECONDS = 1 \/ 60/);
  assert.match(source, /while \(accumulator >= TICK_SECONDS\)/);
  assert.match(source, /stepRace\(race, controls, TICK_SECONDS\)/);
  assert.match(source, /Lap \$\{race\.player\.lap\} \/ \$\{race\.totalLaps\}/);
  assert.match(source, /`Checkpoint \$\{Math\.min\(race\.player\.checkpoint/);
  assert.doesNotMatch(source, /getContext\("2d"\)/);
});

test("catalog metadata classifies Barnyard Dash as a 3D solo cabinet", () => {
  const metadata = JSON.parse(readFileSync(resolve(root, "game.json"), "utf8"));
  assert.deepEqual(metadata.dimensions, ["3d"]);
  assert.deepEqual(metadata.play_modes, ["solo"]);
  assert.equal(metadata.players, "1-8");
});
