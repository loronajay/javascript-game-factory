import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLayoutStore } from "../arcade-room-store.mjs";
import { PET_INTERACTIONS, getPetInteraction, getPetInteractionPrompt } from "../farm-interaction.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const html = readFileSync(resolve(repoRoot, "farm", "index.html"), "utf8");
const source = readFileSync(resolve(repoRoot, "js", "farm.mts"), "utf8");
const worldSource = readFileSync(resolve(repoRoot, "js", "farm-world.mts"), "utf8");

test("pet, feed, carry and play remain separate registered interactions", () => {
  assert.deepEqual(PET_INTERACTIONS.map(({ id, code }) => [id, code]), [["pet", "KeyE"], ["feed", "KeyG"], ["pick-up", "KeyC"], ["play", "KeyY"], ["call", "KeyH"]]);
  assert.equal(getPetInteraction("KeyE")?.id, "pet");
  assert.equal(getPetInteraction("KeyG")?.id, "feed");
  assert.equal(getPetInteraction("KeyC")?.id, "pick-up");
  assert.equal(getPetInteraction("KeyY")?.id, "play");
  assert.equal(getPetInteraction("KeyH")?.id, "call");
  assert.equal(getPetInteractionPrompt("Biscuit", { canPickUp: true, canFeed: true, canPlay: true }), "E Pet Biscuit · G Feed · C Pick up · Y Play · H Call");
  assert.equal(getPetInteractionPrompt("Bubbles", { canPickUp: true, canFeed: false, canPlay: false }), "E Pet Bubbles · C Pick up · H Call", "aquatic pets can be carried too");
});

test("seed cards request fully grown crop portraits instead of text glyphs", () => {
  const inventorySource = readFileSync(resolve(repoRoot, "js", "farm-inventory-panel.mts"), "utf8");
  assert.match(source, /createCropThumbnails\(THREE\)/);
  assert.match(source, /thumbnail: cropThumbnails\.get/);
  assert.match(inventorySource, /seed-card__image/);
  assert.doesNotMatch(inventorySource, /crop\.title\.slice/);
});

test("the farm page ships the shell the composition root requires", () => {
  for (const id of ["farmCanvas", "farmPrompt", "startGate", "enterFarm", "farmStatus", "fullscreenFarm", "farmTitle", "farmEyebrow", "startTag", "startHeading", "startCopy", "starterDogForm", "starterDogName", "nameStarterDog", "onboardingStatus", "farmOwnerLink", "openPets", "petsPanel", "closePets", "petList", "speciesGrid", "petName", "petsStatus", "petsCount", "suppliesGrid"]) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
    assert.match(source, new RegExp(`#${id}"`), `farm.mts reads #${id}`);
  }
  // The API base URL global must be in place before the farm module runs.
  assert.match(html, /platform-config\.mjs"><\/script>\s*<script type="module" src="\.\.\/js\/farm\.mjs"/);
  assert.match(html, /id="farmOwnerLink"[^>]*hidden/);
});

test("the farm is playable signed in or out, saves locally or to a loaded account, and keeps visits read-only", () => {
  assert.match(source, /createLayoutStore\(FARM_LAYOUT_SPEC, \{ visitPlayerId \}\)/, "signed-out farms use the store's device persistence while signed-in farms remain account-backed");
  assert.match(source, /slug: "farm"/);
  assert.match(source, /cacheKey: farmCacheKey/);
  assert.match(source, /normalize: normalizeFarmLayout/);
  assert.match(source, /new URLSearchParams\(location\.search\)\.get\("id"\)/);
  assert.doesNotMatch(source, /localStorage/, "the store owns the cache");
  assert.match(source, /const canManageFarm = !visiting/);
  assert.match(source, /const canPersistFarm = canManageFarm && \(!layoutStore\.ownerPlayerId \|\| \(layoutStore\.accountBacked && loaded\.source === "account"\)\)/);
  assert.match(source, /if \(!canPersistFarm\) return "Session only · reload when the farm database is available to save safely\."/);
  assert.match(source, /Saved on this device · sign in to keep farm progression with your account\./);
});

