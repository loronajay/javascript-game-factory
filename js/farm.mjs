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
import { EYE_HEIGHT, FARM_SPAWN, doorRows, nearestDoor, farmLadders, farmObstacles, farmPlatforms, farmSeats, keepOutBoxes, waterRegions } from "./farm-scene.mjs";
import { groundHeightAt, underwater, waterDepthAt } from "./farm-pond.mjs";
import { createFarmBody, eyeHeight, grabLadder, isMoveKey, obstaclesForSpan, releaseLadder, sitOn, standUp, stepFarmBody } from "./farm-body.mjs";
import { BED_PROMPT, CLIMBING_PROMPT, SEAT_PROMPT, SEATED_PROMPT, canWorkDoor, findBedInReach, findLadderInReach, findPetInReach, findSeatInReach, getDoorPrompt, findPutDownSpot, getLadderPrompt, getPetInteraction, getPetInteractionPrompt, getPutDownPrompt, putDownSpot } from "./farm-interaction.mjs";
import { FARM_BOUNDS, createDefaultFarmLayout, farmCacheKey, normalizeFarmLayout, removePet, renamePet, withFarmAgriculture, withFarmClock, withFarmPets } from "./farm-layout.mjs";
import { createFarmEditor } from "./farm-editor.mjs";
import { createFarmDecorThumbnails } from "./farm-decor-thumbnails.mjs";
import { createPetSim } from "./farm-pets.mjs";
import { assetUrlFor, createPetBodies } from "./farm-pet-bodies.mjs";
import { createPetsPanel } from "./farm-pets-panel.mjs";
import { createAvatarThumbnails } from "./arcade-room-avatar-thumbnails.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
import { createFarmInventory } from "./farm-catalog/inventory.mjs";
import { createTicketWalletClient, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { animalTrack, splitAnimalClips } from "./farm-animal-clips.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { FARM_MINUTES_PER_REAL_SECOND, NAP_MINUTES_PER_REAL_SECOND, advanceFarmTime, farmLightProfile, formatFarmTime, quantizeFarmTime, resumeFarmClock } from "./farm-time.mjs";
import { SOIL_CELL_LAYOUT, advanceAgriculture, cropStatus, findCrop, findSoilCellInReach, harvestFarmCrop, plantFarmCrop, tendFarmCrop, waterFarmCrop } from "./farm-crops.mjs";
import { createFarmCropsView } from "./farm-crops-view.mjs";
import { createFarmInventoryPanel } from "./farm-inventory-panel.mjs";
import { createCropThumbnails } from "./farm-crop-thumbnails.mjs";
import { completeFarmOnboarding, markFarmIntroSeen } from "./farm-onboarding.mjs";
import { advancePetNeeds, advancePetProfile, feedPet, petNeedStatus } from "./farm-pet-needs.mjs";
import { findPetCare, treatmentNote } from "./farm-pet-care.mjs";
import { applyPetCareMilestones, petCareEnvironment, reactToPetInteraction } from "./farm-pet-happiness.mjs";
import { reactToPetCall } from "./farm-pet-outcomes.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Farm is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#farmCanvas");
const prompt = requiredElement("#farmPrompt");
const startGate = requiredElement("#startGate");
const enterButton = requiredElement("#enterFarm");
const status = requiredElement("#farmStatus");
const fullscreenButton = requiredElement("#fullscreenFarm");
const musicButton = requiredElement("#toggleFarmMusic");
const farmTitle = requiredElement("#farmTitle");
const farmEyebrow = requiredElement("#farmEyebrow");
const startTag = requiredElement("#startTag");
const startHeading = requiredElement("#startHeading");
const startCopy = requiredElement("#startCopy");
const ownerLink = requiredElement("#farmOwnerLink");
const openPetsButton = requiredElement("#openPets");
const petsPanelRoot = requiredElement("#petsPanel");
const editButton = requiredElement("#editFarm");
const editorPanel = requiredElement("#farmEditor");
const editorDrawer = requiredElement("#farmEditorDrawer");
const farmClock = requiredElement("#farmClock");
const farmClockPhase = requiredElement("#farmClockPhase");
const napDialog = requiredElement("#napDialog");
const napStatus = requiredElement("#napStatus");
const openInventoryButton = requiredElement("#openInventory");
const starterDogForm = requiredElement("#starterDogForm");
const starterDogName = requiredElement("#starterDogName");
const nameStarterDog = requiredElement("#nameStarterDog");
const onboardingStatus = requiredElement("#onboardingStatus");
const farmMusic = createFarmMusic();
function renderMusicButton() {
    const muted = farmMusic.isMuted();
    musicButton.setAttribute("aria-pressed", String(muted));
    musicButton.setAttribute("aria-label", muted ? "Unmute music" : "Mute music");
    musicButton.title = muted ? "Play farm music (M)" : "Mute farm music (M)";
    musicButton.firstChild.textContent = muted ? "Music off " : "Music on ";
}
function toggleFarmMusic() {
    farmMusic.setMuted(!farmMusic.isMuted());
    renderMusicButton();
}
musicButton.addEventListener("click", toggleFarmMusic);
renderMusicButton();
/** The farm's document, on the shared store: slug `farm`, its own cache bucket, its own normalizer. */
export const FARM_LAYOUT_SPEC = Object.freeze({
    slug: "farm",
    cacheKey: farmCacheKey,
    normalize: normalizeFarmLayout,
    createDefault: createDefaultFarmLayout,
});
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
const ticketPrices = new Map(Array.isArray(shop?.items)
    ? shop.items.filter((entry) => typeof entry?.id === "string" && Number.isSafeInteger(entry?.price) && entry.price > 0)
        .map((entry) => [entry.id, entry.price])
    : []);
