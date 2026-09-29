// The Cove page: the shared fishing hub at the bottom of the Market Square's
// north path (planning-docs/FARM_FISHING_PLAN.md).
//
// It is the farm's stack by import, like the Market Square: the shore's walls,
// gate, benches, campfire and lamps are farm decor rows (farm-cove.mts) drawn
// by the farm's world and made solid and sittable by the farm's scene rules;
// the stalls are the market's stall models; everyone here shares one presence
// room with its chat. What is the Cove's own is the water: its terrain and
// docks (farm-cove-terrain.mts), the shadows every visitor sees in the same
// place (farm-fish-shadows-view.mts, fed by `GET /games/farm/fishing/shadows`),
// and fishing — the controller (farm-fishing-controller.mts) over the pure
// minigame, its 3D view and its HUD.
//
// Every fish is the server's. A cast is sent when the line is released, the
// server decides what bites, and only a landing tells the page what it was;
// the creel, the Fishmonger and Bait & Tackle all show what the server last
// answered. Signed out, the Cove is practice: the minigame is the same, the
// bite is rolled here, and nothing is kept.
import * as THREE_VENDOR from "./vendor/three.module.js";
import { createLayoutStore, createRoomLayoutStore } from "./arcade-room-store.mjs";
import { forwardOf, lookWalker } from "./arcade-room-walker.mjs";
import { spawnOffsetForCompany } from "./arcade-room-interaction.mjs";
import { createRoomPresence } from "./arcade-room-presence.mjs";
import { createRoomVisitors } from "./arcade-room-visitors.mjs";
import { createRoomChat } from "./arcade-room-chat.mjs";
import { createRoomChatView } from "./arcade-room-chat-view.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { EYE_HEIGHT, doorRows, farmObstacles, farmSeats, nearestDoor } from "./farm-scene.mjs";
import { createFarmBody, eyeHeight, isMoveKey, sitOn, standUp, stepFarmBody } from "./farm-body.mjs";
import { SEATED_PROMPT, SEAT_PROMPT, canWorkDoor, findSeatInReach, getDoorPrompt } from "./farm-interaction.mjs";
import { gatewayAt } from "./farm-gateway.mjs";
import { findStallInReach, keeperPose, stallObstacles } from "./farm-market-square.mjs";
import { createMarketStallModel } from "./farm-market-props.mjs";
import { COVE_BOUNDS, COVE_MARKET_GATE, COVE_PRESENCE_ROOM, COVE_SPAWN, COVE_STALLS, FISHMONGER_STALL_ID, RECORDS_BOARD_ID, TACKLE_STALL_ID, castOrigin, coveLayout, coveObstacles, covePlatforms, coveStallPrompt, coveWaterDistance, findCoveStall, } from "./farm-cove.mjs";
import { createCoveTerrain } from "./farm-cove-terrain.mjs";
import { fishmongerStock, tackleStock } from "./farm-cove-props.mjs";
import { findFishSpecies, findFishingRod, MOUNT_FEE, STARTER_ROD_ID, WORM_ID, ZONE_MIN_LEVEL, ZONE_TITLES } from "./farm-catalog/fish.mjs";
import { normalizePublicShadow, specimenTitle, formatWeight } from "./farm-fish.mjs";
import { createShadowsView } from "./farm-fish-shadows-view.mjs";
import { createFishingController } from "./farm-fishing-controller.mjs";
import { createFishingView } from "./farm-fishing-view.mjs";
import { createFishingHud } from "./farm-fishing-hud.mjs";
import { createFishThumbnails } from "./farm-fish-models.mjs";
import { PRACTICE_ANGLER, baitCount, baitTitle, bestRod, catchNews, nextBait, nextRod, normalizeAngler } from "./farm-angler.mjs";
import { createCreelPanel, createFishmongerPanel, createRecordsPanel, createTacklePanel, normalizeRecords } from "./farm-cove-panels.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "./platform/api/factory-account-gate.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { FARM_LAYOUT_SPEC } from "./farm-layout.mjs";
import { createFarmInventorySummary } from "./farm-inventory-summary.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`The Cove is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#coveCanvas");
const prompt = requiredElement("#covePrompt");
const startGate = requiredElement("#startGate");
const enterButton = requiredElement("#enterCove");
const status = requiredElement("#coveStatus");
const backLink = requiredElement("#coveBackLink");
const ticketChip = requiredElement("#coveTickets");
const musicButton = requiredElement("#toggleCoveMusic");
const visitorsChip = requiredElement("#coveVisitors");
const visitorsChipLabel = requiredElement("#coveVisitorsLabel");
const visitorsChipNames = requiredElement("#coveVisitorsNames");
const tackleBar = requiredElement("#tackleBar");
// Back up the path: to the Market Square's north gate, carrying the farm to come home to.
const fromFarm = new URLSearchParams(location.search).get("farm") ?? "";
const marketUrl = `../market/index.html?from=cove${fromFarm ? `&farm=${encodeURIComponent(fromFarm)}` : ""}`;
backLink.href = marketUrl;
const inventoryFarm = await createLayoutStore(FARM_LAYOUT_SPEC).load();
const inventorySummary = createFarmInventorySummary({
    root: requiredElement("#inventoryPanel"),
    openButton: requiredElement("#openInventory"),
    closeButton: requiredElement("#closeInventory"),
    body: requiredElement("#inventorySummary"),
});
inventorySummary.render(inventoryFarm.layout);
// ---------------------------------------------------------------- the angler
const api = createPlatformApiClient();
const signedIn = readFactoryAccountSession().authenticated && api.isConfigured !== false;
let angler = PRACTICE_ANGLER;
let accountLoaded = false;
async function loadAngler() {
    if (!signedIn)
        return;
    const next = normalizeAngler(await api.fetchFarmFishing().catch(() => null));
    if (next) {
        angler = next;
        accountLoaded = true;
        if (!angler.tackle.rods.includes(rodId))
            rodId = bestRod(angler).id;
        if (baitCount(angler, baitId) <= 0)
            baitId = nextBait(angler, baitId);
    }
    repaintPanels();
}
/** Keep what an answer says about the tackle box without waiting for a full re-read. */
function takeTackle(value) {
    const next = normalizeAngler({ tackle: value, fishing: { xp: angler.xp, catches: angler.catches }, creel: angler.creel, capacity: angler.capacity, dex: angler.dex, caughtShadows: [...angler.caughtShadows], mounted: angler.mounted });
    if (next)
        angler = next;
}
let rodId = STARTER_ROD_ID;
let baitId = WORM_ID;
const ticketClient = createTicketWalletClient();
let balance = null;
function renderTickets() {
    ticketChip.hidden = balance === null;
    ticketChip.querySelector("strong").textContent = formatTicketBalance(balance);
}
function takeBalance(value) {
    if (!Number.isSafeInteger(value))
        return;
    balance = value;
    publishTicketBalance(balance);
    renderTickets();
}
if (signedIn)
    void ticketClient.getWallet().then((wallet) => takeBalance(wallet?.balance)).catch(() => undefined);
