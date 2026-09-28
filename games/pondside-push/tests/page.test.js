import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const main = readFileSync(resolve(root, "scripts", "main.js"), "utf8");
const arena = readFileSync(resolve(root, "scripts", "arena.js"), "utf8");

test("the page offers pet selection, Quick Match and Online, a score line and a Pet Games return path", () => {
  for (const id of ["arenaCanvas", "titlePanel", "petChoices", "modeQuick", "modeOnline", "careerLine", "quickPanel", "fieldSize", "quickLevel", "startMatch", "onlinePanel", "scoreboard", "roundResult", "resultReward", "touchControls"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /\.\.\/pet-games\//);
  assert.match(html, /First to 3/);
  assert.match(html, /pet-games\/shared\/pet-games-ui\.css/);
  assert.match(html, /scripts\/main\.js\?v=20260928-pet-online/);
});

test("a local match is a whole session on a fixed timestep; rendering never steps it", () => {
  assert.match(main, /const TICK_SECONDS = 1 \/ 60/);
  assert.match(main, /while \(accumulator >= TICK_SECONDS\)/);
  assert.match(main, /stepSession\(run\.session, \{ player: playerControls\(\) \}, TICK_SECONDS\)/);
  const loop = main.slice(main.indexOf("function loop("), main.indexOf("function resize("));
  assert.match(loop, /tick\(\)/);
  assert.doesNotMatch(loop.slice(loop.indexOf("const dt")), /stepSession|stepMatch/, "drawing must not advance the match");
});

test("online play goes through the shared lobby client and only ever sends keys", () => {
  assert.match(main, /createPetLobbyClient\(PONDSIDE_ONLINE/);
  assert.match(main, /lobbyClient\.sendInputs\(run\.brawl\.tick\(playerControls\(\)\)\)/);
  assert.match(main, /mode: "online"/);
  assert.match(main, /mode: "cpu"/);
});

test("the 3D arena uses real farm animals and farm grass", () => {
  assert.match(arena, /GLTFLoader/);
  assert.match(arena, /farm\/assets\/animals/);
  assert.match(arena, /createSurfaceMaterial/);
  assert.match(arena, /findGround\(DEFAULT_GROUND_ID\)/);
  assert.match(arena, /yawForFacing\(facingX, facingY\)/);
  assert.doesNotMatch(arena, /getContext\(["']2d/);
});

test("the menus keep the shared Farm Field Day presentation", () => {
  const css = readFileSync(resolve(root, "style.css"), "utf8");
  assert.match(html, /class="panel__header"/);
  assert.match(html, /class="event-chip"/);
  assert.match(html, /class="menu-rules"/);
  assert.match(html, /Pick a pet, hold your line, and send the competition swimming/);
  assert.match(css, /\.setup-panel::before/);
  assert.match(css, /\.menu-rules/);
});