const farmPurchaseId = (kind) => `${kind}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const canManageFarm = !visiting;
// A signed-in fallback must never overwrite the database with a stale device
// copy or starter layout. Signed-out owners, however, save normally on-device.
const canPersistFarm = canManageFarm && (!layoutStore.ownerPlayerId || (layoutStore.accountBacked && loaded.source === "account"));
let layout = loaded.layout;
const showFarmIntro = canManageFarm && layout.onboarding.status === "needs_name" && !layout.onboarding.introSeen;
let onboardingInitialization = null;
const resumedClock = resumeFarmClock(layout.clock, Date.now());
layout = withFarmClock(advancePetNeeds(layout, resumedClock.farmMinutes), resumedClock.farmMinutes, resumedClock.updatedAt);
if (showFarmIntro) {
    layout = markFarmIntroSeen(layout);
    // This first write pins the random seed pool before a reload can make a new one.
    // Account fallback sessions are intentionally read-only, as with every farm write.
    if (canPersistFarm)
        onboardingInitialization = layoutStore.save(layout);
}
function applyFarmIdentity() {
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
        editButton.hidden = true;
        ownerLink.href = `../player/index.html?id=${encodeURIComponent(layoutStore.ownerPlayerId)}`;
        ownerLink.hidden = false;
        return;
    }
    ownerLink.hidden = true;
    if (!layoutStore.ownerPlayerId) {
        startTag.textContent = "LOCAL FARM";
        startCopy.textContent = "Play, build and grow while signed out. This farm saves on this device; sign in and reload to keep progression with your account.";
    }
    else if (!canPersistFarm) {
        startTag.textContent = "DATABASE TEMPORARILY UNAVAILABLE";
        startCopy.textContent = "You can still play and build in this session. Saving is paused so a starter or stale device copy cannot overwrite your account farm.";
    }
}
applyFarmIdentity();
function renderOnboardingGate() {
    const onboardingRequired = canManageFarm && layout.onboarding.status === "needs_name";
    starterDogForm.hidden = !onboardingRequired;
    enterButton.hidden = onboardingRequired;
    if (!onboardingRequired)
        return;
    startTag.textContent = showFarmIntro ? "WELCOME TO YOUR FARM" : "YOUR FIRST FARM FRIEND";
    startHeading.textContent = showFarmIntro ? "A field, a future, and a dog." : "Name your dog to continue.";
    startCopy.textContent = showFarmIntro
        ? "Your new farm includes one growing plot, six kinds of seed, 20 servings of Dog Food, and a dog of your own. Give your dog a name before you step onto the field."
        : "Your starter supplies are safe. Give your dog a name before normal farm play begins.";
    if (!canPersistFarm) {
        nameStarterDog.disabled = true;
        onboardingStatus.textContent = "Saving is unavailable right now. Reload when the farm database is back.";
    }
}
renderOnboardingGate();
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
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
// `?time=<minute-of-day>` is a visual-QA seam for checking any light state without waiting through the cycle.
const previewMinute = new URLSearchParams(location.search).get("time");
let clockMinutes = previewMinute === null ? resumedClock.farmMinutes : advanceFarmTime(Number(previewMinute), 0, 0);
let napRemainingMinutes = 0;
let renderedQuarter = -1;
let liveNeedsCheckpoint = null;
world.setTime(clockMinutes);
const cropsView = createFarmCropsView(THREE, scene);
cropsView.sync(layout, layout.agriculture, clockMinutes);
const player = { x: FARM_SPAWN.x, z: FARM_SPAWN.z, yaw: FARM_SPAWN.yaw, pitch: -0.03 };
// How high the player is and what they are doing with it: on the ground, up a ladder, on a loft, on a bench.
let body = createFarmBody();
const walkerBounds = { halfWidth: FARM_BOUNDS.width / 2, halfDepth: FARM_BOUNDS.depth / 2, margin: FARM_BOUNDS.wallInset };
// Solid things change when a door or a gate swings: a shut one is an obstacle, an open one is not.
// Keyed by door id: a building or gate under its instance id, a stall half-door under `<instanceId>-<fixture>`.
const openDoors = new Set();
let obstacles = farmObstacles(layout, { openDoors });
let platforms = farmPlatforms(layout);
let ladders = farmLadders(layout);
let seats = farmSeats(layout);
// The ponds dug into the field: what the feet stand on in them and when the eyes are under water.
let ponds = waterRegions(layout);
const groundAt = (point) => groundHeightAt(ponds, point);
const waterAt = (point) => waterDepthAt(ponds, point);
const underwaterOverlay = document.querySelector(".farm-underwater");
// What E would do right now: the door, ladder or seat the player is at, or null.
let doorInReach = null;
let ladderInReach = null;
let seatInReach = null;
let bedInReach = null;
let soilInReach = null;
let nearbyPetCanPickUp = false;
let nearbyPetCanFeed = false;
let nearbyPetCanPlay = false;
const keys = new Set();
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
let nearbyPet = null;
// The pet in the player's arms, by instance id, and the spot ahead it would be set down on right now (null: no room).
let carrying = "";
let carryPatienceSeconds = null;
let putDownAt = null;
function applyCamera() {
    camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
}
function forwardVector() {
    return forwardOf(player.yaw);
}
function setPrompt(text) {
    prompt.textContent = text;
    prompt.classList.toggle("is-visible", Boolean(text));
}
function renderFarmClock() {
    const quarter = quantizeFarmTime(clockMinutes);
    if (quarter === renderedQuarter)
        return;
    renderedQuarter = quarter;
    farmClock.textContent = formatFarmTime(clockMinutes);
    farmClockPhase.textContent = farmLightProfile(clockMinutes).phase;
    cropsView.sync(layout, layout.agriculture, clockMinutes);
    liveNeedsCheckpoint?.();
}
function finishNap() {
    napRemainingMinutes = 0;
    document.body.classList.remove("is-napping");
    napStatus.textContent = `You wake up at ${formatFarmTime(clockMinutes)}.`;
    void persistFarmProgress();
}
function updateFarmTime(dt) {
    if (napRemainingMinutes > 0) {
        const elapsed = Math.min(napRemainingMinutes, dt * NAP_MINUTES_PER_REAL_SECOND);
        clockMinutes += elapsed;
        napRemainingMinutes -= elapsed;
        if (napRemainingMinutes <= 1e-6)
            finishNap();
    }
    else {
        clockMinutes += dt * FARM_MINUTES_PER_REAL_SECOND;
    }
    world.setTime(clockMinutes);
    renderFarmClock();
}
function openNapDialog() {
    keys.clear();
    document.exitPointerLock?.();
    napStatus.textContent = `It is ${formatFarmTime(clockMinutes)}. The farm keeps moving while you sleep.`;
    napDialog.showModal();
}
function startNap(hours) {
    if (!Number.isFinite(hours) || hours <= 0 || napRemainingMinutes > 0)
        return;
    napRemainingMinutes = hours * 60;
    napDialog.close();
    document.body.classList.add("is-napping");
}
for (const button of napDialog.querySelectorAll("[data-nap-hours]")) {
    button.addEventListener("click", () => startNap(Number(button.dataset.napHours)));
}
renderFarmClock();
function updateInteraction() {
    const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardVector() };
    const walking = farmEntered && !farmEditor.isEditing() && !napDialog.open && napRemainingMinutes <= 0 && body.mode === "walking";
    // A released pet leaves the arms with the layout.
    if (carrying && !petSim.find(carrying))
        carrying = "";
    // In order of what is nearest to hand: a door, then — hands free — a ladder, a seat, a pet. A door is still worked with a pet in hand.
    doorInReach = walking ? nearestDoor(doorRows(layout), pose, (entry) => canWorkDoor(pose, entry.door, entry.reach)) : null;
    const handsFree = walking && !carrying;
    ladderInReach = handsFree && !doorInReach ? findLadderInReach(ladders, pose) : null;
    bedInReach = handsFree && !doorInReach && !ladderInReach ? findBedInReach(layout.decor, pose) : null;
    soilInReach = handsFree && canManageFarm && !doorInReach && !ladderInReach && !bedInReach ? findSoilCellInReach(layout.decor, pose) : null;
    seatInReach = handsFree && !doorInReach && !ladderInReach && !bedInReach && !soilInReach ? findSeatInReach(seats, pose) : null;
    nearbyPet = handsFree && !doorInReach && !ladderInReach && !bedInReach && !soilInReach && !seatInReach ? findPetInReach(petBodies.views().filter((view) => view.instanceId !== carrying), pose) : null;
    const nearbyPetState = nearbyPet ? petSim.find(nearbyPet.instanceId) : null;
    const nearbyPetRow = nearbyPet ? layout.pets.find((pet) => pet.instanceId === nearbyPet.instanceId) : null;
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
    if (held && putDownFits && doorInReach && openDoors.has(doorInReach.doorId))
        doorInReach = null;
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
    if (bedInReach) {
        setPrompt(BED_PROMPT);
        return;
    }
    if (soilInReach) {
        const plotId = soilInReach.plot.instanceId;
        const planted = layout.agriculture.crops.find((crop) => crop.plotId === plotId && crop.cellId === soilInReach.cellId);
        const occupied = layout.agriculture.crops.filter((crop) => crop.plotId === plotId).length;
        if (!planted) {
            const selected = findCrop(inventoryPanel.selectedCropId());
            const seeds = layout.agriculture.inventory.seeds[selected.id] ?? 0;
            setPrompt(seeds > 0
                ? `Press E to plant 1 ${selected.title} here · ${seeds} seeds · plot ${occupied}/${SOIL_CELL_LAYOUT.length}`
                : `No ${selected.title} seeds · choose another in Inventory`);
            return;
        }
        const definition = findCrop(planted.cropId);
        const crop = cropStatus(planted, clockMinutes);
        if (crop.mature)
            setPrompt(`Press E to harvest ${definition.title}`);
        else if (crop.needsCare)
            setPrompt(`Press E to tend the ${definition.title}`);
        else if (crop.thirsty)
            setPrompt(`Press E to water the ${definition.title}`);
        else
            setPrompt(`${definition.title} growing · ${Math.round(crop.progress * 100)}% · soil is moist`);
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
    setPrompt("");
}
/** Apply a body step: the pose and the body move together or not at all. */
function applyBodyStep(step) {
    player.x = step.pose.x;
    player.z = step.pose.z;
    player.yaw = step.pose.yaw;
    player.pitch = step.pose.pitch;
    body = step.body;
}
/** E, while walking: whatever `updateInteraction` found nearest to hand. */
function interact() {
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
    if (soilInReach) {
        workSoilPlot();
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
        return interactWithPet("pet");
    }
    return false;
}
/** E at a growing plot performs the one action its current state calls for. */
function workSoilPlot() {
    if (!soilInReach || !canManageFarm)
        return;
    const plotId = soilInReach.plot.instanceId;
    const cellId = soilInReach.cellId;
    const planted = layout.agriculture.crops.find((crop) => crop.plotId === plotId && crop.cellId === cellId);
    let action;
    if (!planted)
        action = plantFarmCrop(layout.agriculture, plotId, cellId, inventoryPanel.selectedCropId(), clockMinutes);
    else {
        const state = cropStatus(planted, clockMinutes);
        if (state.mature)
            action = harvestFarmCrop(layout.agriculture, plotId, cellId, clockMinutes);
        else if (state.needsCare)
            action = tendFarmCrop(layout.agriculture, plotId, cellId, clockMinutes);
        else if (state.thirsty)
            action = waterFarmCrop(layout.agriculture, plotId, cellId, clockMinutes);
        else
            return;
    }
    if (!action.ok)
        return;
    void persistLayout(withFarmClock(withFarmAgriculture(layout, action.agriculture), clockMinutes, Date.now()));
}
/** Run one available pet action through the shared registry. */
function interactWithPet(action) {
    if (action === "call")
        return false;
    if (!nearbyPet)
        return false;
    if (action === "feed") {
        if (!nearbyPetCanFeed)
            return false;
        const result = feedPet(layout, nearbyPet.instanceId, clockMinutes);
        if (!result.ok)
            return false;
        const name = nearbyPet.name;
        petBodies.showHeart(nearbyPet.instanceId);
        petSim.attention(nearbyPet.instanceId);
        const note = treatmentNote(result.treatment ?? 0);
        void persistLayout(withFarmClock(result.layout, clockMinutes, Date.now())).then((saved) => {
            status.textContent = `${name} ate one serving of ${result.foodTitle}. ${note ? `${note} ` : ""}${saved}`;
        });
        return true;
    }
    if (action === "play" && !nearbyPetCanPlay)
        return false;
    const checkpoint = advancePetNeeds(layout, clockMinutes);
    const pet = checkpoint.pets.find((row) => row.instanceId === nearbyPet.instanceId);
    if (!pet?.profile)
        return false;
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
    }
    else {
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
    if (!nearbyPetCanPickUp || !petSim.pickUp(nearbyPet.instanceId))
        return false;
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
function callPets() {
    const checkpoint = advancePetNeeds(layout, clockMinutes);
    let answered = 0;
    let refused = 0;
    for (const pet of checkpoint.pets) {
        if (!pet.profile)
            continue;
        const reaction = reactToPetCall(pet.profile);
        if (reaction.ok && petSim.call(pet.instanceId, player))
            answered += 1;
        else
            refused += 1;
    }
    layout = checkpoint;
    if (answered > 0)
        status.textContent = answered === 1 ? "A trusted pet comes when called." : `${answered} trusted pets come when called.`;
    else if (refused > 0)
        status.textContent = "No pet feels ready to answer the call yet.";
    return answered + refused > 0;
}
/** E with a pet in hand: set it down ahead if it fits; otherwise the prompt has already said why not and E does nothing. */
function putPetDown() {
    const held = carrying ? petSim.find(carrying) : null;
    const spot = putDownAt;
    if (!held || !spot)
        return false;
    if (!petSim.putDown(held.instanceId, spot))
        return false;
    petBodies.setTagVisible(held.instanceId, true);
    carrying = "";
    carryPatienceSeconds = null;
    return true;
}
/** Independent or distressed pets visibly wriggle free after the warned handling window. */
function updateCarryPatience(dt) {
    if (!carrying || carryPatienceSeconds === null)
        return;
    carryPatienceSeconds -= dt;
    if (carryPatienceSeconds > 0 || !putDownAt)
        return;
    const held = petSim.find(carrying);
    if (!held || !putPetDown())
        return;
    status.textContent = `${held.name} wriggled free and jumped down.`;
}
/** Build mode takes the pet out of the arms: ahead, else at the player's feet, else where a turn finds room; last resort, it stays carried. */
function dropCarried() {
    const held = carrying ? petSim.find(carrying) : null;
    if (!held)
        return;
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
function toggleDoors() {
    const doors = doorInReach ? world.doorsFor(doorInReach.doorId) : null;
    if (!doors || !doorInReach)
        return;
    const open = !doors.isOpen();
    doors.setOpen(open);
    if (open)
        openDoors.add(doorInReach.doorId);
    else
        openDoors.delete(doorInReach.doorId);
    obstacles = farmObstacles(layout, { openDoors });
}
/**
 * The one seam every layout change goes through, from the editor or the pets
 * panel: the world redraws, the sim re-syncs, the obstacle list and the
 * platforms, ladders and seats are rebuilt (a building that moved takes its
 * open door and its loft with it), and the panels follow. A body up a ladder
 * or on a seat that is gone is set down where it stands and falls from there.
 */
function applyLayout(next) {
    layout = next;
    world.applyGround(layout.ground);
    world.sync(layout);
    cropsView.sync(layout, layout.agriculture, clockMinutes);
    for (const doorId of [...openDoors])
        if (!world.doorsFor(doorId))
            openDoors.delete(doorId);
    obstacles = farmObstacles(layout, { openDoors });
    platforms = farmPlatforms(layout);
    ladders = farmLadders(layout);
    seats = farmSeats(layout);
    ponds = waterRegions(layout);
    if (body.mode === "seated" && !seats.some((seat) => seat.id === body.fixtureId))
        applyBodyStep(standUp(player, body));
    if (body.mode === "climbing" && !ladders.some((ladder) => ladder.id === body.fixtureId))
        applyBodyStep(releaseLadder(player, body));
    petSim.sync(layout);
    petsPanel.render(layout);
    inventoryPanel.render(layout.agriculture);
}
function isFarmFullscreen() {
    return document.fullscreenElement === document.documentElement;
}
function setFarmFullscreen(on) {
    if (!document.fullscreenEnabled)
        return;
    if (on && !document.fullscreenElement)
        document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (!on && document.fullscreenElement)
        document.exitFullscreen?.().catch(() => undefined);
}
function syncFullscreenButton() {
    fullscreenButton.setAttribute("aria-pressed", String(isFarmFullscreen()));
    fullscreenButton.firstChild.textContent = isFarmFullscreen() ? "Exit fullscreen " : "Fullscreen ";
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
    if (event.code === "KeyI" && !event.repeat && canManageFarm && farmEntered && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        if (petsPanel.isOpen())
            petsPanel.close();
        inventoryPanel.toggle();
        keys.clear();
        return;
    }
    if (inventoryPanel.isOpen()) {
        if (event.code === "Escape")
            inventoryPanel.close();
        keys.clear();
        return;
    }
    // P opens and closes the pets panel; while it is open every other key is the panel's.
    if (event.code === "KeyP" && !event.repeat && canManageFarm && farmEntered && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        if (petsPanel.isOpen())
            petsPanel.close();
        else {
            inventoryPanel.close();
            petsPanel.open();
        }
        return;
    }
    if (petsPanel.isOpen()) {
        if (event.code === "Escape")
            petsPanel.close();
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
    if (event.code === "KeyE" && !event.repeat && farmEntered) {
        if (interact())
            event.preventDefault();
    }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("click", () => {
    if (farmEntered && !petsPanel.isOpen() && !inventoryPanel.isOpen() && !farmEditor.isEditing())
        canvas.requestPointerLock?.().catch(() => undefined);
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
    if (onboardingInitialization)
        await onboardingInitialization;
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
    if (canManageFarm && layout.onboarding.status !== "complete")
        return;
    farmEntered = true;
    farmMusic.start();
    startGate.classList.add("is-hidden");
    canvas.focus();
    status.textContent = "WASD to move · Drag to look · Click for mouse capture";
});
window.addEventListener("pagehide", () => {
    if (canPersistFarm)
        void layoutStore.save(progressedLayout(), { keepalive: true });
    farmMusic.destroy();
}, { once: true });
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
    if (petsPanel.isOpen() || inventoryPanel.isOpen() || farmEditor.isEditing())
        return;
    if (document.pointerLockElement !== canvas && !draggingLook)
        return;
    const looked = lookWalker(player, event.movementX, event.movementY);
    player.yaw = looked.yaw;
    player.pitch = looked.pitch;
});
function updatePlayer(dt) {
    if (!farmEntered || petsPanel.isOpen() || inventoryPanel.isOpen() || farmEditor.isEditing() || napDialog.open || napRemainingMinutes > 0)
        return;
    const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms, ladders, ground: groundAt, waterDepth: waterAt });
    if (!step.moved)
        return;
    player.x = step.pose.x;
    player.z = step.pose.z;
    body = step.body;
}
/** Below a pond's surface the world goes murky; back above it, the air's fog returns. */
function updateUnderwater(surfaced = false) {
    const under = !surfaced && !farmEditor.isEditing() && underwater(ponds, { x: camera.position.x, z: camera.position.z }, camera.position.y);
    world.setUnderwater(under);
    document.body.classList.toggle("is-underwater", under);
    underwaterOverlay?.classList.toggle("is-visible", under);
}
function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
}
/** What a save result means to the player, wherever the save was asked for. */
function describeSave(result) {
    if (result.ok && result.target === "account")
        return "Saved to your account. Friends can visit this farm.";
    if (result.ok && result.target === "device")
        return "Saved on this device · sign in to keep farm progression with your account.";
    if (!layoutStore.accountBacked)
        return "This device could not save the farm.";
    return "The database save failed. Your farm was not saved; try again in a moment.";
}
/** Pets-panel changes land here: apply, tell the editor, then save, and say where the save went. */
async function persistLayout(next) {
    if (!canManageFarm)
        return "This farm is read-only while visiting.";
    next = applyPetCareMilestones(next);
    applyLayout(next);
    farmEditor.replaceLayout(next);
    if (!canPersistFarm)
        return "Session only · reload when the farm database is available to save safely.";
    return describeSave(await layoutStore.save(layout));
}
function progressedLayout() {
    const needs = advancePetNeeds(layout, clockMinutes);
    return withFarmClock(withFarmAgriculture(needs, advanceAgriculture(needs.agriculture, clockMinutes)), clockMinutes, Date.now());
}
async function persistFarmProgress() {
    await persistLayout(progressedLayout());
}
// Species cards show the real animal: the room's offscreen portrait renderer pointed at the pack.
const speciesThumbnails = createAvatarThumbnails(THREE, {
    resolve: (speciesId) => {
        const species = findAnimal(speciesId);
        if (!species)
            return undefined;
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
    closeButton: requiredElement("#closePets"),
    petList: requiredElement("#petList"),
    speciesGrid: requiredElement("#speciesGrid"),
    nameInput: requiredElement("#petName"),
    status: requiredElement("#petsStatus"),
    count: requiredElement("#petsCount"),
}, {
    adopt: async (speciesId, name) => {
        if (!layoutStore.accountBacked)
            return "Sign in to adopt another pet with tickets.";
        const result = await ticketClient.adoptFarmPet(speciesId, name, farmPurchaseId("adopt"));
        if (!result?.ok) {
            if (result?.error === "insufficient_tickets")
                return "You do not have enough tickets for that adoption yet.";
            if (result?.error === "farm_full")
                return "The farm is full. Release one pet before adopting another.";
            if (result?.error === "needs_water")
                return "That animal needs a pond on the farm first.";
            return "That adoption did not go through. Try again.";
        }
        const next = normalizeFarmLayout(result.layout);
        applyLayout(next);
        farmEditor.replaceLayout(next);
        if (Number.isSafeInteger(result.balance))
            publishTicketBalance(result.balance);
        const pet = next.pets.at(-1);
        return `${pet?.name ?? "Your pet"} moved in with 5 servings of food. ${Number(result.balance).toLocaleString()} tickets remain.`;
    },
    rename: async (instanceId, name) => {
        const next = renamePet(layout, instanceId, name);
        if (next === layout)
            return "";
        return "Renamed. " + await persistLayout(next);
    },
    release: async (instanceId) => {
        const leaving = layout.pets.find((row) => row.instanceId === instanceId);
        const next = removePet(layout, instanceId);
        if (next === layout)
            return "";
        return (leaving?.name ?? "Your pet") + " went back to the wild. " + await persistLayout(next);
    },
}, { thumbnail: speciesThumbnails.get });
petsPanel.render(layout);
if (visiting)
    openPetsButton.hidden = true;
const cropThumbnails = createCropThumbnails(THREE);
const inventoryPanel = createFarmInventoryPanel({
    root: requiredElement("#inventoryPanel"),
    openButton: openInventoryButton,
    closeButton: requiredElement("#closeInventory"),
    seedGrid: requiredElement("#seedGrid"),
    produceGrid: requiredElement("#produceGrid"),
    suppliesGrid: requiredElement("#suppliesGrid"),
    selected: requiredElement("#selectedSeed"),
}, {
    thumbnail: cropThumbnails.get,
    purchaseSupply: layoutStore.accountBacked ? async (itemId, quantity) => {
        const result = await ticketClient.purchaseFarmSupply(itemId, quantity, farmPurchaseId("supply"));
        if (!result?.ok)
            return result?.error === "insufficient_tickets" ? "Not enough tickets." : result?.error === "inventory_full" ? "That supply stack is full." : "Purchase failed. Try again.";
        const next = normalizeFarmLayout(result.layout);
        applyLayout(next);
        farmEditor.replaceLayout(next);
        if (Number.isSafeInteger(result.balance))
            publishTicketBalance(result.balance);
        return `Purchased · ${Number(result.balance).toLocaleString()} tickets remain.`;
    } : null,
});
inventoryPanel.render(layout.agriculture);
if (visiting)
    openInventoryButton.hidden = true;
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
        if (Number.isSafeInteger(result?.balance))
            publishTicketBalance(result.balance);
        return result;
    } : null,
    purchaseSeeds: layoutStore.accountBacked ? async (cropId, quantity) => {
        const result = await ticketClient.purchaseFarmSupply(`seed.${cropId}`, quantity, farmPurchaseId("seed"));
        if (Number.isSafeInteger(result?.balance))
            publishTicketBalance(result.balance);
        return result;
    } : null,
    persist: async (next) => {
        if (!canPersistFarm)
            return { ok: false, message: "Session only · reload when the farm database is available to save safely." };
        const cared = applyPetCareMilestones(next);
        if (cared !== next) {
            applyLayout(cared);
            farmEditor.replaceLayout(cared);
        }
        const result = await layoutStore.save(cared);
        return { ok: result.ok, message: describeSave(result) };
    },
    thumbnail: (definition) => decorThumbnails.get(definition),
    cropThumbnail: cropThumbnails.get,
    elements: {
        panel: editorPanel,
        editButton,
        rotateLeftButton: requiredElement("#rotateFarmLeft"),
        rotateRightButton: requiredElement("#rotateFarmRight"),
        resetButton: requiredElement("#resetFarmLayout"),
        saveButton: requiredElement("#saveFarmLayout"),
        finishButton: requiredElement("#finishFarmEditing"),
        undoButton: requiredElement("#undoFarmEdit"),
        status: requiredElement("#farmEditorStatus"),
        viewButtons: requiredElement("#cameraViews"),
        tabs: requiredElement("#farmEditorTabs"),
        tabPanels: requiredElement("#farmEditorTabPanels"),
        drawer: editorDrawer,
        groundPicker: requiredElement("#groundPicker"),
        seedCatalog: requiredElement("#farmSeedCatalog"),
        catalogTitle: requiredElement("#farmCatalogTitle"),
        catalogHint: requiredElement("#farmCatalogHint"),
        catalog: requiredElement("#farmCatalog"),
        placed: requiredElement("#farmPlaced"),
        inspector: requiredElement("#farmInspector"),
    },
    // A visitor can never build, and the pets panel and the start gate own the screen while they are up.
    canEnter: () => canManageFarm && farmEntered && !petsPanel.isOpen() && !inventoryPanel.isOpen() && !napDialog.open && napRemainingMinutes <= 0,
    onEditingChange: (editing) => {
        keys.clear();
        draggingLook = false;
        if (editing)
            dropCarried();
        // Come up for air first, so the underwater fog does not keep the overview's fog when it lets go.
        if (editing)
            updateUnderwater(true);
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
    if (!canManageFarm)
        return;
    layout = withFarmClock(advancePetNeeds(layout, clockMinutes), clockMinutes, Date.now());
    petSim.sync(layout);
    petsPanel.render(layout);
    farmEditor.replaceLayout(layout);
};
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now) {
    const frameSeconds = Math.min((now - previous) / 1000, 0.1);
    accumulator += frameSeconds;
    previous = now;
    while (accumulator >= TICK_SECONDS) {
        updateFarmTime(TICK_SECONDS);
        updatePlayer(TICK_SECONDS);
        petSim.tick(TICK_SECONDS, { x: player.x, z: player.z, yaw: player.yaw, y: body.y });
        updateInteraction();
        updateCarryPatience(TICK_SECONDS);
        accumulator -= TICK_SECONDS;
    }
    world.update(frameSeconds);
    petBodies.sync(petSim.pets(), frameSeconds);
    if (!farmEditor.isEditing())
        applyCamera();
    updateUnderwater();
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
// Read-only handle for headless verification (position, facing, what E would do). Nothing in the page uses it.
globalThis.__farm = Object.freeze({
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
    time: () => clockMinutes,
    napping: () => napRemainingMinutes > 0,
    obstacles: () => obstacles,
    ponds: () => ponds,
    underwater: () => document.body.classList.contains("is-underwater"),
});
applyCamera();
syncFullscreenButton();
requestAnimationFrame(frame);