renderTickets();
const music = createFarmMusic();
function renderMusicButton() {
    const muted = music.isMuted();
    musicButton.setAttribute("aria-pressed", String(muted));
    musicButton.firstChild.textContent = muted ? "Music off " : "Music on ";
}
musicButton.addEventListener("click", () => { music.setMuted(!music.isMuted()); renderMusicButton(); });
renderMusicButton();
// ---------------------------------------------------------------- the world
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
    status.textContent = "The Cove needs WebGL to render.";
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
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 260);
camera.rotation.order = "YXZ";
scene.add(camera);
const layout = coveLayout();
const world = createFarmWorld(THREE, scene, { groundCover: false, field: false, keepClear: (x, z) => coveWaterDistance({ x, z }) > -4 });
world.sync(layout);
// The Cove keeps the late afternoon, when the fish bite (`?time=<minute>` checks another light).
const previewMinute = Number(new URLSearchParams(location.search).get("time"));
world.setTime(Number.isFinite(previewMinute) && previewMinute > 0 ? previewMinute : 16 * 60 + 30);
const terrain = createCoveTerrain(THREE, scene);
const STOCK = { [FISHMONGER_STALL_ID]: fishmongerStock(THREE), [TACKLE_STALL_ID]: tackleStock(THREE) };
for (const stall of COVE_STALLS)
    scene.add(createMarketStallModel(THREE, stall, STOCK[stall.id]));
