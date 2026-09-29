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
import { createLayoutStore } from "./arcade-room-store.mjs";
import { forwardOf, lookWalker } from "./arcade-room-walker.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { gatewayAt, perimeterGates } from "./farm-gateway.mjs";
import { EYE_HEIGHT, FARM_SPAWN, doorRows, nearestDoor, farmLadders, farmObstacles, farmPlatforms, farmSeats, keepOutBoxes, waterRegions, type DoorRow } from "./farm-scene.mjs";
import { groundHeightAt, underwater, waterDepthAt, type PondRegion } from "./farm-pond.mjs";
import { createFarmBody, eyeHeight, grabLadder, isMoveKey, obstaclesForSpan, releaseLadder, sitOn, standUp, stepFarmBody, type FarmBody } from "./farm-body.mjs";
import { BED_PROMPT, CLIMBING_PROMPT, SEAT_PROMPT, SEATED_PROMPT, canWorkDoor, findBedInReach, findLadderInReach, findPetInReach, findSeatInReach, getDoorPrompt, findPutDownSpot, getLadderPrompt, getPetInteraction, getPetInteractionPrompt, getPutDownPrompt, putDownSpot, type BedRow, type LadderInReach, type PetInteractionId, type SeatInReach } from "./farm-interaction.mjs";
import { canNap, formatNapMinutes, napBankReadyIn } from "./farm-nap-bank.mjs";
import { FARM_BOUNDS, FARM_LAYOUT_SPEC, addPet, farmNapBank, normalizeFarmLayout, removePet, renamePet, withFarmAgriculture, withFarmClock, withFarmPets, withFarmTrees, withNapTaken, withProductionCheckpoint, type FarmLayout } from "./farm-layout.mjs";
import { createFarmEditor } from "./farm-editor.mjs";
import { createFarmDecorThumbnails } from "./farm-decor-thumbnails.mjs";
import { createPetSim } from "./farm-pets.mjs";
import { assetUrlFor, createPetBodies, type PetBodyView } from "./farm-pet-bodies.mjs";
import { createPetsPanel } from "./farm-pets-panel.mjs";
import { createFarmLivestockController } from "./farm-livestock-controller.mjs";
import { createLivestockPanel } from "./farm-livestock-panel.mjs";
import { createAvatarThumbnails } from "./arcade-room-avatar-thumbnails.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
import { createFarmInventory } from "./farm-catalog/inventory.mjs";
import { createTicketWalletClient, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { animalTrack, splitAnimalClips } from "./farm-animal-clips.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { FARM_MINUTES_PER_REAL_SECOND, NAP_MINUTES_PER_REAL_SECOND, advanceFarmTime, farmLightProfile, formatFarmTime, quantizeFarmTime, resumeFarmClock } from "./farm-time.mjs";
import { advanceAgriculture } from "./farm-crops.mjs";
import { cropCapacityUse } from "./farm-capacity.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";
import { createFarmSkillsHud } from "./farm-skills-hud.mjs";
import { createFarmStatsPanel } from "./farm-stats-panel.mjs";
import { advanceFarmTrees } from "./farm-trees.mjs";
import { createFarmTreesView } from "./farm-trees-view.mjs";
import { createFarmTreesController } from "./farm-trees-controller.mjs";
import { createFarmCropsController } from "./farm-crops-controller.mjs";
import { createChopMeter } from "./farm-chop-view.mjs";
import { createKitchenView } from "./farm-kitchen-view.mjs";
import { createKitchenPanel } from "./farm-kitchen-panel.mjs";
import { createCookingHud } from "./farm-cooking-view.mjs";
import { createFarmKitchenController } from "./farm-kitchen-controller.mjs";
import { createWorkshopView } from "./farm-workshop-view.mjs";
import { createWorkshopPanel } from "./farm-workshop-panel.mjs";
import { createMillPanel } from "./farm-mill-panel.mjs";
import { createCraftingHud } from "./farm-carpentry-view.mjs";
import { createFarmWorkshopController, millOutcome } from "./farm-workshop-controller.mjs";
import { createFarmItemThumbnails } from "./farm-item-thumbnails.mjs";
import { createFishPortraits } from "./farm-fish-portraits.mjs";
import { createAnglerLink } from "./farm-angler-link.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { applyOfflineProduction, offlineSpan, type OfflineReport } from "./farm-offline.mjs";
import { createAwayReport } from "./farm-away-report.mjs";
import { createFarmCropsView } from "./farm-crops-view.mjs";
import { createFarmInventoryPanel } from "./farm-inventory-panel.mjs";
import { createCropThumbnails } from "./farm-crop-thumbnails.mjs";
import { completeFarmOnboarding, markFarmIntroSeen } from "./farm-onboarding.mjs";
import { advancePetNeeds, advancePetProfile, feedPet, petNeedStatus } from "./farm-pet-needs.mjs";
import { findPetCare, treatmentNote } from "./farm-pet-care.mjs";
import { applyPetCareMilestones, petCareEnvironment, reactToPetInteraction } from "./farm-pet-happiness.mjs";
import { reactToPetCall } from "./farm-pet-outcomes.mjs";

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
const farmClock = requiredElement<HTMLElement>("#farmClock");
const fieldCapacity = requiredElement<HTMLElement>("#fieldCapacity");
const skillsHud = createFarmSkillsHud({
  farming: { root: requiredElement<HTMLElement>("#farmingSkill"), label: requiredElement<HTMLElement>("#farmingSkillLabel"), bar: requiredElement<HTMLElement>("#farmingSkillBar") },
  woodcutting: { root: requiredElement<HTMLElement>("#woodcuttingSkill"), label: requiredElement<HTMLElement>("#woodcuttingSkillLabel"), bar: requiredElement<HTMLElement>("#woodcuttingSkillBar") },
  cooking: { root: requiredElement<HTMLElement>("#cookingSkill"), label: requiredElement<HTMLElement>("#cookingSkillLabel"), bar: requiredElement<HTMLElement>("#cookingSkillBar") },
  carpentry: { root: requiredElement<HTMLElement>("#carpentrySkill"), label: requiredElement<HTMLElement>("#carpentrySkillLabel"), bar: requiredElement<HTMLElement>("#carpentrySkillBar") },
});
const farmClockPhase = requiredElement<HTMLElement>("#farmClockPhase");
const napDialog = requiredElement<HTMLDialogElement>("#napDialog");
const napStatus = requiredElement<HTMLElement>("#napStatus");
const napBankLabel = requiredElement<HTMLElement>("#napBank");
const openInventoryButton = requiredElement<HTMLButtonElement>("#openInventory");
const openStatsButton = requiredElement<HTMLButtonElement>("#openStats");
const starterDogForm = requiredElement<HTMLFormElement>("#starterDogForm");
const starterDogName = requiredElement<HTMLInputElement>("#starterDogName");
const nameStarterDog = requiredElement<HTMLButtonElement>("#nameStarterDog");
const onboardingStatus = requiredElement<HTMLElement>("#onboardingStatus");

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

// Whose farm this is. `?id=` names a player to visit; without it, this is the
// signed-in player's own farm. The shared store keeps signed-out farms on this
// device and treats the database as canonical for signed-in players.
const visitPlayerId = new URLSearchParams(location.search).get("id") ?? "";
const layoutStore = createLayoutStore(FARM_LAYOUT_SPEC, { visitPlayerId });
const visiting = layoutStore.mode === "visitor";
const loaded = await layoutStore.load();
const ticketClient = createTicketWalletClient();
const shop = layoutStore.accountBacked
  ? await ticketClient.getShop("farm").catch(() => null)
  : null;
const farmInventory = createFarmInventory({ ownedIds: shop?.ownedIds });
const ticketPrices = new Map<string, number>(
  Array.isArray(shop?.items)
    ? shop.items.filter((entry: any) => typeof entry?.id === "string" && Number.isSafeInteger(entry?.price) && entry.price > 0)
      .map((entry: any) => [entry.id, entry.price])
    : [],
);
const farmPurchaseId = (kind: string): string => `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const canManageFarm = !visiting;
// A signed-in fallback must never overwrite the database with a stale device
// copy or starter layout. Signed-out owners, however, save normally on-device.
const canPersistFarm = canManageFarm && (!layoutStore.ownerPlayerId || (layoutStore.accountBacked && loaded.source === "account"));
let layout: FarmLayout = loaded.layout;
const showFarmIntro = canManageFarm && layout.onboarding.status === "needs_name" && !layout.onboarding.introSeen;
let onboardingInitialization: ReturnType<typeof layoutStore.save> | null = null;
const resumedClock = resumeFarmClock(layout.clock, Date.now());
layout = withFarmClock(advancePetNeeds(layout, resumedClock.farmMinutes), resumedClock.farmMinutes, resumedClock.updatedAt);
// Crops (only crops) caught up for the time the owner was away, at the offline
// rate and cap. A farm whose owner has never stepped onto it has no checkpoint
// and so never moves. Visitors see the farm exactly as it was saved.
let pendingAwayReport: OfflineReport | null = null;
if (canManageFarm && layout.clock.checkpointAt > 0) {
  const caughtUp = applyOfflineProduction(layout.agriculture, offlineSpan(layout.clock.checkpointAt, resumedClock.updatedAt), resumedClock.farmMinutes, layout.trees);
  layout = withProductionCheckpoint(withFarmTrees(withFarmAgriculture(layout, caughtUp.agriculture), caughtUp.trees), resumedClock.updatedAt);
  pendingAwayReport = caughtUp.report;
}
// When the tab was hidden: the farm is "away" from then until it is visible again.
let hiddenSince = 0;
/** The real time the owner was last actually on the farm: now, unless the tab is hidden. */
const presentAt = (): number => hiddenSince || Date.now();
/** Every owner save moves the offline checkpoint — once the farm has been entered at least once. */
function stampPresence(next: FarmLayout): FarmLayout {
  if (!canManageFarm || next.clock.checkpointAt <= 0) return next;
  return withProductionCheckpoint(next, presentAt());
}
if (showFarmIntro) {
  layout = markFarmIntroSeen(layout);
  // This first write pins the random seed pool before a reload can make a new one.
  // Account fallback sessions are intentionally read-only, as with every farm write.
  if (canPersistFarm) onboardingInitialization = layoutStore.save(layout);
}

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
    openInventoryButton.hidden = true;
    openStatsButton.hidden = true;
    editButton.hidden = true;
    ownerLink.href = `../player/index.html?id=${encodeURIComponent(layoutStore.ownerPlayerId)}`;
    ownerLink.hidden = false;
    return;
  }
  ownerLink.hidden = true;
  if (!layoutStore.ownerPlayerId) {
    startTag.textContent = "LOCAL FARM";
    startCopy.textContent = "Play, build and grow while signed out. This farm saves on this device; sign in and reload to keep progression with your account.";
  } else if (!canPersistFarm) {
    startTag.textContent = "DATABASE TEMPORARILY UNAVAILABLE";
    startCopy.textContent = "You can still play and build in this session. Saving is paused so a starter or stale device copy cannot overwrite your account farm.";
  }
}
applyFarmIdentity();

function renderOnboardingGate(): void {
  const onboardingRequired = canManageFarm && layout.onboarding.status === "needs_name";
  starterDogForm.hidden = !onboardingRequired;
  enterButton.hidden = onboardingRequired;
  if (!onboardingRequired) return;
  startTag.textContent = showFarmIntro ? "WELCOME TO YOUR FARM" : "YOUR FIRST FARM FRIEND";
  startHeading.textContent = showFarmIntro ? "A field, a future, and a dog." : "Name your dog to continue.";
  startCopy.textContent = showFarmIntro
    ? "Your new farm includes a farmhouse with a kitchen, one growing plot, six kinds of seed, 20 servings of Dog Food, and a dog of your own. Give your dog a name before you step onto the field."
    : "Your starter supplies are safe. Give your dog a name before normal farm play begins.";
  if (!canPersistFarm) {
    nameStarterDog.disabled = true;
    onboardingStatus.textContent = "Saving is unavailable right now. Reload when the farm database is back.";
  }
}
renderOnboardingGate();

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
// Match the arcade room's build tool: half-metre cells make plots and paths easy to line up.
const grid = new THREE.GridHelper(FARM_BOUNDS.width, FARM_BOUNDS.width * 2, 0x7ba36b, 0x46664b);
grid.position.y = 0.004;
grid.visible = false;
scene.add(grid);
// `?time=<minute-of-day>` is a visual-QA seam for checking any light state without waiting through the cycle.
const previewMinute = new URLSearchParams(location.search).get("time");
let clockMinutes = previewMinute === null ? resumedClock.farmMinutes : advanceFarmTime(Number(previewMinute), 0, 0);
let napRemainingMinutes = 0;
let renderedQuarter = -1;
let liveNeedsCheckpoint: (() => void) | null = null;
world.setTime(clockMinutes);
const cropsView = createFarmCropsView(THREE, scene);
const treesView = createFarmTreesView(THREE, scene);
const awayReport = createAwayReport(requiredElement<HTMLElement>("#awayReport"));
cropsView.sync(layout, layout.agriculture, clockMinutes);
treesView.sync(layout, clockMinutes);
// Cooking, in the world: ingredients on the board, the pot, the oven, the plated dish (farm-kitchen-view.mts).
const kitchenView = createKitchenView(THREE, scene, world);
/** Set once the kitchen controller exists: a layout change moves or clears what is on a range. */
let kitchenSync: () => void = () => undefined;
// Carpentry, in the world: the board on the Workbench and the finished piece (farm-workshop-view.mts).
const workshopView = createWorkshopView(THREE, scene, world);
let workshopSync: () => void = () => undefined;
// Livestock (farm-livestock-controller.mts): homes move with their buildings on every layout change.
let livestockSync: () => void = () => undefined;

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
// The ponds dug into the field: what the feet stand on in them and when the eyes are under water.
let ponds: readonly PondRegion[] = waterRegions(layout);
const groundAt = (point: Readonly<{ x: number; z: number }>): number => groundHeightAt(ponds, point);
const waterAt = (point: Readonly<{ x: number; z: number }>): number => waterDepthAt(ponds, point);
const underwaterOverlay = document.querySelector<HTMLElement>(".farm-underwater");
// What E would do right now: the door, ladder or seat the player is at, or null.
let doorInReach: DoorRow | null = null;
let ladderInReach: LadderInReach | null = null;
let seatInReach: SeatInReach | null = null;
let bedInReach: BedRow | null = null;
let nearbyPetCanPickUp = false;
let nearbyPetCanFeed = false;
let nearbyPetCanPlay = false;
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
let carryPatienceSeconds: number | null = null;
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

function renderFarmClock(): void {
  const quarter = quantizeFarmTime(clockMinutes);
  if (quarter === renderedQuarter) return;
  renderedQuarter = quarter;
  farmClock.textContent = formatFarmTime(clockMinutes);
  farmClockPhase.textContent = farmLightProfile(clockMinutes).phase;
  cropsView.sync(layout, layout.agriculture, clockMinutes);
  treesView.sync(layout, clockMinutes);
  liveNeedsCheckpoint?.();
}

function finishNap(): void {
  napRemainingMinutes = 0;
  document.body.classList.remove("is-napping");
  napStatus.textContent = `You wake up at ${formatFarmTime(clockMinutes)}.`;
  void persistFarmProgress();
}

function updateFarmTime(dt: number): void {
  if (napRemainingMinutes > 0) {
    const elapsed = Math.min(napRemainingMinutes, dt * NAP_MINUTES_PER_REAL_SECOND);
    clockMinutes += elapsed;
    napRemainingMinutes -= elapsed;
    if (napRemainingMinutes <= 1e-6) finishNap();
  } else {
    clockMinutes += dt * FARM_MINUTES_PER_REAL_SECOND;
  }
  world.setTime(clockMinutes);
  renderFarmClock();
}

function openNapDialog(): void {
  keys.clear();
  document.exitPointerLock?.();
  napStatus.textContent = `It is ${formatFarmTime(clockMinutes)}. The farm keeps moving while you sleep.`;
  renderNapBank();
  napDialog.showModal();
}

/** Naps draw on a bank that refills with real time (farm-nap-bank.mts); a nap it cannot pay for is greyed out. */
function renderNapBank(): void {
  const bank = farmNapBank(layout, Date.now());
  for (const button of napDialog.querySelectorAll<HTMLButtonElement>("[data-nap-hours]")) {
    const minutes = Number(button.dataset.napHours) * 60;
    const affordable = canNap(bank, minutes);
    button.disabled = !affordable;
    button.title = affordable ? "" : `Rested again in ${formatNapMinutes(napBankReadyIn(bank, minutes) / 60000)} of real time`;
  }
  napBankLabel.textContent = `Rest left: ${formatNapMinutes(bank)} of sleep · refills 18h a day`;
}

function startNap(hours: number): void {
  const minutes = hours * 60;
  if (!Number.isFinite(hours) || hours <= 0 || napRemainingMinutes > 0) return;
  if (!canNap(farmNapBank(layout, Date.now()), minutes)) return;
  layout = withNapTaken(layout, minutes, clockMinutes, Date.now());
  napRemainingMinutes = minutes;
  napDialog.close();
  document.body.classList.add("is-napping");
}

for (const button of napDialog.querySelectorAll<HTMLButtonElement>("[data-nap-hours]")) {
  button.addEventListener("click", () => startNap(Number(button.dataset.napHours)));
}
renderFarmClock();

function updateInteraction(): void {
  const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardVector() };
  const walking = farmEntered && !farmEditor.isEditing() && !napDialog.open && napRemainingMinutes <= 0 && body.mode === "walking";
  // A released pet leaves the arms with the layout.
  if (carrying && !petSim.find(carrying)) carrying = "";
  // In order of what is nearest to hand: a door, then — hands free — a ladder, a seat, a pet. A door is still worked with a pet in hand.
  doorInReach = walking ? nearestDoor(doorRows(layout), pose, (entry) => canWorkDoor(pose, entry.door, entry.reach)) : null;
  const handsFree = walking && !carrying;
  ladderInReach = handsFree && !doorInReach ? findLadderInReach(ladders, pose) : null;
  bedInReach = handsFree && !doorInReach && !ladderInReach ? findBedInReach(layout.decor, pose) : null;
  // The field's producers, crops then trees, each behind its own controller; then the kitchen.
  crops.update(pose, handsFree && canManageFarm && !doorInReach && !ladderInReach && !bedInReach);
  trees.update(pose, handsFree && canManageFarm && !doorInReach && !ladderInReach && !bedInReach && !crops.inReach());
  kitchen.update(pose, handsFree && canManageFarm && !doorInReach && !ladderInReach && !bedInReach && !crops.inReach() && !trees.inReach());
  workshop.update(pose, handsFree && canManageFarm && !doorInReach && !ladderInReach && !bedInReach && !crops.inReach() && !trees.inReach() && !kitchen.inReach());
  const producing = crops.inReach() || trees.inReach() || kitchen.inReach() || workshop.inReach();
  seatInReach = handsFree && !doorInReach && !ladderInReach && !bedInReach && !producing ? findSeatInReach(seats, pose) : null;
  nearbyPet = handsFree && !doorInReach && !ladderInReach && !bedInReach && !producing && !seatInReach ? findPetInReach(petBodies.views().filter((view) => view.instanceId !== carrying), pose) : null;
  livestock.update(pose, handsFree && !doorInReach && !ladderInReach && !bedInReach && !producing && !seatInReach && !nearbyPet);
  const nearbyPetState = nearbyPet ? petSim.find(nearbyPet.instanceId) : null;
  const nearbyPetRow = nearbyPet ? layout.pets.find((pet) => pet.instanceId === nearbyPet!.instanceId) : null;
  const nearbyPetProfile = nearbyPetRow?.profile
    ? advancePetProfile(nearbyPetRow.profile, nearbyPetRow.speciesId, clockMinutes - layout.clock.farmMinutes, layout.decor)
    : null;
  const nearbyPetCare = nearbyPetRow ? findPetCare(nearbyPetRow.speciesId) : null;
  const canPickUp = Boolean(nearbyPetState);
  const canFeed = Boolean(canManageFarm && nearbyPetProfile && nearbyPetProfile.hunger < 100 && nearbyPetCare
    && (layout.agriculture.inventory.supplies[nearbyPetCare.food.itemId] ?? 0) > 0);
  const canPlay = Boolean(canManageFarm && nearbyPetRow && petCareEnvironment(nearbyPetRow.speciesId, layout.decor).toyCount > 0);
  nearbyPetCanPickUp = canPickUp;
  nearbyPetCanFeed = canFeed;
  nearbyPetCanPlay = canPlay;
  const held = carrying ? petSim.find(carrying) : null;
  putDownAt = held && body.y < 0.3 ? findPutDownSpot(pose, held.radius, (spot) => petSim.canStand(held.speciesId, spot, held.sizeMultiplier)) : null;
  const putDownFits = putDownAt !== null;
  // With a pet in hand, a door that already stands open yields to setting the pet down through it; a shut one is still opened first.
  if (held && putDownFits && doorInReach && openDoors.has(doorInReach.doorId)) doorInReach = null;
  if (petsPanel.isOpen() || livestockPanel.isOpen() || inventoryPanel.isOpen() || statsPanel.isOpen() || stationPanelOpen() || farmEditor.isEditing() || !farmEntered) {
    setPrompt("");
    return;
  }
  if (trees.chopping()) {
    setPrompt(trees.prompt());
    return;
  }
  if (kitchen.cooking()) {
    setPrompt(kitchen.prompt());
    return;
  }
  if (workshop.crafting()) {
    setPrompt(workshop.prompt());
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
    const road = perimeterGates(layout.decor, FARM_BOUNDS).some((gate) => gate.instanceId === doorInReach!.doorId);
    setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (road ? " · the road to the Market Square" : ""));
    return;
  }
  if (ladderInReach) {
    setPrompt(getLadderPrompt(ladderInReach.fromTop));
    return;
  }
  if (bedInReach) {
    setPrompt(BED_PROMPT);
    return;
  }
  if (crops.inReach()) {
    setPrompt(crops.prompt());
    return;
  }
  if (trees.inReach()) {
    setPrompt(trees.prompt());
    return;
  }
  if (kitchen.inReach()) {
    setPrompt(kitchen.prompt());
    return;
  }
  if (workshop.inReach()) {
    setPrompt(workshop.prompt());
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
    const needs = nearbyPetProfile ? petNeedStatus(nearbyPetProfile) : null;
    const feedback = needs && nearbyPetProfile ? `${needs.label} · hunger ${Math.round(nearbyPetProfile.hunger)}% · ` : "";
    setPrompt(feedback + getPetInteractionPrompt(nearbyPet.name, { canPickUp, canFeed, canPlay }));
    return;
  }
  if (livestock.inReach()) {
    setPrompt(livestock.prompt());
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
  if (trees.chopping()) {
    trees.swing();
    return true;
  }
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
  if (bedInReach) {
    openNapDialog();
    return true;
  }
  if (crops.inReach()) return crops.interact();
  if (trees.inReach()) return trees.interact();
  if (kitchen.inReach()) return kitchen.interact();
  if (workshop.inReach()) return workshop.interact();
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
    return interactWithPet("pet");
  }
  return livestock.interact();
}

// Signed-out farms live on this device and harvest locally; an account farm harvests through the API.
const serverHarvests = layoutStore.accountBacked && canPersistFarm;
const achievementToaster = createAchievementToaster();

/** The Farming level on the server's record (farm-skills.mts). A local farm stays at 1. */
function farmingLevel(): number {
  return farmingLevelForXp(layout.skills.farming.xp);
}

/**
 * A harvest-shaped server call (a crop, a pick, a felling): send the farm as it
 * stands, adopt the farm that comes back, hand the answer to the controller
 * that asked. The server decides what was harvested and what it paid.
 */
async function submitServerHarvest(send: (sent: FarmLayout) => Promise<any>): Promise<any> {
  const sent = stampPresence(progressedLayout());
  const result = await send(sent);
  const next = result?.layout ? normalizeFarmLayout(result.layout) : null;
  if (next) adoptServerFarm(next, sent.clock.farmMinutes);
  return result;
}

/**
 * Take the farm as the server now holds it. If the server held the clock back
 * (it can only move as far as real time and the nap bank allow), the page's
 * clock follows it, keeping whatever time has passed since the request left.
 */
function adoptServerFarm(next: FarmLayout, sentMinutes: number): void {
  const sinceSent = Math.max(0, clockMinutes - sentMinutes);
  if (next.clock.farmMinutes < sentMinutes - 1e-3) clockMinutes = next.clock.farmMinutes + sinceSent;
  applyLayout(next);
  farmEditor.replaceLayout(next);
}

/** Run one available pet action through the shared registry. */
function interactWithPet(action: PetInteractionId): boolean {
  if (action === "call") return false;
  if (!nearbyPet) return false;
  if (action === "feed") {
    if (!nearbyPetCanFeed) return false;
    const result = feedPet(layout, nearbyPet.instanceId, clockMinutes);
    if (!result.ok) return false;
    const name = nearbyPet.name;
    petBodies.showHeart(nearbyPet.instanceId);
    petSim.attention(nearbyPet.instanceId);
    const note = treatmentNote(result.treatment ?? 0);
    void persistLayout(withFarmClock(result.layout, clockMinutes, Date.now())).then((saved) => {
      status.textContent = `${name} ate one serving of ${result.foodTitle}. ${note ? `${note} ` : ""}${saved}`;
    });
    return true;
  }
  if (action === "play" && !nearbyPetCanPlay) return false;
  const checkpoint = advancePetNeeds(layout, clockMinutes);
  const pet = checkpoint.pets.find((row) => row.instanceId === nearbyPet!.instanceId);
  if (!pet?.profile) return false;
  const reaction = reactToPetInteraction(pet.profile, pet.speciesId, action === "pick-up" ? "carry" : action, checkpoint.decor, clockMinutes);
  const name = nearbyPet.name;
  const note = treatmentNote(reaction.treatment);
  const message = `${name}: ${reaction.message}${note ? ` ${note}` : ""}`;
  // A refusal can still change rapport (an Independent pet remembers being grabbed), so persist either way.
  if (reaction.profile !== pet.profile) {
    const next = withFarmPets(checkpoint, checkpoint.pets.map((row) => row.instanceId === pet.instanceId ? { ...row, profile: reaction.profile } : row));
    void persistLayout(withFarmClock(next, clockMinutes, Date.now())).then((saved) => {
      status.textContent = `${message} ${saved}`;
    });
  } else {
    status.textContent = message;
  }
  if (!reaction.ok) {
    petSim.attention(nearbyPet.instanceId);
    return true;
  }
  if (action === "pet" || action === "play") {
    petBodies.showHeart(nearbyPet.instanceId);
    petSim.attention(nearbyPet.instanceId);
    return true;
  }
  if (!nearbyPetCanPickUp || !petSim.pickUp(nearbyPet.instanceId)) return false;
  carrying = nearbyPet.instanceId;
  carryPatienceSeconds = reaction.carrySeconds;
  petBodies.setTagVisible(carrying, false);
  nearbyPet = null;
  nearbyPetCanPickUp = false;
  nearbyPetCanFeed = false;
  nearbyPetCanPlay = false;
  return true;
}

/** H whistles once; every trusted, happy pet answers from wherever it is. */
function callPets(): boolean {
  const checkpoint = advancePetNeeds(layout, clockMinutes);
  let answered = 0;
  let refused = 0;
  for (const pet of checkpoint.pets) {
    if (!pet.profile) continue;
    const reaction = reactToPetCall(pet.profile);
    if (reaction.ok && petSim.call(pet.instanceId, player)) answered += 1;
    else refused += 1;
  }
  layout = checkpoint;
  if (answered > 0) status.textContent = answered === 1 ? "A trusted pet comes when called." : `${answered} trusted pets come when called.`;
  else if (refused > 0) status.textContent = "No pet feels ready to answer the call yet.";
  return answered + refused > 0;
}

/** E with a pet in hand: set it down ahead if it fits; otherwise the prompt has already said why not and E does nothing. */
function putPetDown(): boolean {
  const held = carrying ? petSim.find(carrying) : null;
  const spot = putDownAt;
  if (!held || !spot) return false;
  if (!petSim.putDown(held.instanceId, spot)) return false;
  petBodies.setTagVisible(held.instanceId, true);
  carrying = "";
  carryPatienceSeconds = null;
  return true;
}

/** Independent or distressed pets visibly wriggle free after the warned handling window. */
function updateCarryPatience(dt: number): void {
  if (!carrying || carryPatienceSeconds === null) return;
  carryPatienceSeconds -= dt;
  if (carryPatienceSeconds > 0 || !putDownAt) return;
  const held = petSim.find(carrying);
  if (!held || !putPetDown()) return;
  status.textContent = `${held.name} wriggled free and jumped down.`;
}

/** Build mode takes the pet out of the arms: ahead, else at the player's feet, else where a turn finds room; last resort, it stays carried. */
function dropCarried(): void {
  const held = carrying ? petSim.find(carrying) : null;
  if (!held) return;
  const radius = held.radius;
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
  cropsView.sync(layout, layout.agriculture, clockMinutes);
  treesView.sync(layout, clockMinutes);
  for (const doorId of [...openDoors]) if (!world.doorsFor(doorId)) openDoors.delete(doorId);
  obstacles = farmObstacles(layout, { openDoors });
  platforms = farmPlatforms(layout);
  ladders = farmLadders(layout);
  seats = farmSeats(layout);
  ponds = waterRegions(layout);
  if (body.mode === "seated" && !seats.some((seat) => seat.id === body.fixtureId)) applyBodyStep(standUp(player, body));
  if (body.mode === "climbing" && !ladders.some((ladder) => ladder.id === body.fixtureId)) applyBodyStep(releaseLadder(player, body));
  petSim.sync(layout);
  petsPanel.render(layout);
  inventoryPanel.render(layout.agriculture, skillLevels());
  kitchenSync();
  workshopSync();
  livestockSync();
  statsPanel.render(layout.skills, anglerLink.stats());
  renderFieldCapacity();
}

/** The levels that decide which saplings are on sale. A local farm stays at 1. */
function skillLevels(): Readonly<{ farming: number; woodcutting: number }> {
  return { farming: farmingLevel(), woodcutting: farmingLevelForXp(layout.skills.woodcutting.xp) };
}

/** How many crops are in the ground against how many may be: plots are placement, this is production. */
function renderFieldCapacity(): void {
  const fields = cropCapacityUse(layout.agriculture, layout.decor, farmingLevel());
  fieldCapacity.textContent = `${fields.used}/${fields.capacity} growing${fields.full ? " · fields full" : ""}`;
  fieldCapacity.classList.toggle("is-full", fields.full);
  // The skill lines under the seed HUD: account farms only.
  skillsHud.render(layout.skills, serverHarvests);
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
  if (napDialog.open || napRemainingMinutes > 0) {
    keys.clear();
    return;
  }
  // Build mode owns the keyboard: the editor listens for itself, and walking keys never reach the walker.
  if (farmEditor.isEditing()) {
    keys.clear();
    return;
  }
  // A dish on the stove owns the keyboard: E cuts, pulls and fans the fire, the arrows and WASD stir,
  // Escape takes it off the heat (nothing is used until it is served).
  if (kitchen.cooking()) {
    if (!event.repeat && kitchen.keyDown(event.code)) event.preventDefault();
    keys.clear();
    return;
  }
  // A piece on the bench owns the keyboard the same way: E marks and hammers, A/D saw, Escape stops.
  if (workshop.crafting()) {
    if (!event.repeat && workshop.keyDown(event.code)) event.preventDefault();
    keys.clear();
    return;
  }
  if (stationPanelOpen()) {
    if (event.code === "Escape") { kitchenPanel.close(); workshop.closePanels(); }
    keys.clear();
    return;
  }
  // Felling holds the player at the tree: a move key or Escape puts the axe down (the damage done is kept for
  // this visit), and so does opening a panel on top of it.
  if (trees.chopping() && (event.code === "Escape" || isMoveKey(event.code) || event.code === "KeyI" || event.code === "KeyP" || event.code === "KeyK")) {
    trees.cancelChop();
    keys.clear();
    if (event.code === "Escape" || isMoveKey(event.code)) return;
  }
  if (event.code === "KeyK" && !event.repeat && canManageFarm && farmEntered && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    statsPanel.toggle();
    keys.clear();
    return;
  }
  if (statsPanel.isOpen()) {
    if (event.code === "Escape") statsPanel.close();
    keys.clear();
    return;
  }
  if (event.code === "KeyI" && !event.repeat && canManageFarm && farmEntered && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    if (petsPanel.isOpen()) petsPanel.close();
    statsPanel.close();
    inventoryPanel.toggle();
    keys.clear();
    return;
  }
  if (inventoryPanel.isOpen()) {
    if (event.code === "Escape") inventoryPanel.close();
    keys.clear();
    return;
  }
  // L opens and closes the Livestock panel (farm-livestock-panel.mts); while it is open every other key is the panel's.
  if (event.code === "KeyL" && !event.repeat && farmEntered && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    livestockPanel.toggle();
    keys.clear();
    return;
  }
  if (livestockPanel.isOpen()) {
    if (event.code === "Escape") livestockPanel.close();
    keys.clear();
    return;
  }
  // P opens and closes the pets panel; while it is open every other key is the panel's.
  if (event.code === "KeyP" && !event.repeat && canManageFarm && farmEntered && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    if (petsPanel.isOpen()) petsPanel.close();
    else { inventoryPanel.close(); statsPanel.close(); petsPanel.open(); }
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
  const petInteraction = !event.repeat && farmEntered ? getPetInteraction(event.code) : null;
  if (petInteraction?.id === "call" && callPets()) {
    event.preventDefault();
    return;
  }
  if (petInteraction && nearbyPet && interactWithPet(petInteraction.id)) {
    event.preventDefault();
    return;
  }
  // G at a head of livestock: one serving of its feed (farm-livestock-controller.mts).
  if (event.code === "KeyG" && !event.repeat && farmEntered && !nearbyPet && livestock.inReach() && livestock.feed()) {
    event.preventDefault();
    return;
  }
  if (event.code === "KeyE" && !event.repeat && farmEntered) {
    if (interact()) event.preventDefault();
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  kitchen.keyUp(event.code);
  workshop.keyUp(event.code);
});
window.addEventListener("blur", () => {
  keys.clear();
  kitchen.keyUp("KeyE");
  workshop.keyUp("KeyE");
});

canvas.addEventListener("click", () => {
  if (farmEntered && !petsPanel.isOpen() && !livestockPanel.isOpen() && !inventoryPanel.isOpen() && !statsPanel.isOpen() && !stationPanelOpen() && !farmEditor.isEditing()) canvas.requestPointerLock?.().catch(() => undefined);
});
starterDogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const completed = completeFarmOnboarding(layout, starterDogName.value);
  if (!completed.ok) {
    onboardingStatus.textContent = "Give your dog a name first.";
    starterDogName.focus();
    return;
  }
  nameStarterDog.disabled = true;
  onboardingStatus.textContent = "Saving your new farm…";
  if (onboardingInitialization) await onboardingInitialization;
  const saved = await layoutStore.save(completed.layout);
  if (!saved.ok) {
    nameStarterDog.disabled = false;
    onboardingStatus.textContent = "Your farm could not be saved. Try again in a moment.";
    return;
  }
  applyLayout(completed.layout);
  farmEditor.replaceLayout(completed.layout);
  starterDogName.value = "";
  starterDogForm.hidden = true;
  enterButton.hidden = false;
  startTag.textContent = "YOUR FARM IS READY";
  startHeading.textContent = `Meet ${completed.layout.pets[0]?.name ?? "your dog"}.`;
  startCopy.textContent = "Your dog and starter supplies are saved. Head onto the field when you are ready.";
  onboardingStatus.textContent = "";
  enterButton.focus();
});

enterButton.addEventListener("click", () => {
  if (canManageFarm && layout.onboarding.status !== "complete") return;
  farmEntered = true;
  // The first time an owner steps onto the farm starts its offline production;
  // record it at once so a closed tab cannot lose the fact.
  if (canManageFarm && layout.clock.checkpointAt <= 0) void persistLayout(withProductionCheckpoint(layout, Date.now()));
  if (pendingAwayReport) awayReport.show(pendingAwayReport);
  pendingAwayReport = null;
  farmMusic.start();
  startGate.classList.add("is-hidden");
  canvas.focus();
  status.textContent = "WASD to move · Drag to look · Click for mouse capture";
});
window.addEventListener("pagehide", () => {
  if (canPersistFarm) void layoutStore.save(stampPresence(progressedLayout()), { keepalive: true });
  farmMusic.destroy();
}, { once: true });
// A hidden tab is time away like any other: crops catch up at the offline rate
// when it comes back. (The clock itself does not run while hidden.)
document.addEventListener("visibilitychange", () => {
  if (!canManageFarm || !farmEntered) return;
  if (document.hidden) {
    hiddenSince = Date.now();
    return;
  }
  const since = hiddenSince;
  hiddenSince = 0;
  const span = offlineSpan(since, Date.now());
  if (span.awayMs < 60_000 || layout.clock.checkpointAt <= 0) return;
  const progressed = progressedLayout();
  const caughtUp = applyOfflineProduction(progressed.agriculture, span, clockMinutes, progressed.trees);
  if (caughtUp.report) awayReport.show(caughtUp.report);
  void persistLayout(withFarmTrees(withFarmAgriculture(progressed, caughtUp.agriculture), caughtUp.trees));
});
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
  if (petsPanel.isOpen() || inventoryPanel.isOpen() || statsPanel.isOpen() || stationPanelOpen() || stationBusy() || farmEditor.isEditing()) return;
  if (document.pointerLockElement !== canvas && !draggingLook) return;
  const looked = lookWalker(player, event.movementX, event.movementY);
  player.yaw = looked.yaw;
  player.pitch = looked.pitch;
});

function updatePlayer(dt: number): void {
  if (!farmEntered || leavingForMarket || trees.chopping() || stationBusy() || petsPanel.isOpen() || inventoryPanel.isOpen() || statsPanel.isOpen() || stationPanelOpen() || farmEditor.isEditing() || napDialog.open || napRemainingMinutes > 0) return;
  const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms, ladders, ground: groundAt, waterDepth: waterAt });
  if (!step.moved) return;
  player.x = step.pose.x;
  player.z = step.pose.z;
  body = step.body;
}

/** Below a pond's surface the world goes murky; back above it, the air's fog returns. */
function updateUnderwater(surfaced = false): void {
  const under = !surfaced && !farmEditor.isEditing() && underwater(ponds, { x: camera.position.x, z: camera.position.z }, camera.position.y);
  world.setUnderwater(under);
  document.body.classList.toggle("is-underwater", under);
  underwaterOverlay?.classList.toggle("is-visible", under);
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
  if (result.ok && result.target === "device") return "Saved on this device · sign in to keep farm progression with your account.";
  if (!layoutStore.accountBacked) return "This device could not save the farm.";
  return "The database save failed. Your farm was not saved; try again in a moment.";
}

/** Pets-panel changes land here: apply, tell the editor, then save, and say where the save went. */
async function persistLayout(next: FarmLayout): Promise<string> {
  if (!canManageFarm) return "This farm is read-only while visiting.";
  next = stampPresence(applyPetCareMilestones(next));
  applyLayout(next);
  farmEditor.replaceLayout(next);
  if (!canPersistFarm) return "Session only · reload when the farm database is available to save safely.";
  return describeSave(await layoutStore.save(layout));
}

function progressedLayout(): FarmLayout {
  const needs = advancePetNeeds(layout, clockMinutes);
  const grown = withFarmTrees(withFarmAgriculture(needs, advanceAgriculture(needs.agriculture, clockMinutes)), advanceFarmTrees(needs.trees, clockMinutes));
  return withFarmClock(grown, clockMinutes, Date.now());
}

async function persistFarmProgress(): Promise<void> {
  await persistLayout(progressedLayout());
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
    if (!layoutStore.accountBacked) return "Sign in to adopt another pet with tickets.";
    const result = await ticketClient.adoptFarmPet(speciesId, name, farmPurchaseId("adopt"));
    if (!result?.ok) {
      if (result?.error === "insufficient_tickets") return "You do not have enough tickets for that adoption yet.";
      if (result?.error === "farm_full") return "The farm is full. Release one pet before adopting another.";
      if (result?.error === "needs_water") return "That animal needs a pond on the farm first.";
      return "That adoption did not go through. Try again.";
    }
    const next = normalizeFarmLayout(result.layout);
    applyLayout(next);
    farmEditor.replaceLayout(next);
    if (Number.isSafeInteger(result.balance)) publishTicketBalance(result.balance);
    const pet = next.pets.at(-1);
    return `${pet?.name ?? "Your pet"} moved in with 5 servings of food. ${Number(result.balance).toLocaleString()} tickets remain.`;
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

const cropThumbnails = createCropThumbnails(THREE);
// Every other item — produce, dishes, logs, saplings, feed — is portrayed by its own model.
const itemThumbnails = createFarmItemThumbnails(THREE);
// The Cove's fish on the farm (farm-angler-link.mts): the creel the fish recipes cook from, the fish
// mounted for build mode's Trophy Mounts, and every mount on the field dressed with its fish.
const portraits = createFishPortraits(THREE, itemThumbnails.get);
const anglerLink = createAnglerLink({
  THREE,
  api: layoutStore.ownerPlayerId ? createPlatformApiClient() : null,
  ownerId: layoutStore.ownerPlayerId,
  isOwner: !visiting && layoutStore.accountBacked,
  modelFor: (instanceId) => world.modelFor(instanceId),
  onChange: () => statsPanel.render(layout.skills, anglerLink.stats()),
});
void anglerLink.refresh();

// Livestock (planning-docs/FARM_LIVESTOCK_PLAN.md): the server's herd, kept in the farm's stalls, barn and pens.
const livestockPanel = createLivestockPanel({
  root: requiredElement<HTMLElement>("#livestockPanel"),
  openButton: requiredElement<HTMLButtonElement>("#openLivestock"),
  closeButton: requiredElement<HTMLButtonElement>("#closeLivestock"),
  list: requiredElement<HTMLElement>("#livestockList"),
  count: requiredElement<HTMLElement>("#livestockCount"),
  status: requiredElement<HTMLElement>("#livestockStatus"),
}, {
  move: (animalId, homeId) => livestock.move(animalId, homeId),
  rename: (animalId, name) => livestock.rename(animalId, name),
}, {
  beforeOpen: () => { petsPanel.close(); inventoryPanel.close(); statsPanel.close(); },
  onClose: () => canvas.focus(),
});
const livestock = createFarmLivestockController({
  THREE,
  scene,
  api: layoutStore.ownerPlayerId ? createPlatformApiClient() : null,
  ownerId: layoutStore.ownerPlayerId,
  canManage: canManageFarm && layoutStore.accountBacked,
  layout: () => layout,
  clockMinutes: () => clockMinutes,
  obstacles: () => obstaclesForSpan(obstacles, 0.05, 1.2),
  keepOut: () => keepOutBoxes(layout),
  water: () => waterRegions(layout),
  panel: livestockPanel,
  // Care goes through the harvest seam: the farm is sent, the server settles the herd and answers with the farm.
  submit: canManageFarm && serverHarvests ? submitServerHarvest : null,
  setStatus: (text) => { status.textContent = text; livestockPanel.setStatus(text); },
});
livestockSync = () => livestock.sync();
void livestock.refresh();
for (const button of [openPetsButton, openInventoryButton, openStatsButton]) button.addEventListener("click", () => livestockPanel.close());
if (visiting) requiredElement<HTMLButtonElement>("#openLivestock").title = "The livestock on this farm (L)";
const inventoryPanel = createFarmInventoryPanel({
  root: requiredElement<HTMLElement>("#inventoryPanel"),
  openButton: openInventoryButton,
  closeButton: requiredElement<HTMLButtonElement>("#closeInventory"),
  seedGrid: requiredElement<HTMLElement>("#seedGrid"),
  produceGrid: requiredElement<HTMLElement>("#produceGrid"),
  suppliesGrid: requiredElement<HTMLElement>("#suppliesGrid"),
  saplingGrid: requiredElement<HTMLElement>("#saplingGrid"),
  logsGrid: requiredElement<HTMLElement>("#logsGrid"),
  planksGrid: requiredElement<HTMLElement>("#planksGrid"),
  furnitureGrid: requiredElement<HTMLElement>("#furnitureGrid"),
  pantryGrid: requiredElement<HTMLElement>("#pantryGrid"),
  selected: requiredElement<HTMLElement>("#selectedSeed"),
}, {
  thumbnail: cropThumbnails.get,
  itemThumbnail: itemThumbnails.get,
  purchaseSupply: layoutStore.accountBacked ? async (itemId, quantity) => {
    const result = await ticketClient.purchaseFarmSupply(itemId, quantity, farmPurchaseId("supply"));
    if (!result?.ok) return result?.error === "insufficient_tickets" ? "Not enough tickets." : result?.error === "inventory_full" ? "That supply stack is full." : "Purchase failed. Try again.";
    const next = normalizeFarmLayout(result.layout);
    applyLayout(next);
    farmEditor.replaceLayout(next);
    if (Number.isSafeInteger(result.balance)) publishTicketBalance(result.balance);
    return `Purchased · ${Number(result.balance).toLocaleString()} tickets remain.`;
  } : null,
});
inventoryPanel.render(layout.agriculture, skillLevels());
renderFieldCapacity();
if (visiting) openInventoryButton.hidden = true;

const statsPanel = createFarmStatsPanel({
  root: requiredElement<HTMLElement>("#statsPanel"),
  openButton: openStatsButton,
  closeButton: requiredElement<HTMLButtonElement>("#closeStats"),
  summary: requiredElement<HTMLElement>("#statsSummary"),
  grid: requiredElement<HTMLElement>("#statsGrid"),
}, {
  beforeOpen: () => { inventoryPanel.close(); petsPanel.close(); },
});
statsPanel.render(layout.skills, anglerLink.stats());
openInventoryButton.addEventListener("click", () => statsPanel.close());
openPetsButton.addEventListener("click", () => statsPanel.close());
if (visiting) openStatsButton.hidden = true;

// The field's producers. Growing plots (farm-crops-controller.mts) and the orchard and forestry
// (farm-trees-controller.mts); an account farm's harvests, picks and fellings are the server's.
const crops = createFarmCropsController({
  layout: () => layout,
  clockMinutes: () => clockMinutes,
  selectedCropId: () => inventoryPanel.selectedCropId(),
  farmingLevel,
  persist: persistLayout,
  submitHarvest: serverHarvests ? (plotId, cellId) => submitServerHarvest((sent) => ticketClient.harvestFarmCrop(sent, plotId, cellId)) : null,
  setStatus: (text) => { status.textContent = text; },
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
});
const trees = createFarmTreesController({
  view: treesView,
  meter: createChopMeter(requiredElement<HTMLElement>("#chopMeter")),
  layout: () => layout,
  clockMinutes: () => clockMinutes,
  selectedSaplingId: () => inventoryPanel.selectedSaplingId(),
  persist: persistLayout,
  submitHarvest: serverHarvests ? (plotId) => submitServerHarvest((sent) => ticketClient.harvestFarmTree(sent, plotId)) : null,
  setStatus: (text) => { status.textContent = text; },
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
});

// The kitchen (farm-kitchen-controller.mts): E at a Kitchen Range opens the cookbook, Cook plays the
// cooking games at the stove, and an account farm's dish is made by the server.
const kitchenPanel = createKitchenPanel({
  root: requiredElement<HTMLElement>("#kitchenPanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeKitchen"),
  level: requiredElement<HTMLElement>("#kitchenLevel"),
  list: requiredElement<HTMLElement>("#recipeList"),
  detail: requiredElement<HTMLElement>("#recipeDetail"),
  status: requiredElement<HTMLElement>("#kitchenStatus"),
}, {
  thumbnail: portraits,
  cook: (recipeId) => kitchen.begin(recipeId),
  earnsXp: () => serverHarvests,
  creel: () => anglerLink.creel(),
  onClose: () => canvas.focus(),
});
const kitchen = createFarmKitchenController({
  panel: kitchenPanel,
  hud: createCookingHud(requiredElement<HTMLElement>("#cookingHud"), { thumbnail: itemThumbnails.get }),
  view: kitchenView,
  layout: () => layout,
  persist: persistLayout,
  submitCook: serverHarvests ? (recipeId, scores, cookId) => submitServerHarvest((sent) => ticketClient.cookFarmDish(sent, recipeId, scores, cookId)) : null,
  setStatus: (text) => { status.textContent = text; },
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
  creel: () => anglerLink.creel(),
  onFishUsed: () => { void anglerLink.refresh(); },
});
kitchenSync = () => kitchen.sync();

// The workshop (farm-workshop-controller.mts): E at the Carpenter's Workbench opens the pattern book and
// Make plays the carpentry games; E at the farm's own Sawmill saws logs for free. Every plank and piece is the server's.
const workshop = createFarmWorkshopController({
  panel: createWorkshopPanel({
    root: requiredElement<HTMLElement>("#workshopPanel"),
    closeButton: requiredElement<HTMLButtonElement>("#closeWorkshop"),
    level: requiredElement<HTMLElement>("#workshopLevel"),
    list: requiredElement<HTMLElement>("#patternList"),
    detail: requiredElement<HTMLElement>("#patternDetail"),
    status: requiredElement<HTMLElement>("#workshopStatus"),
  }, {
    thumbnail: itemThumbnails.get,
    make: (itemId) => workshop.begin(itemId),
    canMake: () => serverHarvests,
    onClose: () => canvas.focus(),
  }),
  millPanel: createMillPanel({
    root: requiredElement<HTMLElement>("#millPanel"),
    closeButton: requiredElement<HTMLButtonElement>("#closeMill"),
    list: requiredElement<HTMLElement>("#millList"),
    status: requiredElement<HTMLElement>("#millStatus"),
  }, {
    feePerLog: 0,
    thumbnail: itemThumbnails.get,
    emptyNote: "No logs to saw. Fell a grown timber tree in a Tree Plot first.",
    mill: async (speciesId, logs) => {
      if (!serverHarvests) return { ok: false, message: "Sign in to saw logs into planks." };
      const result = await submitServerHarvest((sent) => ticketClient.millFarmLogs(sent, speciesId, logs, "farm", farmPurchaseId("mill")));
      if (Array.isArray(result?.achievements) && result.achievements.length) achievementToaster.show("farm", "The Farm", result.achievements);
      return millOutcome(result, () => layout);
    },
    onClose: () => canvas.focus(),
  }),
  hud: createCraftingHud(requiredElement<HTMLElement>("#craftingHud"), { thumbnail: itemThumbnails.get }),
  view: workshopView,
  layout: () => layout,
  submitCraft: serverHarvests ? (itemId, scores, craftId) => submitServerHarvest((sent) => ticketClient.craftFarmPiece(sent, itemId, scores, craftId)) : null,
  setStatus: (text) => { status.textContent = text; },
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
});
workshopSync = () => workshop.sync();

/** A dish on the stove or a piece on the bench: the station owns the player. */
function stationBusy(): boolean {
  return kitchen.cooking() || workshop.crafting();
}

/** The cookbook, the pattern book or the Sawmill's counter is open. */
function stationPanelOpen(): boolean {
  return kitchenPanel.isOpen() || workshop.panelOpen();
}

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
  inventory: farmInventory,
  ticketPrices,
  ticketBalance: Number.isSafeInteger(shop?.balance) ? shop.balance : null,
  purchaseItem: layoutStore.accountBacked && shop ? async (itemId) => {
    const result = await ticketClient.purchaseShopItem("farm", itemId);
    if (Number.isSafeInteger(result?.balance)) publishTicketBalance(result.balance);
    return result;
  } : null,
  purchaseSeeds: layoutStore.accountBacked ? async (cropId, quantity) => {
    const result = await ticketClient.purchaseFarmSupply(`seed.${cropId}`, quantity, farmPurchaseId("seed"));
    if (Number.isSafeInteger(result?.balance)) publishTicketBalance(result.balance);
    return result;
  } : null,
  persist: async (next) => {
    if (!canPersistFarm) return { ok: false, message: "Session only · reload when the farm database is available to save safely." };
    const cared = stampPresence(applyPetCareMilestones(next));
    if (cared !== next) {
      applyLayout(cared);
      farmEditor.replaceLayout(cared);
    }
    const result = await layoutStore.save(cared);
    return { ok: result.ok, message: describeSave(result) };
  },
  thumbnail: (definition) => decorThumbnails.get(definition),
  cropThumbnail: cropThumbnails.get,
  trophies: () => anglerLink.trophies(),
  trophyThumbnail: portraits,
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
    seedCatalog: requiredElement<HTMLElement>("#farmSeedCatalog"),
    catalogTitle: requiredElement<HTMLElement>("#farmCatalogTitle"),
    catalogHint: requiredElement<HTMLElement>("#farmCatalogHint"),
    catalog: requiredElement<HTMLElement>("#farmCatalog"),
    placed: requiredElement<HTMLElement>("#farmPlaced"),
    inspector: requiredElement<HTMLElement>("#farmInspector"),
  },
  // A visitor can never build, and the pets panel and the start gate own the screen while they are up.
  canEnter: () => canManageFarm && farmEntered && !petsPanel.isOpen() && !livestockPanel.isOpen() && !inventoryPanel.isOpen() && !statsPanel.isOpen() && !stationPanelOpen() && !stationBusy() && !napDialog.open && napRemainingMinutes <= 0,
  onEditingChange: (editing) => {
    keys.clear();
    draggingLook = false;
    grid.visible = editing;
    if (editing) dropCarried();
    if (editing) trees.cancelChop();
    // Come up for air first, so the underwater fog does not keep the overview's fog when it lets go.
    if (editing) updateUnderwater(true);
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

// A quarter-hour checkpoint keeps visible needs current without tying survival
// to render frames. Durable writes remain at the existing save/nap/pagehide seams.
liveNeedsCheckpoint = () => {
  if (!canManageFarm) return;
  layout = withFarmClock(advancePetNeeds(layout, clockMinutes), clockMinutes, Date.now());
  petSim.sync(layout);
  petsPanel.render(layout);
  farmEditor.replaceLayout(layout);
};

// The front gate is the road to the Market Square: open it and walk into the gap.
// The farm is saved first (the square reads the produce the account holds), then
// the page goes; the pagehide save still runs behind it as it always does.
let leavingForMarket = false;
function checkGateway(): void {
  if (!farmEntered || leavingForMarket || farmEditor.isEditing() || body.mode !== "walking") return;
  if (!gatewayAt(layout.decor, openDoors, player, FARM_BOUNDS)) return;
  if (carrying) {
    setPrompt(`Set ${petSim.find(carrying)?.name ?? "your pet"} down before heading to the market`);
    return;
  }
  leavingForMarket = true;
  keys.clear();
  document.exitPointerLock?.();
  document.body.classList.add("is-leaving");
  status.textContent = "Off down the road to the Market Square…";
  setPrompt("Off down the road to the Market Square…");
  const departure = canPersistFarm ? layoutStore.save(stampPresence(progressedLayout())) : Promise.resolve(null);
  void departure.catch(() => null).then(() => {
    const back = visiting ? `?farm=${encodeURIComponent(layoutStore.ownerPlayerId)}` : "";
    location.href = `market/index.html${back}`;
  });
}

const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now: number): void {
  // Clamped both ways: a frame stamped before the last one (a stale first frame) must not drive the accumulator negative.
  const frameSeconds = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
  accumulator += frameSeconds;
  previous = now;
  while (accumulator >= TICK_SECONDS) {
    // The farm stands still at the gate: time only passes once the player is on it.
    if (farmEntered) updateFarmTime(TICK_SECONDS);
    updatePlayer(TICK_SECONDS);
    checkGateway();
    petSim.tick(TICK_SECONDS, { x: player.x, z: player.z, yaw: player.yaw, y: body.y });
    livestock.tick(TICK_SECONDS, player);
    updateInteraction();
    trees.tick();
    kitchen.tick();
    workshop.tick();
    updateCarryPatience(TICK_SECONDS);
    accumulator -= TICK_SECONDS;
  }
  world.update(frameSeconds);
  // Trophy Mounts pick up their fish (and a rebuilt model its fish again); cheap when nothing changed.
  anglerLink.dress(layout);
  treesView.update(frameSeconds);
  kitchenView.update(frameSeconds);
  petBodies.sync(petSim.pets(), frameSeconds);
  livestock.draw(frameSeconds);
  if (!farmEditor.isEditing()) applyCamera();
  updateUnderwater();
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
  livestock: () => livestock.poses(),
  livestockInReach: () => livestock.inReach(),
  nearbyPet: () => nearbyPet?.instanceId ?? "",
  carrying: () => carrying,
  putDownFits: () => putDownAt !== null,
  layout: () => layout,
  chopping: () => trees.chopping(),
  kitchenInReach: () => kitchen.inReach(),
  cooking: () => kitchen.cooking(),
  cookbookOpen: () => kitchenPanel.isOpen(),
  workshopInReach: () => workshop.inReach(),
  crafting: () => workshop.crafting(),
  workshopPanelOpen: () => workshop.panelOpen(),
  editing: () => farmEditor.isEditing(),
  time: () => clockMinutes,
  napping: () => napRemainingMinutes > 0,
  obstacles: () => obstacles,
  ponds: () => ponds,
  underwater: () => document.body.classList.contains("is-underwater"),
});

applyCamera();
syncFullscreenButton();
requestAnimationFrame(frame);
