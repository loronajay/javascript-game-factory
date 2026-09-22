// The farm page: the composition root for `/farm/`.
//
// The arcade room's sibling. It loads the farm's layout through the same
// generic store the room uses (owner or visitor, decided once), builds the
// world, and walks the player with the room's own walker on a fixed 60 Hz
// timestep — under the farm's own BODY (`farm-body.mts`), which adds the
// height the room never needed: lofts and catwalks to stand on, ladders to
// climb, seats to sit on, and a fall when nothing is underneath. The pet
// engine and build mode plug in beside `frame()`: the editor owns the layout
// while building, the pets panel changes it while walking, and `applyLayout`
// is the one seam both go through so the world, the sim, the obstacles, the
// platforms and the store never disagree.

import * as THREE_VENDOR from "./vendor/three.module.js";
import { createLayoutStore, type LayoutDocumentSpec } from "./arcade-room-store.mjs";
import { forwardOf, lookWalker } from "./arcade-room-walker.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { EYE_HEIGHT, FARM_SPAWN, doorRows, nearestDoor, farmLadders, farmObstacles, farmPlatforms, farmSeats, keepOutBoxes, waterRegions, type DoorRow } from "./farm-scene.mjs";
import { createFarmBody, eyeHeight, grabLadder, isMoveKey, obstaclesForSpan, releaseLadder, sitOn, standUp, stepFarmBody, type FarmBody } from "./farm-body.mjs";
import { CLIMBING_PROMPT, SEAT_PROMPT, SEATED_PROMPT, canWorkDoor, findLadderInReach, findPetInReach, findSeatInReach, getDoorPrompt, findPutDownSpot, getLadderPrompt, getPickUpPrompt, getPutDownPrompt, putDownSpot, type LadderInReach, type SeatInReach } from "./farm-interaction.mjs";
import { FARM_BOUNDS, addPet, createDefaultFarmLayout, farmCacheKey, normalizeFarmLayout, removePet, renamePet, type FarmLayout } from "./farm-layout.mjs";
import { createFarmEditor } from "./farm-editor.mjs";
import { createFarmDecorThumbnails } from "./farm-decor-thumbnails.mjs";
import { createPetSim } from "./farm-pets.mjs";
import { assetUrlFor, createPetBodies, type PetBodyView } from "./farm-pet-bodies.mjs";
import { createPetsPanel } from "./farm-pets-panel.mjs";
import { createAvatarThumbnails } from "./arcade-room-avatar-thumbnails.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
import { animalTrack, splitAnimalClips } from "./farm-animal-clips.mjs";
import { createFarmMusic } from "./farm-music.mjs";

const THREE: Record<string, any> = THREE_VENDOR;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Farm is missing ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#farmCanvas");
const prompt = requiredElement<HTMLElement>("#farmPrompt");
const startGate = requiredElement<HTMLElement>("#startGate");
const enterButton = requiredElement<HTMLButtonElement>("#enterFarm");
const status = requiredElement<HTMLElement>("#farmStatus");
const fullscreenButton = requiredElement<HTMLButtonElement>("#fullscreenFarm");
const musicButton = requiredElement<HTMLButtonElement>("#toggleFarmMusic");
const farmTitle = requiredElement<HTMLElement>("#farmTitle");
const farmEyebrow = requiredElement<HTMLElement>("#farmEyebrow");
const startTag = requiredElement<HTMLElement>("#startTag");
const startHeading = requiredElement<HTMLElement>("#startHeading");
const startCopy = requiredElement<HTMLElement>("#startCopy");
const ownerLink = requiredElement<HTMLAnchorElement>("#farmOwnerLink");
const openPetsButton = requiredElement<HTMLButtonElement>("#openPets");
const petsPanelRoot = requiredElement<HTMLElement>("#petsPanel");
const editButton = requiredElement<HTMLButtonElement>("#editFarm");
const editorPanel = requiredElement<HTMLElement>("#farmEditor");
const editorDrawer = requiredElement<HTMLElement>("#farmEditorDrawer");

const farmMusic = createFarmMusic();

function renderMusicButton(): void {
  const muted = farmMusic.isMuted();
  musicButton.setAttribute("aria-pressed", String(muted));
  musicButton.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
  musicButton.title = muted ? "Play farm music (M)" : "Mute farm music (M)";
  musicButton.firstChild!.textContent = muted ? "Music off " : "Music on ";
}

