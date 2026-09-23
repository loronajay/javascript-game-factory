import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLayoutStore } from "../arcade-room-store.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const html = readFileSync(resolve(repoRoot, "farm", "index.html"), "utf8");
const source = readFileSync(resolve(repoRoot, "js", "farm.mts"), "utf8");
const worldSource = readFileSync(resolve(repoRoot, "js", "farm-world.mts"), "utf8");

test("the farm page ships the shell the composition root requires", () => {
  for (const id of ["farmCanvas", "farmPrompt", "startGate", "enterFarm", "farmStatus", "fullscreenFarm", "farmTitle", "farmEyebrow", "startTag", "startHeading", "startCopy", "farmOwnerLink", "openPets", "petsPanel", "closePets", "petList", "speciesGrid", "petName", "petsStatus", "petsCount"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(source, new RegExp(`#${id}"`), `farm.mts reads #${id}`);
  }
  // The API base URL global must be in place before the farm module runs.
  assert.match(html, /platform-config\.mjs"><\/script>\s*<script type="module" src="\.\.\/js\/farm\.mjs"/);
  assert.match(html, /id="farmOwnerLink"[^>]*hidden/);
});

test("the farm is account-backed and visitable through the room's generic store under its own slug", () => {
  assert.match(source, /createLayoutStore\(FARM_LAYOUT_SPEC, \{ visitPlayerId, storage: null \}\)/, "farm progress must never use the shared localStorage cache");
  assert.match(source, /slug: "farm"/);
  assert.match(source, /cacheKey: farmCacheKey/);
  assert.match(source, /normalize: normalizeFarmLayout/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\("id"\)/);
  assert.doesNotMatch(source, /localStorage/, "the store owns the cache");
  assert.match(source, /const canManageFarm = !visiting && layoutStore\.accountBacked && loaded\.source === "account"/);
  assert.doesNotMatch(source, /Saved on this device|Kept on this device/, "farm saves never claim a device fallback");
});

test("leaving the farm checkpoints its running clock with an unload-safe account save", () => {
  assert.match(source, /window\.addEventListener\("pagehide", \(\) => \{\s*if \(canManageFarm\) void layoutStore\.save\(progressedLayout\(\), \{ keepalive: true \}\)/);
});

test("the shared layout store forwards unload-safe save options to the account", async () => {
  const calls = [];
  const api = {
    isConfigured: true,
    fetchGameGarage: async () => ({ garage: { clock: 480 } }),
    saveGameGarage: async (...args) => { calls.push(args); return { ok: true }; },
    fetchGamePublicLoadout: async () => null,
    loadPlayerProfile: async () => null,
  };
  const spec = {
    slug: "farm",
    cacheKey: () => "unused",
    normalize: (value) => value,
    createDefault: () => ({ clock: 480 }),
  };
  const store = createLayoutStore(spec, {
    session: { authenticated: true, playerId: "farmer" },
    api,
    storage: null,
  });

  await store.save({ clock: 735 }, { keepalive: true });

  assert.deepEqual(calls[0], ["farm", { clock: 735 }, { keepalive: true }]);
});

const bodySource = readFileSync(resolve(repoRoot, "js", "farm-body.mts"), "utf8");

test("the farm walks with the room's walker on a fixed timestep and never re-implements movement", () => {
  // The page steps the BODY (height, ladders, seats); the body steps the room's walker for the flat part.
  assert.match(source, /stepFarmBody\(player, body, keys, dt, \{ bounds: walkerBounds, obstacles, platforms, ladders \}\)/);
  assert.match(bodySource, /stepWalker\(pose, keys, dt, world\.bounds, bodyObstacles\(world\.obstacles, body\.y\)\)/);
  assert.doesNotMatch(source, /stepWalker/, "the page never walks around the body");
  assert.match(source, /lookWalker\(player, event\.movementX, event\.movementY\)/);
  assert.match(source, /const TICK_SECONDS = 1 \/ 60/);
  assert.match(source, /while \(accumulator >= TICK_SECONDS\)/);
  assert.doesNotMatch(source, /KeyW|ArrowUp|ShiftLeft/, "key-to-direction mapping lives in the walker");
});

test("the world draws the field with the room's procedural surface renderer and no assets", () => {
  assert.match(worldSource, /createSurfaceMaterial\(THREE, groundStyle/);
  assert.match(worldSource, /applySurfaceMaterial\(THREE, ground, style, span\)/);
  assert.doesNotMatch(worldSource, /TextureLoader|GLTFLoader|\.png|\.jpg|\.glb/);
});

test("every platform surface offers the farm chip beside the arcade chip", () => {
  const grid = readFileSync(resolve(repoRoot, "grid.html"), "utf8");
  const me = readFileSync(resolve(repoRoot, "me", "index.html"), "utf8");
  const player = readFileSync(resolve(repoRoot, "player", "index.html"), "utf8");
  assert.match(grid, /id="myFarmLink"[^>]*href="farm\/"/);
  assert.match(me, /id="myFarmLink"[^>]*href="\.\.\/farm\/"/);
  assert.match(player, /id="playerFarmLink"[^>]*hidden/);
  const playerPage = readFileSync(resolve(repoRoot, "js", "player-page", "page.mts"), "utf8");
  assert.match(playerPage, /wirePlayerFarmLink\(doc, \{ requestedPlayerId, viewerPlayerId/);
});

test("pets are a pure sim the page ticks on the fixed timestep, drawn by bodies, adopted through an owner-only panel", () => {
  assert.match(source, /petSim\.tick\(TICK_SECONDS, player\)/);
  assert.match(source, /petBodies\.sync\(petSim\.pets\(\), frameSeconds\)/, "bodies ease per frame, the sim steps per tick");
  assert.match(source, /obstacles: \(\) => obstacles/, "pets and the walker share one obstacle list");
  assert.match(source, /keepOut: \(\) => keepOutBoxes\(layout\)/, "pets stay out of every building and pond");
  assert.match(source, /water: \(\) => waterRegions\(layout\)/, "swimmers live in the ponds");
  assert.match(source, /if \(!canManageFarm\) openPetsButton\.hidden = true/, "pets stay read-only unless the farm loaded from the account database");
  assert.match(source, /if \(!farmEntered \|\| petsPanel\.isOpen\(\) \|\| inventoryPanel\.isOpen\(\) \|\| farmEditor\.isEditing\(\) \|\| napDialog\.open \|\| napRemainingMinutes > 0\) return;/, "no walking under a panel or while napping");
  // E on a pet lifts it into the arms (with a heart), and E with a pet in hand sets it down ahead where it fits — through the pure sim and rules.
  assert.match(source, /petSim\.pickUp\(nearbyPet\.instanceId\)/);
  assert.match(source, /petBodies\.showHeart\(held\.instanceId\);\s*petSim\.attention\(held\.instanceId\)/, "the heart and the look back come on the put-down, not in the player's face on the pick-up");
  assert.match(source, /petSim\.putDown\(held\.instanceId, spot\)/);
  assert.match(source, /findPutDownSpot\(pose, findAnimal\(held\.speciesId\)\?\.radius \?\? 0\.5, \(spot\) => petSim\.canStand\(held\.speciesId, spot\)\)/, "the drop spot comes from the pure rule at the species' own radius, the sim saying what fits");
  assert.match(source, /if \(editing\) dropCarried\(\)/, "build mode empties the arms");
  assert.match(source, /if \(held && putDownFits && doorInReach && openDoors\.has\(doorInReach\.doorId\)\) doorInReach = null/, "an open door yields to the put-down; a shut one is opened first");
  assert.match(source, /petSim\.tick\(TICK_SECONDS, player\)/, "the sim gets the whole pose, so a carried pet rides the yaw");
  // Every layout change goes through one path that applies, syncs and saves.
  assert.match(source, /async function persistLayout/);
  assert.match(source, /applyLayout\(next\);\s*farmEditor\.replaceLayout\(next\);\s*return describeSave\(await layoutStore\.save\(layout\)\)/);
});

test("every building's door is worked with E, at its own reach, and the door is solid only while shut", () => {
  assert.match(source, /obstacles = farmObstacles\(layout, \{ openDoors \}\)/);
  assert.match(source, /if \(doorInReach\) \{\s*toggleDoors\(\);\s*return true;/);
  assert.match(source, /if \(event\.code === "KeyE" && !event\.repeat && farmEntered\) \{\s*if \(interact\(\)\) event\.preventDefault\(\);/);
  // Doors are per building AND per door fixture, found from the layout with the catalog's reach — the nearest in reach wins, so a
  // stall door beside the stable's own is the one E works — and a building that leaves takes its open doors with it.
  assert.match(source, /nearestDoor\(doorRows\(layout\), pose, \(entry\) => canWorkDoor\(pose, entry\.door, entry\.reach\)\)/);
  assert.match(source, /getDoorPrompt\(openDoors\.has\(doorInReach\.doorId\), doorInReach\)/, "the prompt names the door, keyed by door id");
  assert.doesNotMatch(source, /barnDoor|BARN/, "the page knows buildings, not the barn");
  assert.match(source, /if \(!world\.doorsFor\(doorId\)\) openDoors\.delete\(doorId\)/);
});

test("build mode is the shared editor frame over the farm's own rules: owner-only, B to toggle, every change through one seam", () => {
  const editorSource = readFileSync(resolve(repoRoot, "js", "farm-editor.mts"), "utf8");
  const panelSource = readFileSync(resolve(repoRoot, "js", "farm-editor-panel.mts"), "utf8");
  const css = readFileSync(resolve(repoRoot, "farm", "farm.css"), "utf8");
  // The page links the shared frame stylesheet and carries the shared root class.
  assert.match(html, /href="\.\.\/css\/space-editor\.css"/);
  assert.match(html, /id="farmEditor" class="space-editor farm-editor"[^>]*hidden/);
  for (const id of ["editFarm", "cameraViews", "undoFarmEdit", "resetFarmLayout", "saveFarmLayout", "finishFarmEditing", "farmEditorTabs", "farmEditorDrawer", "farmEditorTabPanels", "groundPicker", "farmCatalogTitle", "farmCatalogHint", "farmCatalog", "farmPlaced", "farmInspector", "rotateFarmLeft", "rotateFarmRight", "farmEditorStatus"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(source, new RegExp(`#${id}"`), `farm.mts reads #${id}`);
  }
  for (const tab of ["ground", "fence", "building", "plant", "water", "prop"]) assert.match(html, new RegExp(`data-tab="${tab}"`));
  // The editor is built on the shared camera controller, history and gizmos; the farm supplies only its rules and panel.
  assert.match(editorSource, /createEditorCameraController\(\{/);
  assert.match(editorSource, /createEditHistory<FarmLayout>\(\{ equal: farmLayoutsEqual \}\)/);
  assert.match(editorSource, /createEditorGizmos\(THREE, scene\)/);
  assert.match(editorSource, /export const FARM_EDITOR_TOGGLE_KEY = "KeyB"/);
  assert.doesNotMatch(editorSource, /localStorage/);
  assert.match(editorSource, /persist\(layout\)/);
  // Stretch from one end with the far end anchored; a typed length grows about the middle; both are preview/commit gestures.
  assert.match(editorSource, /stretchFarmDecorEnd\(layout, row\.instanceId, handleDrag\.end, point, FARM_BOUNDS, snapThreshold\(event\)\)/);
  assert.match(editorSource, /editLength\(result, "preview"\)/);
  assert.match(panelSource, /addEventListener\("input", \(event\) => lengthEdit\(event, "preview"\)\)/);
  assert.match(panelSource, /addEventListener\("change", \(event\) => lengthEdit\(event, "commit"\)\)/);
  // The inspector is built once per selection and patched; the panel never touches THREE.
  assert.match(panelSource, /if \(!inspector \|\| inspector\.instanceId !== row\.instanceId\) inspector = buildInspector\(row, definition\)/);
  assert.doesNotMatch(panelSource, /^import[^;]*three|new THREE\./im);
  assert.match(panelSource, /data-clear-selection/);
  // A visitor never builds; the page routes every editor change through applyLayout and hands the walker the editor's obstacles.
  assert.match(source, /canEnter: \(\) => canManageFarm && farmEntered && !petsPanel\.isOpen\(\) && !inventoryPanel\.isOpen\(\) && !napDialog\.open && napRemainingMinutes <= 0/);
  assert.match(source, /onLayoutChange: \(next\) => applyLayout\(next\)/);
  assert.match(source, /if \(!farmEntered \|\| petsPanel\.isOpen\(\) \|\| inventoryPanel\.isOpen\(\) \|\| farmEditor\.isEditing\(\) \|\| napDialog\.open \|\| napRemainingMinutes > 0\) return;/, "no walking under build mode or while napping");
  assert.match(source, /if \(!farmEditor\.isEditing\(\)\) applyCamera\(\)/, "the editor owns the camera while building");
  assert.match(css, /\.is-visiting #editFarm \{ display: none; \}/);
  assert.match(css, /\.is-editing \.farm-header/);
});
