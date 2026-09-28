import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const main = readFileSync(resolve(root, "scripts", "main.js"), "utf8");
const scene = readFileSync(resolve(root, "scripts", "scene.js"), "utf8");

test("the page offers a title with three modes: Quick Race, Grand Prix and Online", () => {
  for (const id of ["raceCanvas", "titlePanel", "petChoices", "modeQuick", "modeCup", "modeOnline", "careerLine", "raceHud", "raceLap", "raceResult", "touchControls"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /\.\.\/pet-games\//);
  assert.match(html, /id="raceProgress">Checkpoint 0 \/ 7/);
});

test("Quick Race picks a course, a field and a CPU level; the Grand Prix a cup and a class", () => {
  for (const id of ["quickPanel", "courseSelect", "fieldSize", "quickLevel", "startRace", "cupPanel", "cupChoices", "cupLevel", "startCup", "cupBoard", "cupStandings", "cupNext", "podiumPanel", "podium", "prizeLine", "onlinePanel", "resultReward"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
});

test("the page loads the shared Pet Games stylesheet and a versioned entry after the platform config", () => {
  assert.match(html, /pet-games\/shared\/pet-games-ui\.css/);
  assert.match(html, /platform-config\.mjs"><\/script>\s*<script type="module" src="scripts\/main\.js\?v=20260928-pet-online"/);
});

test("the entry loads farm-owned pets, advances on a fixed timestep and never lets rendering step a race", () => {
  assert.match(main, /loadFarmPets/);
  assert.match(main, /const TICK_SECONDS = 1 \/ 60/);
  assert.match(main, /while \(accumulator >= TICK_SECONDS\)/);
  assert.match(main, /stepRace\(run\.race, \{ player: controls \}, TICK_SECONDS\)/);
  assert.doesNotMatch(main.slice(main.indexOf("function render("), main.indexOf("function frame(")), /stepRace|\.tick\(/, "render() must not advance a race");
  assert.doesNotMatch(main, /getContext\("2d"\)/);
});

test("online play goes through the shared lobby client and only ever sends keys", () => {
  assert.match(main, /createPetLobbyClient\(BARNYARD_ONLINE/);
  assert.match(main, /lobbyClient\.sendInputs\(run\.session\.tick\(controls\)\)/);
  assert.doesNotMatch(main, /barnyard_(state|finish|result)/);
});

test("results are filed through the shared platform seam: quick races, cups and online races", () => {
  assert.match(main, /mode: "cpu"/);
  assert.match(main, /grandPrixSummary\(finished/);
  assert.match(main, /mode: "online"/);
  assert.match(main, /fileResult\(GAME_SLUG/);
});

test("the 3D world is the farm's: GLB animals, farm grass and farm props", () => {
  assert.match(scene, /THREE\.WebGLRenderer/);
  assert.match(scene, /GLTFLoader/);
  assert.match(scene, /farm\/assets\/animals/);
  assert.match(scene, /createSurfaceMaterial/);
  assert.match(scene, /findGround\(DEFAULT_GROUND_ID\)/);
});

test("catalog metadata classifies Barnyard Dash as a 3D solo and online cabinet", () => {
  const metadata = JSON.parse(readFileSync(resolve(root, "game.json"), "utf8"));
  assert.deepEqual(metadata.dimensions, ["3d"]);
  assert.deepEqual(metadata.play_modes, ["solo", "online"]);
  assert.equal(metadata.players, "1-8");
});

test("the menus keep the shared Farm Field Day presentation", () => {
  const css = readFileSync(resolve(root, "style.css"), "utf8");
  assert.match(html, /class="panel__header"/);
  assert.match(html, /class="event-chip"/);
  assert.match(html, /class="menu-rules"/);
  assert.match(css, /\.setup-panel::before/);
  assert.match(css, /\.event-chip/);
});