const keepers = createRoomVisitors(THREE, scene);
const keeperMembers = COVE_STALLS.filter((stall) => stall.keeper).map((stall) => {
    const pose = keeperPose(stall);
    return Object.freeze({
        clientId: `keeper-${stall.id}`,
        playerId: "",
        displayName: stall.keeper.name,
        avatarId: stall.keeper.avatarId,
        pose: Object.freeze({ x: pose.x, z: pose.z, yaw: pose.yaw, moving: false, activity: stall.title }),
        poseAt: 0,
        emote: "",
        emoteAt: 0,
    });
});
keepers.sync(keeperMembers);
const keeperSaidAt = new Map();
function keeperSays(stall, text, now = performance.now()) {
    keeperSaidAt.set(stall.id, now);
    keepers.say(`keeper-${stall.id}`, text, now);
}
const shadowsView = createShadowsView(THREE, scene);
let shadows = [];
async function loadShadows() {
    const answer = await api.fetchFarmFishShadows().catch(() => null);
    const list = Array.isArray(answer?.shadows) ? answer.shadows.map(normalizePublicShadow).filter(Boolean) : null;
    if (list) {
        shadows = list;
        shadowsView.sync(shadows);
    }
}
// A new window every five minutes: read the next one well before it starts.
setInterval(() => { void loadShadows(); }, 60_000);
// ---------------------------------------------------------------- walking
const player = { x: COVE_SPAWN.x, z: COVE_SPAWN.z, yaw: COVE_SPAWN.yaw, pitch: -0.06 };
// `?at=pier|jetty|spit` stands the player at a fishing spot, facing the water — a QA seam like the market's `?at=`.
const QA_SPOTS = Object.freeze({
    pier: { x: 11, z: -10.2, yaw: 0 },
    jetty: { x: -10, z: -1.4, yaw: 0 },
    spit: { x: -1.2, z: -8, yaw: Math.PI / 2 },
    // At the counters, which face north: stand in front and look south at them.
    fishmonger: { x: 7.6, z: 13.4, yaw: Math.PI },
    tackle: { x: -7.6, z: 13.4, yaw: Math.PI },
    records: { x: -17.2, z: 13, yaw: Math.PI / 2 },
});
const qaSpot = QA_SPOTS[new URLSearchParams(location.search).get("at") ?? ""];
if (qaSpot)
    Object.assign(player, qaSpot);