test("leaving the farm checkpoints its running clock with an unload-safe account save", () => {
  assert.match(source, /window\.addEventListener\("pagehide", \(\) => \{\s*if \(canPersistFarm\) void layoutStore\.save\(progressedLayout\(\), \{ keepalive: true \}\)/);
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
  assert.match(source, /if \(visiting\) openPetsButton\.hidden = true/, "only visited farms hide owner controls");
  assert.match(source, /if \(!farmEntered \|\| petsPanel\.isOpen\(\) \|\| inventoryPanel\.isOpen\(\) \|\| farmEditor\.isEditing\(\) \|\| napDialog\.open \|\| napRemainingMinutes > 0\) return;/, "no walking under a panel or while napping");
  // Pet actions are distinct: E pets with affection, C carries, and E with a pet in hand sets it down ahead where it fits.
  assert.match(source, /getPetInteractionPrompt\(nearbyPet\.name, \{ canPickUp, canFeed, canPlay \}\)/);
  assert.doesNotMatch(source, /habitat !== "water"/, "the page does not hide carry from aquatic pets");
  assert.match(source, /function interactWithPet\(action: PetInteractionId\)/);
  assert.match(source, /const checkpoint = advancePetNeeds\(layout, clockMinutes\)/, "handling checkpoints elapsed care before changing a profile");
  assert.match(source, /reactToPetInteraction\(pet\.profile, pet\.speciesId, action === "pick-up" \? "carry" : action, checkpoint\.decor\)/, "handling is decided by the pure trait-aware reaction rule");
  assert.match(source, /if \(action === "pet" \|\| action === "play"\) \{\s*petBodies\.showHeart\(nearbyPet\.instanceId\);\s*petSim\.attention\(nearbyPet\.instanceId\)/, "accepted petting and play own the heart and attention response");
  assert.match(source, /getPetInteraction\(event\.code\)/, "keyboard dispatch comes from the pet interaction registry");
  assert.match(source, /feedPet\(layout, nearbyPet\.instanceId, clockMinutes\)/, "feeding advances and persists through the pure needs action");
  assert.match(source, /petSim\.pickUp\(nearbyPet\.instanceId\)/);
  assert.doesNotMatch(source, /petBodies\.showHeart\(held\.instanceId\)/, "putting a pet down is not secretly the pet interaction");
  assert.match(source, /petSim\.putDown\(held\.instanceId, spot\)/);
  assert.match(source, /findPutDownSpot\(pose, held\.radius, \(spot\) => petSim\.canStand\(held\.speciesId, spot, held\.sizeMultiplier\)\)/, "the drop spot and collision check use the pet's grown radius");
  assert.match(source, /if \(editing\) dropCarried\(\)/, "build mode empties the arms");
  assert.match(source, /if \(held && putDownFits && doorInReach && openDoors\.has\(doorInReach\.doorId\)\) doorInReach = null/, "an open door yields to the put-down; a shut one is opened first");
  assert.match(source, /petSim\.tick\(TICK_SECONDS, player\)/, "the sim gets the whole pose, so a carried pet rides the yaw");
  assert.match(source, /liveNeedsCheckpoint = \(\) => \{[\s\S]*?advancePetNeeds\(layout, clockMinutes\)[\s\S]*?petSim\.sync\(layout\)/, "each lifecycle checkpoint immediately gives grown size to the sim and renderer");
  // Every layout change goes through one path that applies, syncs and saves.
  assert.match(source, /async function persistLayout/);
  assert.match(source, /next = applyPetCareMilestones\(next\);\s*applyLayout\(next\);\s*farmEditor\.replaceLayout\(next\);\s*if \(!canPersistFarm\) return "Session only · reload when the farm database is available to save safely\.";\s*return describeSave\(await layoutStore\.save\(layout\)\)/);
});

test("first-farm onboarding blocks entry until the required named dog is saved", () => {
  assert.match(source, /const showFarmIntro = canManageFarm && layout\.onboarding\.status === "needs_name" && !layout\.onboarding\.introSeen/);
  assert.match(source, /markFarmIntroSeen\(layout\)/);
  assert.match(source, /starterDogForm\.hidden = !onboardingRequired/);
  assert.match(source, /enterButton\.hidden = onboardingRequired/);
  assert.match(source, /completeFarmOnboarding\(layout, starterDogName\.value\)/);
  assert.match(source, /await onboardingInitialization/, "the intro/grant checkpoint cannot race and overwrite dog completion");
  assert.match(source, /await layoutStore\.save\(completed\.layout\)/, "the dog and starter grants are one persisted document");
  assert.match(source, /if \(!saved\.ok\) \{/);
  assert.match(source, /applyLayout\(completed\.layout\)/);
  assert.match(source, /if \(canManageFarm && layout\.onboarding\.status !== "complete"\) return;/, "owner play cannot start early while visitors never receive the gate");
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
  assert.match(panelSource, /if \(!inspector \|\| inspector\.instanceId !== row\.instanceId\) inspector = buildInspector\(row, definition, state\)/);
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

test("farm build mode uses the shared ticket shop and permanent Farm inventory", () => {
  const editorSource = readFileSync(resolve(repoRoot, "js", "farm-editor.mts"), "utf8");
  const panelSource = readFileSync(resolve(repoRoot, "js", "farm-editor-panel.mts"), "utf8");
  assert.match(source, /createTicketWalletClient\(\)/);
  assert.match(source, /ticketClient\.getShop\("farm"\)/);
  assert.match(source, /createFarmInventory\(\{ ownedIds: shop\?\.ownedIds \}\)/);
  assert.match(source, /purchaseShopItem\("farm", itemId\)/);
  assert.match(editorSource, /if \(!inventory\.owns\(id\)\)/);
  assert.match(editorSource, /if \(!definition \|\| !inventory\.owns\(itemId\)\)/);
  assert.match(panelSource, /dataset\.buyItem/);
  assert.match(panelSource, /tickets available/);
});