function toggleFarmMusic(): void {
  farmMusic.setMuted(!farmMusic.isMuted());
  renderMusicButton();
}

musicButton.addEventListener("click", toggleFarmMusic);
renderMusicButton();

/** The farm's document, on the shared store: slug `farm`, its own cache bucket, its own normalizer. */
export const FARM_LAYOUT_SPEC: LayoutDocumentSpec<FarmLayout> = Object.freeze({
  slug: "farm",
  cacheKey: farmCacheKey,
  normalize: normalizeFarmLayout,
  createDefault: createDefaultFarmLayout,
});

// Whose farm this is. `?id=` names a player to visit; without it, this is the
// signed-in player's own farm (or a local-only farm when signed out).
const visitPlayerId = new URLSearchParams(location.search).get("id") ?? "";
const layoutStore = createLayoutStore(FARM_LAYOUT_SPEC, { visitPlayerId });
const visiting = layoutStore.mode === "visitor";
const loaded = await layoutStore.load();
let layout: FarmLayout = loaded.layout;

function applyFarmIdentity(): void {
  document.body.classList.toggle("is-visiting", visiting);
  if (visiting) {
    const ownerName = loaded.ownerName || "Player";
    document.title = `${ownerName}'s Farm | Javascript Game Factory`;
    farmEyebrow.textContent = "VISITING · THE FARM";
    farmTitle.textContent = `${ownerName}'s Farm`;
    startTag.textContent = "YOU ARE A GUEST HERE";
    startHeading.textContent = `Step onto ${ownerName}'s farm.`;
    startCopy.textContent = loaded.source === "account"
      ? "Walk the field they keep."
      : "They have not settled their farm yet, so this is the starter meadow.";
    enterButton.textContent = "Enter the farm";
    openPetsButton.hidden = true;
    editButton.hidden = true;
    ownerLink.href = `../player/index.html?id=${encodeURIComponent(layoutStore.ownerPlayerId)}`;
    ownerLink.hidden = false;
    return;
  }
  ownerLink.hidden = true;
  if (!layoutStore.accountBacked) {
    startCopy.textContent = "A meadow of your own with a barn, a few trees and a fence around it. Sign in to keep it on your account so friends can visit it.";
  }
}
applyFarmIdentity();