let body = createFarmBody();
const walkerBounds = { halfWidth: COVE_BOUNDS.width / 2, halfDepth: COVE_BOUNDS.depth / 2, margin: COVE_BOUNDS.wallInset };
const openDoors = new Set();
const water = coveObstacles();
const docks = covePlatforms();
const solidStalls = stallObstacles(COVE_STALLS);
let obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls, ...water];
const seats = farmSeats(layout);
const doors = doorRows(layout);
const keys = new Set();
let entered = false;
let leaving = false;
let draggingLook = false;
let doorInReach = null;
let seatInReach = null;
let stallInReach = null;
let nearbyVisitor = null;
let atWater = false;
let noticeUntil = 0;
function applyCamera() {
    camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
}
function setPrompt(text) {
    prompt.textContent = text;
    prompt.classList.toggle("is-visible", Boolean(text));
}
function notice(text, seconds = 5) {
    noticeUntil = performance.now() + seconds * 1000;
    setPrompt(text);
}
// ---------------------------------------------------------------- the others at the Cove
const visitors = createRoomVisitors(THREE, scene);
const factoryProfile = loadFactoryProfile();
const presenceName = factoryProfile.profileName || "Player";
const presence = createRoomPresence({
    roomId: COVE_PRESENCE_ROOM,
    identity: { playerId: factoryProfile.playerId, displayName: presenceName, avatarId: "" },
});
void createRoomLayoutStore().loadSelfAvatarId().then((avatarId) => {
    presence.setIdentity({ playerId: factoryProfile.playerId, displayName: presenceName, avatarId });
}).catch(() => undefined);
function renderVisitorsChip() {
    const members = presence.members();
    const state = presence.status();
    visitorsChip.hidden = !(state === "full" || members.length > 0);
    if (state === "full") {
        visitorsChipLabel.textContent = "COVE FULL";
        visitorsChipNames.textContent = "Too many people are at the Cove right now.";
        return;
    }
    visitorsChipLabel.textContent = `AT THE COVE · ${members.length}`;
    visitorsChipNames.textContent = members.map((member) => member.displayName).join(", ");
}
const chat = createRoomChat({ send: (text) => presence.sendChat(text), selfName: presenceName });
const chatView = createRoomChatView({
    chat,
    root: requiredElement("#coveChat"),
    log: requiredElement("#coveChatLog"),
    input: requiredElement("#coveChatInput"),
    returnFocusTo: canvas,
});
presence.onChat((line) => {
    chat.receive(line);
    visitors.say(line.clientId, line.text, performance.now());
});
presence.onChatRefused((code) => chat.refused(code));
presence.onChange(() => {
    visitors.sync(presence.members());
    renderVisitorsChip();
    chat.noteRoster(presence.members(), presence.status() === "online");
});
window.addEventListener("pagehide", () => presence.disconnect());
window.addEventListener("pageshow", () => presence.connect());
const ACTIVITY = Object.freeze({
    charging: "casting", flight: "casting", waiting: "fishing", fighting: "reeling one in!", netting: "netting a fish!", settling: "landing a fish", reveal: "admiring a catch",
});
// ---------------------------------------------------------------- fishing
const newId = (prefix) => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
const achievements = createAchievementToaster();
const fishing = createFishingController({
    api: signedIn ? {
        cast: async (request) => {
            const result = await api.castFarmLine(request);
            return result?.ok ? result : { ok: false, error: String(result?.error ?? "unavailable"), ...result };
        },
        land: async (castId, outcome, grade) => {
            const result = await api.landFarmCast({ castId, outcome, grade });
            return result?.ok ? result : { ok: false, error: String(result?.error ?? "unavailable"), ...result };
        },
    } : null,
    random: Math.random,
    now: () => Date.now(),
    tackle: () => ({ rod: findFishingRod(rodId) ?? findFishingRod(STARTER_ROD_ID), bait: baitId, level: angler.level }),
    shadows: () => shadows,
    caught: () => angler.caughtShadows,
    onEvent: onFishingEvent,
    newId,
});
const fishingView = createFishingView(THREE, scene, camera);
fishingView.setRod(rodId);
const hud = createFishingHud(requiredElement("#fishingHud"), requiredElement("#catchCard"));
const REFUSALS = Object.freeze({
    zone_locked: "",
    no_bait: "You're out of that bait. Press Q to switch, or buy more at Bait & Tackle.",
    creel_full: "Your creel is full. Sell some at the Fishmonger or let some go (C).",
    too_many_casts: "Take a breather — that's a lot of casting for one hour.",
    rod_not_owned: "That rod isn't yours yet.",
    not_water: "That cast didn't land in the water.",
});
function onFishingEvent(event) {
    switch (event.kind) {
        case "notice":
            notice(event.text, 4);
            return;
        case "refused": {
            const detail = event.detail;
            const text = event.error === "zone_locked"
                ? `${ZONE_TITLES[detail.zone] ?? "That water"} opens at Fishing level ${detail.minLevel}. Try the Lagoon, west of the spit.`
                : REFUSALS[event.error] ?? "The cast didn't go through. Try again in a moment.";
            notice(text, 5);
            if (detail?.tackle)
                takeTackle(detail.tackle);
            return;
        }
        case "cast":
            if (event.answer?.tackle)
                takeTackle(event.answer.tackle);
            return;
        case "hooked":
            notice("Fish on! Hold Space to reel, steer against it with A / D.", 3);
            return;
        case "lost": {
            const words = event.how === "early" ? "Too soon — you spooked it." : event.how === "late" ? "Too slow — it took the bait and left." : event.how === "snapped" ? "SNAP! The line broke." : "It threw the hook and got away.";
            const answer = event.answer;
            if (answer?.ok && answer.tackle)
                takeTackle(answer.tackle);
            notice(`${words}${answer?.ok && answer.xp ? ` +${answer.xp} Fishing XP for the fight.` : ""}`, 4);
            return;
        }
        case "landing-refused":
            notice(event.error === "too_soon" ? "The Cove didn't believe that one — it was landed faster than a fish can tire." : event.error === "creel_full" ? "Your creel was full — the fish slipped back into the water." : "The fish slipped off at the last moment. Try again.", 5);
            return;
        case "landed": {
            const fish = event.fish;
            const news = catchNews(angler, fish.speciesId, fish.weightG);
            const answer = event.answer;
            const levelUp = answer?.fishing && Number(answer.fishing.level) > Number(answer.fishing.levelBefore) ? Number(answer.fishing.level) : null;
            hud.showCatch(fish, { xp: event.xp, practice: event.practice, firstOfKind: news.firstOfKind, personalBest: news.personalBest, levelUp });
            if (answer?.tackle)
                takeTackle(answer.tackle);
            if (Array.isArray(answer?.achievements) && answer.achievements.length)
                achievements.show("farm", "The Farm", answer.achievements);
            // Worth shouting about: rare fish, big fish, coloured fish.
            const rarity = findFishSpecies(fish.speciesId)?.rarity ?? "common";
            const brag = !event.practice && (rarity === "rare" || rarity === "epic" || rarity === "legendary" || fish.sizeClass === "trophy" || fish.sizeClass === "record" || fish.variant !== "normal");
            if (brag)
                presence.sendChat(`🎣 landed a ${formatWeight(fish.weightG)} ${specimenTitle(fish.speciesId, fish.variant, fish.sizeClass)}!`);
            if (!event.practice)
                void loadAngler();
            return;
        }
    }
}
// ---------------------------------------------------------------- the panels
const thumbs = createFishThumbnails(THREE, () => repaintPanels());
const outcomeOf = (result, success, messages = {}) => result?.ok ? { ok: true, message: success } : { ok: false, message: messages[result?.error] ?? "That didn't go through. Nothing changed — try again in a moment." };
const creelPanel = createCreelPanel(requiredElement("#creelPanel"), {
    angler: () => angler,
    thumbs,
    signedIn: () => signedIn,
    lock: async (fish, locked) => {
        const result = await api.lockFarmFish({ fishId: fish.id, locked });
        await loadAngler();
        return outcomeOf(result, locked ? "Locked." : "Unlocked.");
    },
    release: async (fish) => {
        const result = await api.releaseFarmFish({ fishIds: [fish.id] });
        await loadAngler();
        return outcomeOf(result, `The ${findFishSpecies(fish.speciesId)?.title ?? "fish"} swam off.`);
    },
    mountFee: MOUNT_FEE,
    mount: async (fish, mounted) => {
        const result = await api.mountFarmFish({ fishId: fish.id, mounted, purchaseId: mounted ? newId("mount") : undefined });
        await loadAngler();
        if (result?.ok)
            takeBalance(result.balance);
        const title = findFishSpecies(fish.speciesId)?.title ?? "fish";
        return outcomeOf(result, mounted ? `Old Pike mounted your ${title}. Stand it on your farm from build mode (Furniture).` : `Your ${title} is back in the creel.`, {
            insufficient_tickets: `Mounting costs ${MOUNT_FEE} tickets.`,
            too_many_mounted: "That's as many mounted fish as a farm can keep. Take one down first.",
            creel_full: "Your creel is full — make room before taking a fish down.",
            already_mounted: "That fish is already mounted.",
        });
    },
    onClose: () => canvas.focus(),
});
const fishmongerPanel = createFishmongerPanel(requiredElement("#fishmongerPanel"), {
    angler: () => angler,
    thumbs,
    sell: async (fish) => {
        const result = await api.sellFarmFish({ saleId: newId("fish-sale"), fishIds: fish.map((entry) => entry.id) });
        await loadAngler();
        if (result?.ok) {
            takeBalance(result.balance);
            keeperSays(findCoveStall(FISHMONGER_STALL_ID), fish.length > 3 ? "What a haul! Pleasure doing business." : "Lovely fish. Come back soon!");
        }
        return outcomeOf(result, `Sold for ${Number(result?.earned ?? 0).toLocaleString()} tickets. Your balance is ${formatTicketBalance(balance)}.`, {
            fish_locked: "One of those is locked. Unlock it in your creel first.",
            not_in_creel: "Your creel changed while Coral was counting. Nothing was sold.",
        });
    },
    onClose: () => canvas.focus(),
});
const tacklePanel = createTacklePanel(requiredElement("#tacklePanel"), {
    angler: () => angler,
    thumbs,
    buy: async (itemId, quantity) => {
        const result = await api.buyFarmTackle({ purchaseId: newId("tackle"), itemId, quantity });
        if (result?.tackle)
            takeTackle(result.tackle);
        if (result?.ok) {
            takeBalance(result.balance);
            keeperSays(findCoveStall(TACKLE_STALL_ID), itemId.startsWith("rod.") ? "A fine rod. Treat it well." : "Tight lines!");
            if (itemId.startsWith("rod.")) {
                rodId = itemId;
                fishingView.setRod(rodId);
            }
        }
        return outcomeOf(result, itemId.startsWith("rod.") ? `The ${findFishingRod(itemId)?.title ?? "rod"} is yours — it's in your hands now.` : "In your tackle box.", {
            insufficient_tickets: "Not enough tickets for that.",
            level_too_low: "That needs a higher Fishing level.",
            tackle_full: "Your tackle box can't hold any more of that.",
            already_owned: "You already own that rod.",
        });
    },
    onClose: () => canvas.focus(),
});
const recordsPanel = createRecordsPanel(requiredElement("#recordsPanel"), {
    load: async () => normalizeRecords(await api.fetchFarmFishRecords().catch(() => null)),
    thumbs,
    onClose: () => canvas.focus(),
});
function repaintPanels() {
    creelPanel.repaint();
    fishmongerPanel.repaint();
    tacklePanel.repaint();
    recordsPanel.repaint();
    renderTackleBar();
}
function panelOpen() {
    return inventorySummary.isOpen() || creelPanel.isOpen() || fishmongerPanel.isOpen() || tacklePanel.isOpen() || recordsPanel.isOpen();
}
function closePanels() {
    inventorySummary.close();
    creelPanel.close();
    fishmongerPanel.close();
    tacklePanel.close();
    recordsPanel.close();
}
function renderTackleBar() {
    const rod = findFishingRod(rodId);
    const bait = baitCount(angler, baitId);
    tackleBar.innerHTML = `
    <span><b>${rod?.title ?? "Rod"}</b><kbd>R</kbd></span>
    <span><b>${baitTitle(baitId)}</b> × ${bait}<kbd>Q</kbd></span>
    <span>Fishing ${angler.level}${signedIn ? "" : " · practice"}</span>
    <span>Creel ${angler.creel.length}/${angler.capacity}<kbd>C</kbd></span>
  `;
}
renderTackleBar();
function workStall(stall) {
    if (stall.id === RECORDS_BOARD_ID) {
        keys.clear();
        recordsPanel.open();
        return;
    }
    if (!signedIn) {
        notice(stall.id === TACKLE_STALL_ID ? "Sign in to buy tackle — practice fishing uses a borrowed stick and worms." : "Sign in to keep and sell your catch.");
        return;
    }
    keys.clear();
    if (stall.id === TACKLE_STALL_ID)
        tacklePanel.open();
    else
        fishmongerPanel.open();
    if (stall.keeper)
        keeperSays(stall, stall.keeper.greeting);
}
// ---------------------------------------------------------------- walking, E and the keys
function updateInteraction() {
    const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardOf(player.yaw) };
    const free = entered && !leaving && !panelOpen() && body.mode === "walking" && !fishing.busy();
    doorInReach = free ? nearestDoor(doors, pose, (entry) => canWorkDoor(pose, entry.door, entry.reach)) : null;
    stallInReach = free && !doorInReach ? findStallInReach(pose, COVE_STALLS) : null;
    seatInReach = free && !doorInReach && !stallInReach ? findSeatInReach(seats, pose) : null;
    nearbyVisitor = free && !doorInReach && !stallInReach && !seatInReach ? visitors.nearest(pose) : null;
    atWater = entered && !panelOpen() && body.mode !== "climbing" && Boolean(castOrigin(pose));
    if (stallInReach?.keeper && performance.now() - (keeperSaidAt.get(stallInReach.id) ?? -Infinity) > 20_000) {
        keeperSays(stallInReach, stallInReach.keeper.greeting);
    }
    if (!entered || panelOpen() || leaving) {
        if (!leaving)
            setPrompt("");
        return;
    }
    if (performance.now() < noticeUntil)
        return;
    if (fishing.busy())
        return setPrompt("");
    if (body.mode === "seated")
        return setPrompt(atWater ? `${SEATED_PROMPT} · or hold Space to cast from here` : SEATED_PROMPT);
    if (doorInReach) {
        const back = doorInReach.doorId === COVE_MARKET_GATE;
        return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (back ? " · the path back up to the Market Square" : ""));
    }
    if (stallInReach)
        return setPrompt(coveStallPrompt(stallInReach, signedIn));
    if (seatInReach)
        return setPrompt(SEAT_PROMPT);
    if (nearbyVisitor)
        return setPrompt(`Press E to wave at ${nearbyVisitor.displayName}`);
    if (atWater) {
        if (baitCount(angler, baitId) <= 0)
            return setPrompt("Out of bait — press Q to switch, or visit Bait & Tackle");
        return setPrompt(`Hold Space to cast · ${baitTitle(baitId)} on the hook${signedIn ? "" : " · practice (sign in to keep your catch)"}`);
    }
    setPrompt("");
}
function interact() {
    if (body.mode === "seated") {
        const step = standUp(player, body);
        Object.assign(player, step.pose);
        body = step.body;
        return;
    }
    if (doorInReach) {
        const leaves = world.doorsFor(doorInReach.doorId);
        if (!leaves)
            return;
        const open = !leaves.isOpen();
        leaves.setOpen(open);
        if (open)
            openDoors.add(doorInReach.doorId);
        else
            openDoors.delete(doorInReach.doorId);
        obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls, ...water];
        return;
    }
    if (stallInReach)
        return workStall(stallInReach);
    if (seatInReach) {
        const step = sitOn(player, body, seatInReach.seat, seatInReach.point);
        Object.assign(player, step.pose);
        body = step.body;
        keys.clear();
        return;
    }
    if (nearbyVisitor) {
        presence.emote("wave");
        notice(`👋 You waved at ${nearbyVisitor.displayName}`, 1.4);
    }
}
function updatePlayer(dt) {
    if (!entered || leaving || panelOpen() || fishing.busy())
        return;
    const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms: docks, ladders: [] });
    if (!step.moved)
        return;
    player.x = step.pose.x;
    player.z = step.pose.z;
    body = step.body;
}
function checkGateway() {
    if (!entered || leaving || body.mode !== "walking")
        return;
    if (!gatewayAt(layout.decor, openDoors, player, COVE_BOUNDS))
        return;
    leaving = true;
    keys.clear();
    document.exitPointerLock?.();
    setPrompt("Back up the path to the Market Square…");
    status.textContent = "Back up the path to the Market Square…";
    presence.disconnect();
    location.href = marketUrl;
}
function fishingPose() {
    return { x: player.x, z: player.z, forward: forwardOf(player.yaw) };
}
function steerFromKeys() {
    const left = keys.has("KeyA") || keys.has("ArrowLeft");
    const right = keys.has("KeyD") || keys.has("ArrowRight");
    fishing.steer(left === right ? 0 : left ? -1 : 1);
}
window.addEventListener("keydown", (event) => {
    if (panelOpen()) {
        if (event.code === "Escape" || (event.code === "KeyI" && inventorySummary.isOpen()))
            closePanels();
        keys.clear();
        return;
    }
    if (entered && !fishing.busy() && chatView.handleKey(event)) {
        keys.clear();
        return;
    }
    if (!entered)
        return;
    if (event.code === "KeyI" && !event.repeat && !fishing.busy()) {
        event.preventDefault();
        keys.clear();
        inventorySummary.toggle();
        return;
    }
    if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat)
            return;
        const phase = fishing.state().phase;
        if (phase === "idle" && !atWater)
            return;
        if (phase === "idle" && baitCount(angler, baitId) <= 0) {
            notice("Out of bait — press Q to switch, or visit Bait & Tackle.");
            return;
        }
        if (phase === "reveal")
            hud.hideCatch();
        if (body.mode === "seated" && phase === "idle" && !atWater)
            return;
        fishing.primary(true, fishingPose());
        return;
    }
    if (fishing.busy()) {
        keys.add(event.code);
        if (event.code === "Escape")
            fishing.cancel();
        if (event.code === "KeyW" || event.code === "ArrowUp")
            fishing.bow();
        steerFromKeys();
        return;
    }
    if (body.mode === "seated" && isMoveKey(event.code)) {
        const step = standUp(player, body);
        Object.assign(player, step.pose);
        body = step.body;
        return;
    }
    keys.add(event.code);
    if (event.repeat)
        return;
    if (event.code === "KeyM") {
        music.setMuted(!music.isMuted());
        renderMusicButton();
    }
    else if (event.code === "KeyE") {
        event.preventDefault();
        interact();
    }
    else if (event.code === "KeyQ") {
        baitId = nextBait(angler, baitId);
        renderTackleBar();
        notice(`${baitTitle(baitId)} on the hook.`, 1.5);
    }
    else if (event.code === "KeyR") {
        rodId = nextRod(angler, rodId).id;
        fishingView.setRod(rodId);
        renderTackleBar();
        notice(`${findFishingRod(rodId)?.title ?? "Rod"} in hand.`, 1.5);
    }
    else if (event.code === "KeyC") {
        keys.clear();
        document.exitPointerLock?.();
        creelPanel.showTab("creel");
    }
    else if (event.code === "KeyF") {
        keys.clear();
        document.exitPointerLock?.();
        creelPanel.showTab("dex");
    }
});
window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
    if (event.code === "Space" && entered)
        fishing.primary(false, fishingPose());
    if (fishing.busy())
        steerFromKeys();
});
window.addEventListener("blur", () => {
    keys.clear();
    fishing.steer(0);
    if (fishing.state().phase === "fighting")
        fishing.primary(false, fishingPose());
});
canvas.addEventListener("click", () => {
    if (entered && !panelOpen())
        canvas.requestPointerLock?.()?.catch?.(() => undefined);
});
enterButton.addEventListener("click", () => {
    if (!entered)
        player.x += spawnOffsetForCompany({ x: player.x, z: player.z }, presence.members());
    entered = true;
    music.start();
    startGate.classList.add("is-hidden");
    canvas.focus();
    status.textContent = "WASD to move · Drag to look · Click for mouse capture";
});
document.addEventListener("pointerlockchange", () => {
    startGate.classList.toggle("is-hidden", entered);
});
canvas.addEventListener("pointerdown", () => { draggingLook = true; });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
    if (panelOpen())
        return;
    if (document.pointerLockElement !== canvas && !draggingLook)
        return;
    // While a fish is on, the view stays on the line.
    const phase = fishing.state().phase;
    if (phase === "fighting" || phase === "netting" || phase === "reveal")
        return;
    const looked = lookWalker(player, event.movementX, event.movementY);
    player.yaw = looked.yaw;
    player.pitch = looked.pitch;
});
window.addEventListener("pagehide", () => music.destroy(), { once: true });
function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
        renderer.setSize(width, height, false);
    }
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
}
function publishPresence() {
    const phase = fishing.state().phase;
    presence.publishPose({
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        moving: keys.size > 0 && body.mode === "walking" && !fishing.busy(),
        activity: ACTIVITY[phase] ?? (fishmongerPanel.isOpen() ? "at the Fishmonger" : tacklePanel.isOpen() ? "at Bait & Tackle" : recordsPanel.isOpen() ? "reading the Cove Records" : ""),
    });
}
publishPresence();
presence.connect();
void loadShadows();
void loadAngler();
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
let seconds = 0;
function frame(now) {
    const frameSeconds = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
    accumulator += frameSeconds;
    previous = now;
    seconds += frameSeconds;
    while (accumulator >= TICK_SECONDS) {
        updatePlayer(TICK_SECONDS);
        checkGateway();
        updateInteraction();
        fishing.tick(TICK_SECONDS);
        publishPresence();
        accumulator -= TICK_SECONDS;
    }
    const snapshot = fishing.state();
    // The fish on the line (or already caught) is not a shadow any more.
    const hidden = new Set(angler.caughtShadows);
    if (snapshot.shadowId && snapshot.phase !== "waiting" && snapshot.phase !== "flight")
        hidden.add(snapshot.shadowId);
    shadowsView.hide(hidden);
    shadowsView.lure(snapshot.interestedShadowId ?? (snapshot.phase === "waiting" ? snapshot.shadowId : null), snapshot.landing ?? undefined);
    shadowsView.update(Date.now(), frameSeconds);
    fishingView.setRodVisible(atWater && !panelOpen());
    fishingView.update(snapshot, frameSeconds, seconds);
    hud.render(snapshot);
    world.update(frameSeconds);
    terrain.update(frameSeconds, seconds);
    keepers.update(frameSeconds, now, keeperMembers);
    visitors.update(frameSeconds, now, presence.members());
    chatView.tick();
    applyCamera();
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
// Read-only handle for headless verification. Nothing in the page uses it.
globalThis.__cove = Object.freeze({
    pose: () => ({ ...player, y: body.y }),
    fishing: () => fishing.state(),
    angler: () => angler,
    accountLoaded: () => accountLoaded,
    atWater: () => atWater,
    shadows: () => shadows,
    stallInReach: () => stallInReach?.id ?? "",
    doorInReach: () => doorInReach?.doorId ?? "",
    zoneMinLevel: ZONE_MIN_LEVEL,
});
applyCamera();
requestAnimationFrame(frame);