let renderer: any;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
  status.textContent = "This farm needs WebGL to render.";
  startGate.dataset.state = "error";
  throw new Error("WebGL is unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 200);
camera.rotation.order = "YXZ";
const world = createFarmWorld(THREE, scene);
world.applyGround(layout.ground);
world.sync(layout);

const player = { x: FARM_SPAWN.x, z: FARM_SPAWN.z, yaw: FARM_SPAWN.yaw, pitch: -0.03 };
// How high the player is and what they are doing with it: on the ground, up a ladder, on a loft, on a bench.
let body: FarmBody = createFarmBody();
const walkerBounds = { halfWidth: FARM_BOUNDS.width / 2, halfDepth: FARM_BOUNDS.depth / 2, margin: FARM_BOUNDS.wallInset };
// Solid things change when a door or a gate swings: a shut one is an obstacle, an open one is not.
// Keyed by door id: a building or gate under its instance id, a stall half-door under `<instanceId>-<fixture>`.
const openDoors = new Set<string>();
let obstacles = farmObstacles(layout, { openDoors });
let platforms = farmPlatforms(layout);
let ladders = farmLadders(layout);
let seats = farmSeats(layout);
// What E would do right now: the door, ladder or seat the player is at, or null.
let doorInReach: DoorRow | null = null;
let ladderInReach: LadderInReach | null = null;
let seatInReach: SeatInReach | null = null;
const keys = new Set<string>();
let farmEntered = false;
let draggingLook = false;

// The pets: a pure sim decides, bodies draw. The sim shares the walker's obstacle list, keeps
// its destinations outside every building's box, and keeps the swimmers inside the ponds.
const petSim = createPetSim({
  bounds: FARM_BOUNDS,
  random: Math.random,
  // Animals live on the ground: the solids that cross an animal's height, never a loft over its head.
  obstacles: () => obstaclesForSpan(obstacles, 0.05, 1.2),
  keepOut: () => keepOutBoxes(layout),
  water: () => waterRegions(layout),
});
petSim.sync(layout);
const petBodies = createPetBodies(THREE, scene);
let nearbyPet: PetBodyView | null = null;
// The pet in the player's arms, by instance id, and the spot ahead it would be set down on right now (null: no room).
let carrying = "";
let putDownAt: Readonly<{ x: number; z: number; yaw: number }> | null = null;

function applyCamera(): void {
  camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function forwardVector(): { x: number; z: number } {
  return forwardOf(player.yaw);
}

function setPrompt(text: string): void {
  prompt.textContent = text;
  prompt.classList.toggle("is-visible", Boolean(text));
}

function updateInteraction(): void {
  const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardVector() };
  const walking = farmEntered && !farmEditor.isEditing() && body.mode === "walking";
  // A released pet leaves the arms with the layout.
  if (carrying && !petSim.find(carrying)) carrying = "";
  // In order of what is nearest to hand: a door, then — hands free — a ladder, a seat, a pet. A door is still worked with a pet in hand.
  doorInReach = walking ? nearestDoor(doorRows(layout), pose, (entry) => canWorkDoor(pose, entry.door, entry.reach)) : null;
  const handsFree = walking && !carrying;
  ladderInReach = handsFree && !doorInReach ? findLadderInReach(ladders, pose) : null;
  seatInReach = handsFree && !doorInReach && !ladderInReach ? findSeatInReach(seats, pose) : null;
  nearbyPet = handsFree && !doorInReach && !ladderInReach && !seatInReach ? findPetInReach(petBodies.views().filter((view) => view.instanceId !== carrying), pose) : null;
  const held = carrying ? petSim.find(carrying) : null;
  putDownAt = held && body.y < 0.3 ? findPutDownSpot(pose, findAnimal(held.speciesId)?.radius ?? 0.5, (spot) => petSim.canStand(held.speciesId, spot)) : null;
  const putDownFits = putDownAt !== null;
  // With a pet in hand, a door that already stands open yields to setting the pet down through it; a shut one is still opened first.
  if (held && putDownFits && doorInReach && openDoors.has(doorInReach.doorId)) doorInReach = null;
  if (petsPanel.isOpen() || farmEditor.isEditing() || !farmEntered) {
    setPrompt("");
    return;
  }
  if (body.mode === "climbing") {
    setPrompt(CLIMBING_PROMPT);
    return;
  }
  if (body.mode === "seated") {
    setPrompt(SEATED_PROMPT);
    return;
  }
  if (doorInReach) {
    setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach));
    return;
  }
  if (ladderInReach) {
    setPrompt(getLadderPrompt(ladderInReach.fromTop));
    return;
  }
  if (seatInReach) {
    setPrompt(SEAT_PROMPT);
    return;
  }
  if (held) {
    setPrompt(getPutDownPrompt(held.name, putDownFits, body.y < 0.3));
    return;
  }
  if (nearbyPet) {
    setPrompt(getPickUpPrompt(nearbyPet.name));
    return;
  }
  setPrompt("");
}

/** Apply a body step: the pose and the body move together or not at all. */
function applyBodyStep(step: Readonly<{ pose: Readonly<{ x: number; z: number; yaw: number; pitch: number }>; body: FarmBody }>): void {
  player.x = step.pose.x;
  player.z = step.pose.z;
  player.yaw = step.pose.yaw;
  player.pitch = step.pose.pitch;
  body = step.body;
}

/** E, while walking: whatever `updateInteraction` found nearest to hand. */
function interact(): boolean {
  if (body.mode === "climbing") {
    applyBodyStep(releaseLadder(player, body));
    return true;
  }
  if (body.mode === "seated") {
    applyBodyStep(standUp(player, body));
    return true;
  }
  if (doorInReach) {
    toggleDoors();
    return true;
  }
  if (ladderInReach) {
    applyBodyStep(grabLadder(player, ladderInReach.ladder, ladderInReach.fromTop));
    keys.clear();
    return true;
  }
  if (seatInReach) {
    applyBodyStep(sitOn(player, body, seatInReach.seat, seatInReach.point));
    keys.clear();
    return true;
  }
  if (carrying) {
    putPetDown();
    return true;
  }
  if (nearbyPet) {
    pickPetUp();
    return true;
  }
  return false;
}

/** E on a pet: into the arms. The tag comes off so it does not sit in the player's face, and the heart waits for the put-down. */
function pickPetUp(): void {
  if (!nearbyPet || !petSim.pickUp(nearbyPet.instanceId)) return;
  carrying = nearbyPet.instanceId;
  petBodies.setTagVisible(carrying, false);
  nearbyPet = null;
}

/** E with a pet in hand: set it down ahead if it fits; otherwise the prompt has already said why not and E does nothing. */
function putPetDown(): boolean {
  const held = carrying ? petSim.find(carrying) : null;
  const spot = putDownAt;
  if (!held || !spot) return false;
  if (!petSim.putDown(held.instanceId, spot)) return false;
  petBodies.setTagVisible(held.instanceId, true);
  petBodies.showHeart(held.instanceId);
  petSim.attention(held.instanceId);
  carrying = "";
  return true;
}

/** Build mode takes the pet out of the arms: ahead, else at the player's feet, else where a turn finds room; last resort, it stays carried. */
function dropCarried(): void {
  const held = carrying ? petSim.find(carrying) : null;
  if (!held) return;
  const radius = findAnimal(held.speciesId)?.radius ?? 0.5;
  for (let index = 0; index < 8; index += 1) {
    const yaw = player.yaw + index * Math.PI / 4;
    const forward = forwardOf(yaw);
    const spot = index === 0 ? putDownSpot({ x: player.x, z: player.z, yaw, forward }, radius) : { x: player.x + forward.x * (index === 1 ? 0 : 1.2), z: player.z + forward.z * (index === 1 ? 0 : 1.2), yaw };
    if (petSim.putDown(held.instanceId, spot)) {
      petBodies.setTagVisible(held.instanceId, true);
      carrying = "";
      return;
    }
  }
}

function toggleDoors(): void {
  const doors = doorInReach ? world.doorsFor(doorInReach.doorId) : null;
  if (!doors || !doorInReach) return;
  const open = !doors.isOpen();
  doors.setOpen(open);
  if (open) openDoors.add(doorInReach.doorId);
  else openDoors.delete(doorInReach.doorId);
  obstacles = farmObstacles(layout, { openDoors });
}

/**
 * The one seam every layout change goes through, from the editor or the pets
 * panel: the world redraws, the sim re-syncs, the obstacle list and the
 * platforms, ladders and seats are rebuilt (a building that moved takes its
 * open door and its loft with it), and the panels follow. A body up a ladder
 * or on a seat that is gone is set down where it stands and falls from there.
 */
function applyLayout(next: FarmLayout): void {
  layout = next;
  world.applyGround(layout.ground);
  world.sync(layout);
  for (const doorId of [...openDoors]) if (!world.doorsFor(doorId)) openDoors.delete(doorId);
  obstacles = farmObstacles(layout, { openDoors });
  platforms = farmPlatforms(layout);
  ladders = farmLadders(layout);
  seats = farmSeats(layout);
  if (body.mode === "seated" && !seats.some((seat) => seat.id === body.fixtureId)) applyBodyStep(standUp(player, body));
  if (body.mode === "climbing" && !ladders.some((ladder) => ladder.id === body.fixtureId)) applyBodyStep(releaseLadder(player, body));
  petSim.sync(layout);
  petsPanel.render(layout);
}

function isFarmFullscreen(): boolean {
  return document.fullscreenElement === document.documentElement;
}
function setFarmFullscreen(on: boolean): void {
  if (!document.fullscreenEnabled) return;
  if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => undefined);
  else if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
}
function syncFullscreenButton(): void {
  fullscreenButton.setAttribute("aria-pressed", String(isFarmFullscreen()));
  fullscreenButton.firstChild!.textContent = isFarmFullscreen() ? "Exit fullscreen " : "Fullscreen ";
}
fullscreenButton.hidden = !document.fullscreenEnabled;
fullscreenButton.addEventListener("click", () => {
  setFarmFullscreen(!isFarmFullscreen());
  canvas.focus();
});
document.addEventListener("fullscreenchange", syncFullscreenButton);

window.addEventListener("keydown", (event) => {
  // Build mode owns the keyboard: the editor listens for itself, and walking keys never reach the walker.
  if (farmEditor.isEditing()) {
    keys.clear();
    return;
  }
  // P opens and closes the pets panel; while it is open every other key is the panel's.
  if (event.code === "KeyP" && !event.repeat && !visiting && farmEntered && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    if (petsPanel.isOpen()) petsPanel.close();
    else petsPanel.open();
    return;
  }
  if (petsPanel.isOpen()) {
    if (event.code === "Escape") petsPanel.close();
    keys.clear();
    return;
  }
  // A move key stands a seated body up rather than walking it while it sits.
  if (body.mode === "seated" && isMoveKey(event.code)) {
    applyBodyStep(standUp(player, body));
    return;
  }
  keys.add(event.code);
  if (event.code === "KeyM" && !event.repeat) {
    event.preventDefault();
    toggleFarmMusic();
    return;
  }
  if (event.code === "KeyF" && !event.repeat && document.fullscreenEnabled) {
    event.preventDefault();
    setFarmFullscreen(!isFarmFullscreen());
    return;
  }
  if (event.code === "KeyE" && !event.repeat && farmEntered) {
    if (interact()) event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

canvas.addEventListener("click", () => {
  if (farmEntered && !petsPanel.isOpen() && !farmEditor.isEditing()) canvas.requestPointerLock?.().catch(() => undefined);
});
enterButton.addEventListener("click", () => {
  farmEntered = true;
  farmMusic.start();
  startGate.classList.add("is-hidden");
  canvas.focus();
  status.textContent = "WASD to move · Drag to look · Click for mouse capture";
});
window.addEventListener("pagehide", () => farmMusic.destroy(), { once: true });
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  startGate.classList.toggle("is-hidden", farmEntered);
  status.textContent = locked
    ? "WASD to move · Mouse to look · Shift to run"
    : "WASD to move · Drag to look · Click for mouse capture";
});
canvas.addEventListener("pointerdown", () => { draggingLook = !farmEditor.isEditing(); });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
  if (petsPanel.isOpen() || farmEditor.isEditing()) return;
  if (document.pointerLockElement !== canvas && !draggingLook) return;
  const looked = lookWalker(player, event.movementX, event.movementY);
  player.yaw = looked.yaw;
  player.pitch = looked.pitch;
});

function updatePlayer(dt: number): void {
  if (!farmEntered || petsPanel.isOpen() || farmEditor.isEditing()) return;
  const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms, ladders });
  if (!step.moved) return;
  player.x = step.pose.x;
  player.z = step.pose.z;
  body = step.body;
}

function resize(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
  }
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

/** What a save result means to the player, wherever the save was asked for. */
function describeSave(result: Readonly<{ ok: boolean; target: string }>): string {
  if (result.ok && result.target === "account") return "Saved to your account. Friends can visit this farm.";
  if (result.ok) return "Saved on this device only. Sign in to keep it on your account.";
  if (result.target === "account") return "Kept on this device, but the account save failed. Try again in a moment.";
  return "This browser could not save the farm.";
}

/** Pets-panel changes land here: apply, tell the editor, then save, and say where the save went. */
async function persistLayout(next: FarmLayout): Promise<string> {
  applyLayout(next);
  farmEditor.replaceLayout(next);
  return describeSave(await layoutStore.save(layout));
}

// Species cards show the real animal: the room's offscreen portrait renderer pointed at the pack.
const speciesThumbnails = createAvatarThumbnails(THREE, {
  resolve: (speciesId) => {
    const species = findAnimal(speciesId);
    if (!species) return undefined;
    return {
      assetUrl: assetUrlFor(species),
      poseClip: (gltf) => splitAnimalClips(THREE, animalTrack(gltf), species.clips).idle,
      height: 1.4,
      lookAtY: 0.7,
    };
  },
});

const petsPanel = createPetsPanel({
  root: petsPanelRoot,
  openButton: openPetsButton,
  closeButton: requiredElement<HTMLButtonElement>("#closePets"),
  petList: requiredElement<HTMLElement>("#petList"),
  speciesGrid: requiredElement<HTMLElement>("#speciesGrid"),
  nameInput: requiredElement<HTMLInputElement>("#petName"),
  status: requiredElement<HTMLElement>("#petsStatus"),
  count: requiredElement<HTMLElement>("#petsCount"),
}, {
  adopt: async (speciesId, name) => {
    const result = addPet(layout, speciesId, name);
    if (!result.valid) {
      if (result.reason === "full") return "The farm is full. Release a pet to adopt another.";
      if (result.reason === "needs_water") return "That one needs a pond. Ponds are coming.";
      return "That animal is not in the catalog.";
    }
    const saved = await persistLayout(result.layout);
    const pet = result.layout.pets.find((row) => row.instanceId === result.instanceId);
    return (pet?.name ?? "Your pet") + " moved in. " + saved;
  },
  rename: async (instanceId, name) => {
    const next = renamePet(layout, instanceId, name);
    if (next === layout) return "";
    return "Renamed. " + await persistLayout(next);
  },
  release: async (instanceId) => {
    const leaving = layout.pets.find((row) => row.instanceId === instanceId);
    const next = removePet(layout, instanceId);
    if (next === layout) return "";
    return (leaving?.name ?? "Your pet") + " went back to the wild. " + await persistLayout(next);
  },
}, { thumbnail: speciesThumbnails.get });
petsPanel.render(layout);
if (visiting) openPetsButton.hidden = true;

// Build mode: the shared editor frame over the farm's own placement rules. The
// editor owns the layout while it is open; every change comes back through `applyLayout`.
const decorThumbnails = createFarmDecorThumbnails(THREE);
const farmEditor = createFarmEditor({
  THREE,
  scene,
  camera,
  canvas,
  world,
  initialLayout: layout,
  persist: async (next) => {
    const result = await layoutStore.save(next);
    return { ok: result.ok, message: describeSave(result) };
  },
  thumbnail: (definition) => decorThumbnails.get(definition),
  elements: {
    panel: editorPanel,
    editButton,
    rotateLeftButton: requiredElement<HTMLButtonElement>("#rotateFarmLeft"),
    rotateRightButton: requiredElement<HTMLButtonElement>("#rotateFarmRight"),
    resetButton: requiredElement<HTMLButtonElement>("#resetFarmLayout"),
    saveButton: requiredElement<HTMLButtonElement>("#saveFarmLayout"),
    finishButton: requiredElement<HTMLButtonElement>("#finishFarmEditing"),
    undoButton: requiredElement<HTMLButtonElement>("#undoFarmEdit"),
    status: requiredElement<HTMLElement>("#farmEditorStatus"),
    viewButtons: requiredElement<HTMLElement>("#cameraViews"),
    tabs: requiredElement<HTMLElement>("#farmEditorTabs"),
    tabPanels: requiredElement<HTMLElement>("#farmEditorTabPanels"),
    drawer: editorDrawer,
    groundPicker: requiredElement<HTMLElement>("#groundPicker"),
    catalogTitle: requiredElement<HTMLElement>("#farmCatalogTitle"),
    catalogHint: requiredElement<HTMLElement>("#farmCatalogHint"),
    catalog: requiredElement<HTMLElement>("#farmCatalog"),
    placed: requiredElement<HTMLElement>("#farmPlaced"),
    inspector: requiredElement<HTMLElement>("#farmInspector"),
  },
  // A visitor can never build, and the pets panel and the start gate own the screen while they are up.
  canEnter: () => !visiting && farmEntered && !petsPanel.isOpen(),
  onEditingChange: (editing) => {
    keys.clear();
    draggingLook = false;
    if (editing) dropCarried();
    // The overview presets stand well outside the field; the walking fog would swallow them.
    scene.fog.far = editing ? 260 : 90;
    scene.fog.near = editing ? 120 : 30;
    if (!editing) {
      applyCamera();
      status.textContent = "WASD to move · Drag to look · Click for mouse capture";
    }
  },
  onLayoutChange: (next) => applyLayout(next),
});

const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now: number): void {
  const frameSeconds = Math.min((now - previous) / 1000, 0.1);
  accumulator += frameSeconds;
  previous = now;
  while (accumulator >= TICK_SECONDS) {
    updatePlayer(TICK_SECONDS);
    petSim.tick(TICK_SECONDS, player);
    updateInteraction();
    accumulator -= TICK_SECONDS;
  }
  world.update(frameSeconds);
  petBodies.sync(petSim.pets(), frameSeconds);
  if (!farmEditor.isEditing()) applyCamera();
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Read-only handle for headless verification (position, facing, what E would do). Nothing in the page uses it.
(globalThis as any).__farm = Object.freeze({
  pose: () => ({ ...player, y: body.y }),
  body: () => body,
  ladderInReach: () => ladderInReach?.ladder.id ?? "",
  seatInReach: () => seatInReach?.seat.id ?? "",
  doorInReach: () => Boolean(doorInReach),
  doorsOpen: () => (doorInReach ? openDoors.has(doorInReach.doorId) : openDoors.size > 0),
  pets: () => petSim.pets(),
  nearbyPet: () => nearbyPet?.instanceId ?? "",
  carrying: () => carrying,
  putDownFits: () => putDownAt !== null,
  layout: () => layout,
  editing: () => farmEditor.isEditing(),
  obstacles: () => obstacles,
});

applyCamera();
syncFullscreenButton();
requestAnimationFrame(frame);
