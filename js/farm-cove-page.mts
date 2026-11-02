import * as cove from "./farm-cove.mjs";
import { travelRegion, publicRegionUrl, islandPlaceInReach, ISLAND_PROPERTY, ISLAND_PLACES } from "./farm-island.mjs";
import { createIslandResidents } from "./farm-island-residents.mjs";
import { harborScene, HARBOR_COVE_EXIT, stepHarborWalker } from "./farm-harbor-scene.mjs";
import { HARBOR_DOCKS, harborDockFoot, harborFishingZoneAt, harborWalkHeight } from "./farm-harbor-geometry.mjs";
import { BOAT_HANDLING, dockedBoat, nearbyBoatDock, stepBoat, toggleBoatAnchor, useBoatDock } from "./farm-boating.mjs";
import { createHarborWorld } from "./farm-harbor-world.mjs";
import { FISHING_REGIONS, findFishingRegion, regionZoneAt } from "./farm-fishing-regions.mjs";
import { fishingRegionScene, createFishingRegionWorld, createCoveTrailheads } from "./farm-fishing-region-world.mjs";
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
import { createRoomPresence, type RemoteMember } from "./arcade-room-presence.mjs";
import { createRoomVisitors } from "./arcade-room-visitors.mjs";
import { createRoomChat } from "./arcade-room-chat.mjs";
import { createRoomChatView } from "./arcade-room-chat-view.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { presenceRodFor } from "./farm-cove-anglers.mjs";
import { createCoveAnglersView } from "./farm-cove-anglers-view.mjs";
import { EYE_HEIGHT, doorRows, farmObstacles, farmSeats, nearestDoor, type DoorRow } from "./farm-scene.mjs";
import { createFarmBody, eyeHeight, isMoveKey, sitOn, standUp, stepFarmBody, type FarmBody } from "./farm-body.mjs";
import { SEATED_PROMPT, SEAT_PROMPT, canWorkDoor, findSeatInReach, getDoorPrompt, type SeatInReach } from "./farm-interaction.mjs";
import { gatewayAt } from "./farm-gateway.mjs";
import { createAwayRiding } from "./farm-riding-away.mjs";
import { cosmeticRideProfile } from "./farm-ride-profile.mjs";
import { getRidingPrompt } from "./farm-interaction.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";
import { bodyObstacles, obstaclesForSpan } from "./farm-body.mjs";
import { horseTravelQuery, ridingHorseFrom } from "./farm-riding-travel.mjs";
import { riderReach } from "./farm-ride.mjs";
import { findStallInReach, keeperPose, stallObstacles, type MarketStall } from "./farm-market-square.mjs";
import { createMarketStallModel } from "./farm-market-props.mjs";
import {
  FISHMONGER_STALL_ID,
  RECORDS_BOARD_ID,
  TACKLE_STALL_ID,
  coveStallPrompt,
  findCoveStall,
} from "./farm-cove.mjs";
import { createCoveTerrain } from "./farm-cove-terrain.mjs";
import { fishmongerStock, tackleStock } from "./farm-cove-props.mjs";
import { findFishSpecies, findFishingRod, MOUNT_FEE, STARTER_ROD_ID, WORM_ID, ZONE_MIN_LEVEL, ZONE_TITLES } from "./farm-catalog/fish.mjs";
import { generateShadows, publicShadow, shadowWindow, normalizePublicShadow, specimenTitle, formatWeight, type PublicShadow, type SizeClass } from "./farm-fish.mjs";
import { createShadowsView } from "./farm-fish-shadows-view.mjs";
import { createFishingController, type FishingEvent } from "./farm-fishing-controller.mjs";
import { createFishingView } from "./farm-fishing-view.mjs";
import { createFishingHud } from "./farm-fishing-hud.mjs";
import { createFishingEquipmentStore } from "./farm-fishing-equipment.mjs";
import { createFishThumbnails } from "./farm-fish-models.mjs";
import { PRACTICE_ANGLER, baitCount, baitTitle, bestRod, catchNews, nextBait, nextRod, normalizeAngler, type Angler, type AnglerFish } from "./farm-angler.mjs";
import { createCreelPanel, createFishmongerPanel, createRecordsPanel, createTacklePanel, normalizeRecords, type PanelOutcome } from "./farm-cove-panels.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { readFactoryAccountSession } from "./platform/api/factory-account-gate.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { createFarmSoundEffects, catchEffect } from "./farm-sound-effects.mjs";
import { FARM_LAYOUT_SPEC, createDefaultFarmLayout } from "./farm-layout.mjs";
import { createFarmInventorySummary } from "./farm-inventory-summary.mjs";
import { createFarmStatsPanel } from "./farm-stats-panel.mjs";
import { createFarmHud } from "./farm-hud.mjs";
import { resolveFarmSceneTime } from "./farm-time.mjs";

const destinationQuery = new URLSearchParams(location.search);
const harbor = /\/harbor\/(?:index\.html)?$/.test(location.pathname);
const island = harbor && travelRegion(destinationQuery) === "orchard-isle";
let boatState = dockedBoat();
let aboard = false;
const region = findFishingRegion(destinationQuery.get("area"));
// A public practice visit never loads or modifies the farmer's actual account.
const preview = destinationQuery.get("preview") === "1" && Boolean(region?.requiredProperty);
const areaId = harbor ? island ? "orchard-harbor" : "harbor" : region?.id ?? "cove";
const areaTitle = harbor ? island ? "Orchard Harbor" : "Mainland Harbor" : region?.title ?? "The Cove";
const areaScene = harbor ? { ...harborScene, COVE_PRESENCE_ROOM: island ? "farm:orchard-harbor" : harborScene.COVE_PRESENCE_ROOM } : region ? fishingRegionScene(region) : cove;
const { COVE_BOUNDS, COVE_MARKET_GATE, COVE_PRESENCE_ROOM, COVE_SPAWN, COVE_RAIL_ID, COVE_STALLS, coveGroundAt, coveWaterDepthAt, castOrigin, coveLayout, coveObstacles, covePlatforms, coveWaterDistance } = areaScene;

const THREE: Record<string, any> = THREE_VENDOR;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`The Cove is missing ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#coveCanvas");
const prompt = requiredElement<HTMLElement>("#covePrompt");
const startGate = requiredElement<HTMLElement>("#startGate");
const enterButton = requiredElement<HTMLButtonElement>("#enterCove");
const status = requiredElement<HTMLElement>("#coveStatus");
const backLink = requiredElement<HTMLAnchorElement>("#coveBackLink");
const ticketChip = requiredElement<HTMLElement>("#coveTickets");
const musicButton = requiredElement<HTMLButtonElement>("#toggleCoveMusic");
const visitorsChip = requiredElement<HTMLElement>("#coveVisitors");
const visitorsChipLabel = requiredElement<HTMLElement>("#coveVisitorsLabel");
const visitorsChipNames = requiredElement<HTMLElement>("#coveVisitorsNames");
const tackleBar = requiredElement<HTMLElement>("#tackleBar");

// The HUD layer (farm-hud.mts): the Cove's sheets register with it; it owns the mouse, Escape and the toast.
const farmHud = createFarmHud({
  canvas,
  canRelock: () => entered && !leaving,
  controls: requiredElement<HTMLElement>("#controlHint"),
});
// F is the Fishdex here, so fullscreen is the toolbar button's alone.
farmHud.fullscreen.bind(requiredElement<HTMLButtonElement>("#fullscreenCove"));

// Back up the path: to the Market Square's north gate, carrying the farm to come home to.
const fromFarm = new URLSearchParams(location.search).get("farm") ?? "";
const marketUrl = `../market/index.html?from=cove&${horseTravelQuery(fromFarm, "")}`;
backLink.href = region?.requiredProperty ? `../index.html?from=${region.id}&${horseTravelQuery(fromFarm, "", "id")}` : region ? `index.html?from=${region.id}&${horseTravelQuery(fromFarm, "")}` : marketUrl;
if (harbor) {
  backLink.href = `../cove/index.html?from=harbor&${horseTravelQuery(fromFarm, destinationQuery.get("horse") ?? "")}`;
  backLink.querySelector(".back-link__words")!.textContent = "The Cove";
  requiredElement<HTMLElement>(".hud-place__name h1").textContent = "Mainland Harbor";
  requiredElement<HTMLElement>(".hud-place__name .eyebrow").textContent = "THE MAINLAND / COAST PATH";
  requiredElement<HTMLElement>(".start-card h2").textContent = "Down to the harbor.";
  requiredElement<HTMLElement>(".start-card p").textContent = "Walk down to the pier and press E by the boat to board. Row out, drop anchor with F, and fish with Space. Sail to the marked sea route for Orchard Isle, or take the free ferry beside the pier. Return slowly and press E to disembark.";
  enterButton.textContent = "Walk into the harbor";
  requiredElement<HTMLElement>(".start-card__tag").textContent = "MAINLAND HARBOR";
  visitorsChipLabel.textContent = "AT THE HARBOR";
}
if (region) {
  document.title = `${region.title} - Farm`;
  requiredElement<HTMLElement>(".hud-place__name h1").textContent = region.title;
  requiredElement<HTMLElement>(".hud-place__name .eyebrow").textContent = region.requiredProperty ? "YOUR PROPERTY / PRIVATE FISHING" : `${region.direction.toUpperCase()} OF THE COVE`;
  requiredElement<HTMLElement>("#coveBackLink .back-link__words").textContent = region.requiredProperty ? "Your farm" : "The Cove";
  requiredElement<HTMLElement>(".start-card h2").textContent = region.title;
  requiredElement<HTMLElement>(".start-card p").textContent = `${region.description} Fishing level ${region.minLevel} to keep catches here. Return to the Cove for bait, sales and records.`;
  enterButton.textContent = "Explore the pools";
}

if (island) {
  document.title = "Orchard Harbor · Farm";
  backLink.href = publicRegionUrl("market", "orchard-isle", new URLSearchParams("from=harbor"));
  backLink.querySelector(".back-link__words")!.textContent = "Orchard Market";
  requiredElement<HTMLElement>(".hud-place__name h1").textContent = areaTitle;
  requiredElement<HTMLElement>(".hud-place__name .eyebrow").textContent = "ORCHARD ISLE / HARBOR VILLAGE";
  requiredElement<HTMLElement>(".start-card h2").textContent = "Welcome to Orchard Isle.";
  requiredElement<HTMLElement>(".start-card p").textContent = "Step off the pier into the village. Follow the road to Orchard Market, or the east path to the homesteads. Read the resident board to visit neighbors. Fish from the dock or anchor offshore. The ferry returns to the mainland.";
  requiredElement<HTMLElement>(".start-card__tag").textContent = "ORCHARD ISLE";
  enterButton.textContent = "Step ashore";
  visitorsChipLabel.textContent = "ON ORCHARD ISLE";
}

const inventoryFarm = preview ? { layout: createDefaultFarmLayout(() => .5) } : await createLayoutStore(FARM_LAYOUT_SPEC).load();
if (preview) {
  backLink.href = `../tour.html?property=${encodeURIComponent(region!.requiredProperty!)}&from=${region!.id}`;
  requiredElement<HTMLElement>("#coveBackLink .back-link__words").textContent = "Farm preview";
  requiredElement<HTMLElement>(".start-card p").textContent = `${region!.description} Try the full fishing minigame with a borrowed rod and bait. Practice catches are not saved; no tickets or ownership changes.`;
  requiredElement<HTMLElement>(".start-card__tag").textContent = "FREE FISHING PRACTICE";
  requiredElement<HTMLElement>(".hud-place__name .eyebrow").textContent = "PROPERTY PREVIEW / PRACTICE FISHING";
  enterButton.textContent = "Start fishing";
}
if (!preview && region?.requiredProperty && inventoryFarm.layout.lot !== region.requiredProperty) {
  enterButton.disabled = true; enterButton.textContent = "Property ownership required";
  requiredElement<HTMLElement>(".start-card p").textContent = `This fishing area belongs to ${region.requiredProperty === "lot.estate" ? "Sunwater Estate" : "Cedar Hollow"}. Visit the Property Office in the Market to make it your home.`;
}

const inventorySummary = createFarmInventorySummary({
  root: requiredElement<HTMLElement>("#inventoryPanel"),
  openButton: requiredElement<HTMLButtonElement>("#openInventory"),
  closeButton: requiredElement<HTMLButtonElement>("#closeInventory"),
  body: requiredElement<HTMLElement>("#inventorySummary"),
});
const statsPanel = createFarmStatsPanel({
  root: requiredElement<HTMLElement>("#statsPanel"),
  openButton: requiredElement<HTMLButtonElement>("#openStats"),
  closeButton: requiredElement<HTMLButtonElement>("#closeStats"),
  summary: requiredElement<HTMLElement>("#statsSummary"),
  grid: requiredElement<HTMLElement>("#statsGrid"),
}, {
  loadTrades: () => preview ? Promise.resolve(null) : api.fetchCurrentFarmTrade(true),
  onClose: () => canvas.focus(),
});

// ---------------------------------------------------------------- the angler

const api = createPlatformApiClient();
const residents = createIslandResidents((after) => api.fetchFarmResidents("orchard-isle", after), () => canvas.focus());
farmHud.sheet("island-residents", { root: residents.root, close: residents.close });
const signedIn = !preview && readFactoryAccountSession().authenticated && api.isConfigured !== false;
let angler: Angler = PRACTICE_ANGLER;
let accountLoaded = false;
async function loadAngler(): Promise<void> {
  if (!signedIn) return;
  const next = normalizeAngler(await api.fetchFarmFishing().catch(() => null));
  if (next) {
    angler = next;
    accountLoaded = true;
    if (!angler.tackle.rods.includes(rodId)) rodId = bestRod(angler).id;
    if (baitCount(angler, baitId) <= 0) baitId = nextBait(angler, baitId);
    fishingView.setRod(rodId);
    saveEquipment();
  }
  repaintPanels();
}
/** Keep what an answer says about the tackle box without waiting for a full re-read. */
function takeTackle(value: unknown): void {
  const next = normalizeAngler({ tackle: value, fishing: { xp: angler.xp, catches: angler.catches }, creel: angler.creel, capacity: angler.capacity, dex: angler.dex, caughtShadows: [...angler.caughtShadows], mounted: angler.mounted });
  if (next) { angler = next; repaintPanels(); }
}

const equipmentStore = createFishingEquipmentStore(signedIn ? loadFactoryProfile().playerId : "practice");
let { rodId, baitId } = preview ? { rodId: STARTER_ROD_ID, baitId: WORM_ID } : equipmentStore.load();
function saveEquipment(): void { if (!preview) equipmentStore.save({ rodId, baitId }); }

const ticketClient = createTicketWalletClient();
let balance: number | null = null;
function renderTickets(): void {
  ticketChip.hidden = balance === null;
  ticketChip.querySelector("strong")!.textContent = formatTicketBalance(balance);
}
function takeBalance(value: unknown): void {
  if (!Number.isSafeInteger(value)) return;
  balance = value as number;
  publishTicketBalance(balance);
  renderTickets();
}
if (signedIn) void ticketClient.getWallet().then((wallet: any) => takeBalance(wallet?.balance)).catch(() => undefined);
renderTickets();

const music = createFarmMusic();
const farmSounds = createFarmSoundEffects();
window.addEventListener("pagehide", () => farmSounds.destroy(), { once: true });
function renderMusicButton(): void {
  const muted = music.isMuted();
  musicButton.setAttribute("aria-pressed", String(muted));
  musicButton.title = muted ? "Music off — play it (M)" : "Music on — mute it (M)";
}
musicButton.addEventListener("click", () => { music.setMuted(!music.isMuted()); renderMusicButton(); });
renderMusicButton();

// ---------------------------------------------------------------- the world

let renderer: any;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
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
const world = harbor ? { sync: (_layout: unknown) => {}, setTime: (_time: number) => {}, update: (_dt: number) => {}, doorsFor: (_id: string) => null }
  : createFarmWorld(THREE, scene, { groundCover: false, field: false, keepClear: (x, z) => Boolean(region?.requiredProperty) || region?.id === "grotto" || coveWaterDistance({ x, z }) > -4 });
world.sync(layout);
// Like the farm and square, the Cove uses this client's paused farm clock;
// people fishing together can therefore see different skies. `?time=` is QA.
world.setTime(resolveFarmSceneTime(inventoryFarm.layout.clock.farmMinutes, new URLSearchParams(location.search).get("time")));
const harborWorld = harbor ? createHarborWorld(THREE, scene, (ok) => { if (!ok) status.textContent = "The boat model could not load. Reload before boarding."; }, island) : null;
const terrain = harborWorld ? { update: (_dt: number, seconds: number) => harborWorld.update(boatState, seconds) }
  : region ? createFishingRegionWorld(THREE, scene, region) : createCoveTerrain(THREE, scene);
if (!region && !harbor) createCoveTrailheads(THREE, scene);
const STOCK = { [FISHMONGER_STALL_ID]: fishmongerStock(THREE), [TACKLE_STALL_ID]: tackleStock(THREE) } as const;
for (const stall of COVE_STALLS) scene.add(createMarketStallModel(THREE, stall, STOCK[stall.id as keyof typeof STOCK]));

const keepers = createRoomVisitors(THREE, scene);
const keeperMembers: readonly RemoteMember[] = COVE_STALLS.filter((stall) => stall.keeper).map((stall) => {
  const pose = keeperPose(stall);
  return Object.freeze({
    clientId: `keeper-${stall.id}`,
    playerId: "",
    displayName: stall.keeper!.name,
    avatarId: stall.keeper!.avatarId,
    pose: Object.freeze({ x: pose.x, z: pose.z, yaw: pose.yaw, moving: false, activity: stall.title }),
    poseAt: 0,
    emote: "",
    emoteAt: 0,
  });
});
keepers.sync(keeperMembers);
const keeperSaidAt = new Map<string, number>();
function keeperSays(stall: MarketStall, text: string, now = performance.now()): void {
  keeperSaidAt.set(stall.id, now);
  keepers.say(`keeper-${stall.id}`, text, now);
}

const shadowsView = createShadowsView(THREE, scene);
let shadows: readonly PublicShadow[] = [];
async function loadShadows(): Promise<void> {
  if (harbor) { shadows = []; shadowsView.sync(shadows); return; }
  if (preview) {
    let seed = 4271;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    shadows = generateShadows(shadowWindow(Date.now()), random, random).filter(shadow => shadow.zone === region!.id).map(shadow => ({ ...publicShadow(shadow), bornAt: Date.now() - 30_000, goneAt: Date.now() + 300_000 }));
    shadowsView.sync(shadows);
    return;
  }
  const answer: any = await api.fetchFarmFishShadows().catch(() => null);
  const list = Array.isArray(answer?.shadows) ? answer.shadows.map(normalizePublicShadow).filter(Boolean) as PublicShadow[] : null;
  if (list) {
    shadows = list.filter((shadow) => region ? shadow.zone === region.id : ["lagoon", "reef", "deep"].includes(shadow.zone));
    shadowsView.sync(shadows);
  }
}
// A new window every five minutes: read the next one well before it starts.
setInterval(() => { void loadShadows(); }, 60_000);

// ---------------------------------------------------------------- walking

const player = { x: COVE_SPAWN.x, z: COVE_SPAWN.z, yaw: COVE_SPAWN.yaw, pitch: -0.06 };
// `?at=pier|jetty|spit` stands the player at a fishing spot, facing the water — a QA seam like the market's `?at=`.
const QA_SPOTS: Readonly<Record<string, Readonly<{ x: number; z: number; yaw: number }>>> = Object.freeze({
  "harbor-trail": { x: 17.2, z: 17.2, yaw: -Math.PI / 2 },
  pier: { x: 11, z: -10.2, yaw: 0 },
  "west-trail": { x: -17.8, z: 9.5, yaw: Math.PI / 2 },
  "east-trail": { x: 17.8, z: 9.5, yaw: -Math.PI / 2 },
  jetty: { x: -10, z: -1.4, yaw: 0 },
  spit: { x: -1.2, z: -8, yaw: Math.PI / 2 },
  // At the counters, which face north: stand in front and look south at them.
  fishmonger: { x: 7.6, z: 13.4, yaw: Math.PI },
  tackle: { x: -7.6, z: 13.4, yaw: Math.PI },
  records: { x: -17.2, z: 13, yaw: Math.PI / 2 },
});
const qaSpot = QA_SPOTS[new URLSearchParams(location.search).get("at") ?? ""];
if (qaSpot && !region && !harbor) Object.assign(player, qaSpot);
if (harbor && destinationQuery.get("at") === "dock") Object.assign(player, harborDockFoot(HARBOR_DOCKS[0]!));
if (island) {
  Object.assign(player, destinationQuery.get("from") === "market" ? { x: 0, z: 36, yaw: 0 }
    : destinationQuery.get("from") === "farm" ? { x: 22, z: 38, yaw: Math.PI / 2 }
    : { x: 0, z: 17, yaw: Math.PI });
  if (destinationQuery.get("at") === "residents") Object.assign(player, { x: 9, z: 33, yaw: 0 });
}
if (harbor && destinationQuery.get("at") === "ferry") Object.assign(player, { x: -6, z: 27, yaw: 0 });
if (!region && !harbor && destinationQuery.get("from") === "harbor") Object.assign(player, { x: 17, z: 17.2, yaw: Math.PI / 2 });
if (!region && destinationQuery.get("from") === "grotto") Object.assign(player, { x: -17.8, z: 9.5, yaw: -Math.PI / 2 });
if (!region && destinationQuery.get("from") === "volcanic") Object.assign(player, { x: 17.8, z: 9.5, yaw: Math.PI / 2 });
if (region && destinationQuery.get("at") === "shore") Object.assign(player, region.fishingSpot ?? (region.id === "grotto" ? { x: -9, z: 12.5, yaw: 0 } : { x: -10, z: 20, yaw: 0 }));
if (region && destinationQuery.get("at") === "return") Object.assign(player, region.entry ? { ...region.entry, yaw: region.entry.yaw + Math.PI } : { x: region.exit.x - Math.sign(region.exit.x) * 3, z: region.exit.z, yaw: region.exit.x > 0 ? -Math.PI / 2 : Math.PI / 2 });
let body: FarmBody = createFarmBody();
if (harbor) body = { ...body, y: harborWalkHeight(player) ?? 0 };
const walkerBounds = { halfWidth: COVE_BOUNDS.width / 2, halfDepth: COVE_BOUNDS.depth / 2, margin: COVE_BOUNDS.wallInset };
const openDoors = new Set<string>();
const water = coveObstacles();
const docks = covePlatforms();
const solidStalls = stallObstacles(COVE_STALLS);
let obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls, ...water];
const seats = farmSeats(layout);
const doors = doorRows(layout);
// A rider who came on horseback rides the shore (cosmetic riding) and ties up at the rail to fish.
const away = createAwayRiding(THREE, scene, {
  horse: harbor ? null : ridingHorseFrom(inventoryFarm.layout, new URLSearchParams(location.search).get("horse")),
  mode: "cosmetic",
  profile: () => cosmeticRideProfile(),
  world: () => ({ bounds: walkerBounds, solids: obstaclesForSpan(obstacles, 0.3, 2.4), ground: coveGroundAt, water: coveWaterDepthAt }),
  canStand: (point) => !bodyObstacles(obstacles, 0).some((solid) => obstacleBlocks(point, solid)),
  rails: layout.decor.filter((row) => row.instanceId === COVE_RAIL_ID),
  canTie: true,
});
if (away.hasHorse() && away.arrive({ x: player.x, z: player.z, heading: player.yaw })) player.pitch = -0.32;
let riderClock = 0;
const keys = new Set<string>();
let entered = false;
let leaving = false;
let draggingLook = false;
let doorInReach: DoorRow | null = null;
let seatInReach: SeatInReach | null = null;
let stallInReach: MarketStall | null = null;
let nearbyVisitor: RemoteMember | null = null;
let atWater = false;

function applyCamera(): void {
  if (harbor && aboard && boatState.mode === "sailing" && !fishing.busy()) {
    camera.position.set(boatState.x + Math.sin(boatState.yaw) * 8, 4.5, boatState.z + Math.cos(boatState.yaw) * 8);
    camera.lookAt(boatState.x - Math.sin(boatState.yaw) * 4, 0.6, boatState.z - Math.cos(boatState.yaw) * 4);
    return;
  }
  if (away.mounted()) {
    const eye = away.eye(riderClock);
    player.yaw = away.state()!.heading;
    camera.position.set(eye.x, eye.y, eye.z);
  } else {
    camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
  }
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function setPrompt(text: string): void {
  farmHud.setPrompt(prompt, text);
}

/** What just happened (a switched bait, a wave, a sale): the HUD's toast, above the prompt, which stays live. */
function notice(text: string, seconds = 5): void {
  farmHud.toast(text, seconds);
}

// ---------------------------------------------------------------- the others at the Cove

const visitors = createRoomVisitors(THREE, scene, { mountSeat: (mount) => away.seatFor(mount) });
const factoryProfile = preview ? { playerId: "", profileName: "Practice angler" } : loadFactoryProfile();
const presenceName = factoryProfile.profileName || "Player";
const presence = createRoomPresence({
  roomId: region?.requiredProperty ? `${COVE_PRESENCE_ROOM}:${fromFarm || factoryProfile.playerId || "guest"}` : COVE_PRESENCE_ROOM,
  identity: { playerId: factoryProfile.playerId, displayName: presenceName, avatarId: "" },
});
if (!preview) void createRoomLayoutStore().loadSelfAvatarId().then((avatarId) => {
  presence.setIdentity({ playerId: factoryProfile.playerId, displayName: presenceName, avatarId });
}).catch(() => undefined);

function renderVisitorsChip(): void {
  const members = presence.members();
  const state = presence.status();
  visitorsChip.hidden = !(state === "full" || members.length > 0);
  if (state === "full") {
    visitorsChipLabel.textContent = `${areaTitle.toUpperCase()} FULL`;
    visitorsChipNames.textContent = `Too many people are at ${areaTitle} right now.`;
    return;
  }
  visitorsChipLabel.textContent = `AT ${areaTitle.toUpperCase()} · ${members.length}`;
  visitorsChipNames.textContent = members.map((member) => member.pose.activity ? `${member.displayName} (${member.pose.activity})` : member.displayName).join(", ");
}

const chat = createRoomChat({ send: (text) => presence.sendChat(text), selfName: presenceName });
const chatView = createRoomChatView({
  chat,
  root: requiredElement<HTMLElement>("#coveChat"),
  log: requiredElement<HTMLElement>("#coveChatLog"),
  input: requiredElement<HTMLInputElement>("#coveChatInput"),
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
window.addEventListener("pageshow", () => { if (!preview) presence.connect(); });

const ACTIVITY: Readonly<Record<string, string>> = Object.freeze({
  charging: "casting", flight: "casting", waiting: "fishing", fighting: "reeling one in!", netting: "netting a fish!", settling: "landing a fish", reveal: "admiring a catch",
});

// ---------------------------------------------------------------- fishing

const newId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
const achievements = createAchievementToaster();

const fishing = createFishingController({
  api: signedIn ? {
    cast: async (request) => {
      const result: any = await api.castFarmLine({ ...request, areaId });
      return result?.ok ? result : { ok: false, error: String(result?.error ?? "unavailable"), ...result };
    },
    land: async (castId, outcome, grade) => {
      const result: any = await api.landFarmCast({ castId, outcome, grade });
      return result?.ok ? result : { ok: false, error: String(result?.error ?? "unavailable"), ...result };
    },
  } : null,
  castOrigin,
  zoneAt: harbor ? harborFishingZoneAt : region ? (point) => regionZoneAt(region, point) : cove.coveZoneAt,
  random: Math.random,
  now: () => Date.now(),
  tackle: () => ({ rod: findFishingRod(rodId) ?? findFishingRod(STARTER_ROD_ID)!, bait: baitId, level: angler.level }),
  shadows: () => shadows,
  caught: () => angler.caughtShadows,
  onEvent: onFishingEvent,
  newId,
});
const fishingView = createFishingView(THREE, scene, camera, harbor ? 0 : cove.COVE_WATER_LEVEL);
fishingView.setRod(rodId);
// Everyone else's lines: their rod, line and bobber, read off their presence poses.
const anglersView = createCoveAnglersView(THREE, scene);
const hud = createFishingHud(requiredElement<HTMLElement>("#fishingHud"), requiredElement<HTMLElement>("#catchCard"));

const REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  zone_locked: "",
  property_required: "This private fishing area requires ownership of its farm property.",
  no_bait: "You're out of that bait. Press Q to switch, or buy more at Bait & Tackle.",
  creel_full: "Your creel is full. Sell some at the Fishmonger or let some go (C).",
  too_many_casts: "Take a breather — that's a lot of casting for one hour.",
  rod_not_owned: "That rod isn't yours yet.",
  not_water: "That cast didn't land in the water.",
});

function onFishingEvent(event: FishingEvent): void {
  switch (event.kind) {
    case "notice":
      notice(event.text, 4);
      return;
    case "refused": {
      const detail: any = event.detail;
      const text = event.error === "zone_locked"
        ? `${ZONE_TITLES[detail.zone as keyof typeof ZONE_TITLES] ?? "That water"} opens at Fishing level ${detail.minLevel}. Explore the Cove until your Fishing level is high enough.`
        : REFUSALS[event.error] ?? "The cast didn't go through. Try again in a moment.";
      notice(text, 5);
      if (detail?.tackle) takeTackle(detail.tackle);
      return;
    }
    case "cast":
      if (event.answer?.tackle) takeTackle(event.answer.tackle);
      return;
    case "hooked":
      notice("Fish on! Hold Space to reel, steer against it with A / D.", 3);
      return;
    case "lost": {
      const words = event.how === "early" ? "Too soon — you spooked it." : event.how === "late" ? "Too slow — it took the bait and left." : event.how === "snapped" ? "SNAP! The line broke." : "It threw the hook and got away.";
      const answer: any = event.answer;
      if (answer?.ok && answer.tackle) takeTackle(answer.tackle);
      notice(`${words}${answer?.ok && answer.xp ? ` +${answer.xp} Fishing XP for the fight.` : ""}`, 4);
      return;
    }
    case "landing-refused":
      notice(event.error === "too_soon" ? "The Cove didn't believe that one — it was landed faster than a fish can tire." : event.error === "creel_full" ? "Your creel was full — the fish slipped back into the water." : "The fish slipped off at the last moment. Try again.", 5);
      return;
    case "landed": {
      const fish = event.fish;
      farmSounds.play(catchEffect(fish));
      farmSounds.result(event.answer);
      const news = catchNews(angler, fish.speciesId, fish.weightG);
      const answer: any = event.answer;
      const levelUp = answer?.fishing && Number(answer.fishing.level) > Number(answer.fishing.levelBefore) ? Number(answer.fishing.level) : null;
      hud.showCatch(fish, { xp: event.xp, practice: event.practice, preview, firstOfKind: news.firstOfKind, personalBest: news.personalBest, levelUp });
      if (answer?.tackle) takeTackle(answer.tackle);
      if (Array.isArray(answer?.achievements) && answer.achievements.length) achievements.show("farm", "The Farm", answer.achievements);
      // Worth shouting about: rare fish, big fish, coloured fish.
      const rarity = findFishSpecies(fish.speciesId)?.rarity ?? "common";
      const brag = !event.practice && (rarity === "rare" || rarity === "epic" || rarity === "legendary" || fish.sizeClass === "trophy" || fish.sizeClass === "record" || fish.variant !== "normal");
      if (brag) presence.sendChat(`🎣 landed a ${formatWeight(fish.weightG)} ${specimenTitle(fish.speciesId, fish.variant, fish.sizeClass as SizeClass)}!`);
      if (!event.practice) void loadAngler();
      return;
    }
  }
}

// ---------------------------------------------------------------- the panels

const thumbs = createFishThumbnails(THREE, () => repaintPanels());
const outcomeOf = (result: any, success: string, messages: Readonly<Record<string, string>> = {}): PanelOutcome =>
  result?.ok ? { ok: true, message: success } : { ok: false, message: messages[result?.error] ?? "That didn't go through. Nothing changed — try again in a moment." };

const creelPanel = createCreelPanel(requiredElement<HTMLElement>("#creelPanel"), {
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
    const result: any = await api.mountFarmFish({ fishId: fish.id, mounted, purchaseId: mounted ? newId("mount") : undefined });
    await loadAngler();
    if (result?.ok) takeBalance(result.balance);
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

const fishmongerPanel = createFishmongerPanel(requiredElement<HTMLElement>("#fishmongerPanel"), {
  angler: () => angler,
  thumbs,
  sell: async (fish: readonly AnglerFish[]) => {
    const result: any = await api.sellFarmFish({ saleId: newId("fish-sale"), fishIds: fish.map((entry) => entry.id) });
    await loadAngler();
    if (result?.ok) {
      takeBalance(result.balance);
      keeperSays(findCoveStall(FISHMONGER_STALL_ID)!, fish.length > 3 ? "What a haul! Pleasure doing business." : "Lovely fish. Come back soon!");
    }
    return outcomeOf(result, `Sold for ${Number(result?.earned ?? 0).toLocaleString()} tickets. Your balance is ${formatTicketBalance(balance)}.`, {
      fish_locked: "One of those is locked. Unlock it in your creel first.",
      not_in_creel: "Your creel changed while Coral was counting. Nothing was sold.",
    });
  },
  onClose: () => canvas.focus(),
});

const tacklePanel = createTacklePanel(requiredElement<HTMLElement>("#tacklePanel"), {
  angler: () => angler,
  thumbs,
  buy: async (itemId, quantity) => {
    const result: any = await api.buyFarmTackle({ purchaseId: newId("tackle"), itemId, quantity });
    if (result?.tackle) takeTackle(result.tackle);
    if (result?.ok) {
      takeBalance(result.balance);
      keeperSays(findCoveStall(TACKLE_STALL_ID)!, itemId.startsWith("rod.") ? "A fine rod. Treat it well." : "Tight lines!");
      if (itemId.startsWith("rod.")) {
        rodId = itemId;
        fishingView.setRod(rodId);
        saveEquipment();
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

const recordsPanel = createRecordsPanel(requiredElement<HTMLElement>("#recordsPanel"), {
  load: async () => normalizeRecords(preview ? null : await api.fetchFarmFishRecords().catch(() => null)),
  thumbs,
  onClose: () => canvas.focus(),
});

function repaintPanels(): void {
  const fishing = accountLoaded ? angler : null;
  inventorySummary.render(inventoryFarm.layout, fishing);
  statsPanel.render(inventoryFarm.layout.skills, fishing);
  creelPanel.repaint();
  fishmongerPanel.repaint();
  tacklePanel.repaint();
  recordsPanel.repaint();
  renderTackleBar();
}

// Every sheet at the Cove, with the HUD layer: it frees the mouse, keeps one open, and closes the top one on
// Escape or a click on the water. I and K wait while a fish is on; C and F are the creel's own (below).
const freeHands = (): boolean => entered && !leaving && !fishing.busy();
farmHud.sheet("inventory", { root: requiredElement<HTMLElement>("#inventoryPanel"), open: () => inventorySummary.toggle(), close: () => inventorySummary.close(), key: "KeyI", enabled: freeHands });
farmHud.sheet("stats", { root: requiredElement<HTMLElement>("#statsPanel"), open: () => statsPanel.open(), close: () => statsPanel.close(), key: "KeyK", enabled: freeHands });
farmHud.sheet("creel", { root: requiredElement<HTMLElement>("#creelPanel"), close: () => creelPanel.close() });
farmHud.sheet("fishmonger", { root: requiredElement<HTMLElement>("#fishmongerPanel"), close: () => fishmongerPanel.close() });
farmHud.sheet("tackle", { root: requiredElement<HTMLElement>("#tacklePanel"), close: () => tacklePanel.close() });
farmHud.sheet("records", { root: requiredElement<HTMLElement>("#recordsPanel"), close: () => recordsPanel.close() });

/** C for the creel, F for the Fishdex: the same key again puts it away, the other key turns to the other tab. */
function toggleCreel(tab: "creel" | "dex"): void {
  if (creelPanel.isOpen() && creelPanel.tab() === tab) creelPanel.close();
  else creelPanel.showTab(tab);
}
requiredElement<HTMLButtonElement>("#openCreel").addEventListener("click", () => toggleCreel("creel"));
requiredElement<HTMLButtonElement>("#openFishdex").addEventListener("click", () => toggleCreel("dex"));

function panelOpen(): boolean {
  return farmHud.anyOpen();
}

function renderTackleBar(): void {
  const rod = findFishingRod(rodId);
  const bait = baitCount(angler, baitId);
  // Four slots, each a label, a value and the key that changes it — the Cove's version of the farm's status card.
  tackleBar.innerHTML = `
    <span class="tackle-slot"><small>Rod</small><b>${rod?.title ?? "Rod"}</b><kbd>R</kbd></span>
    <span class="tackle-slot${bait <= 0 ? " is-empty" : ""}"><small>Bait</small><b>${baitTitle(baitId)} × ${bait}</b><kbd>Q</kbd></span>
    <span class="tackle-slot"><small>Fishing</small><b>Level ${angler.level}${signedIn ? "" : " · practice"}</b></span>
    <span class="tackle-slot"><small>Creel</small><b>${angler.creel.length} / ${angler.capacity}</b><kbd>C</kbd></span>
  `;
}
renderTackleBar();

function workStall(stall: MarketStall): void {
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
  if (stall.id === TACKLE_STALL_ID) tacklePanel.open();
  else fishmongerPanel.open();
  if (stall.keeper) keeperSays(stall, stall.keeper.greeting);
}

// ---------------------------------------------------------------- walking, E and the keys

function boatWithinReach(): boolean {
  return harbor && !aboard && boatState.mode === "docked" && Math.hypot(player.x - boatState.x, player.z - boatState.z) <= 5.5;
}
function boardOrDisembark(): boolean {
  if (!harbor || fishing.busy() || !entered || panelOpen()) return false;
  if (boatWithinReach()) {
    aboard = true; boatState = useBoatDock(boatState);
    Object.assign(player, { x: boatState.x, z: boatState.z, yaw: boatState.yaw, pitch: -0.06 });
    body = { ...createFarmBody(), y: 0.6 }; keys.clear();
    notice("W/S to row, A/D to steer. F drops anchor so you can fish with Space. E at a landing steps ashore.");
    return true;
  }
  if (!aboard) return false;
  const dock = nearbyBoatDock(boatState);
  if (!dock || Math.abs(boatState.speed) > BOAT_HANDLING.dockingSpeed) {
    notice("Approach a landing slowly. Hold Shift to brake, then press E to step onto the pier."); return true;
  }
  boatState = dockedBoat(dock.id); aboard = false;
  Object.assign(player, harborDockFoot(dock)); body = { ...createFarmBody(), y: 0.87 }; keys.clear();
  notice(`You stepped onto ${dock.title}. Walk along the pier to explore; your boat stays moored here.`);
  return true;
}
function changeBoatAnchor(): void {
  if (!aboard || fishing.busy() || panelOpen()) return;
  boatState = toggleBoatAnchor(boatState); keys.clear();
  player.yaw = boatState.yaw; player.pitch = -0.06;
  notice(boatState.mode === "anchored" ? "Anchor down. Look toward open water and hold Space to cast." : "Anchor raised. W/S to row; Shift to brake.");
}
function refreshBoatControls(): void {
  if (!harbor) return;
  const controls = requiredElement<HTMLElement>("#boatControls");
  controls.hidden = !entered || panelOpen() || fishing.busy() || (!aboard && !boatWithinReach());
  requiredElement<HTMLElement>("#boatMode").textContent = !aboard ? "On the pier" : boatState.mode === "anchored" ? "At anchor · Space to fish" : "Under way";
  requiredElement<HTMLElement>("#boatSpeed").textContent = Math.abs(boatState.speed).toFixed(1);
  const use = requiredElement<HTMLButtonElement>("#useDock");
  use.textContent = aboard ? "Disembark · E" : "Board boat · E";
  use.disabled = aboard && (!nearbyBoatDock(boatState) || Math.abs(boatState.speed) > BOAT_HANDLING.dockingSpeed);
  const anchor = requiredElement<HTMLButtonElement>("#toggleAnchor"); anchor.disabled = !aboard;
  anchor.textContent = boatState.mode === "anchored" ? "Raise anchor · F" : "Drop anchor · F";
}
if (harbor) {
  requiredElement<HTMLButtonElement>("#useDock").addEventListener("click", () => { boardOrDisembark(); });
  requiredElement<HTMLButtonElement>("#toggleAnchor").addEventListener("click", changeBoatAnchor);
  requiredElement<HTMLButtonElement>("#returnHarbor").addEventListener("click", () => {
    if (fishing.busy()) return;
    boatState = dockedBoat(); aboard = false; keys.clear();
    Object.assign(player, harborDockFoot(HARBOR_DOCKS[0]!)); body = { ...createFarmBody(), y: 0.87 };
    notice(island ? "Back on Orchard Harbor pier. Walk ashore to the market and homesteads." : "Back on the mainland pier. Follow the coast path to walk back to the Cove.");
  });
}

function updateInteraction(): void {
  const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardOf(player.yaw) };
  const free = entered && !leaving && !panelOpen() && body.mode === "walking" && !fishing.busy();
  if (harbor && aboard) {
    doorInReach = null; seatInReach = null; stallInReach = null; nearbyVisitor = null;
    atWater = entered && !panelOpen() && boatState.mode === "anchored" && Boolean(castOrigin(pose));
    if (!entered || panelOpen() || fishing.busy()) { setPrompt(""); return; }
    if (boatState.z < -73) return setPrompt(`Sea route to ${island ? "the Mainland" : "Orchard Isle"} · Press E to sail across`);
    if (nearbyBoatDock(boatState) && Math.abs(boatState.speed) <= BOAT_HANDLING.dockingSpeed) return setPrompt("Press E to disembark onto the pier · F to anchor and fish here");
    return setPrompt(boatState.mode === "anchored" ? "At anchor · Hold Space to cast · F to raise anchor" : "W/S to row · A/D to steer · Shift to brake · F to anchor and fish");
  }
  if (free && harbor && !aboard) {
    if (island) {
      const place = islandPlaceInReach(player);
      if (place) return setPrompt(`Press E · ${ISLAND_PLACES[place].title}`);
    } else if (Math.hypot(player.x + 6, player.z - 25) < 2.8) return setPrompt("Press E · Free ferry to Orchard Isle — market, homesteads and island farming");
  }
  if (free && boatWithinReach()) { atWater = false; return setPrompt("Press E to step into the boat"); }
  const ride = away.state();
  const reachFrom = ride ? riderReach(ride) : pose;
  doorInReach = free ? nearestDoor(doors, reachFrom, (entry) => canWorkDoor(reachFrom, entry.door, entry.reach)) : null;
  // In the saddle: the gate and the hitching rail — tie up to fish or visit the shops.
  if (away.mounted()) {
    stallInReach = null;
    seatInReach = null;
    nearbyVisitor = null;
    atWater = false;
    if (!entered || panelOpen() || leaving) {
      if (!leaving) setPrompt("");
      return;
    }
    if (doorInReach) {
      const back = doorInReach.doorId === COVE_MARKET_GATE;
      return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (back ? " · ride back up to the Market Square" : ""));
    }
    const tie = away.action(pose);
    return setPrompt(tie ? tie.prompt : getRidingPrompt(away.horseName(), "away"));
  }
  if (free && !away.mounted() && !fishing.busy()) {
    if (region && Math.hypot(player.x - region.exit.x, player.z - region.exit.z) < 6) {
      const facingExit = pose.forward.x * (region.exit.x - player.x) + pose.forward.z * (region.exit.z - player.z) > 0;
      return setPrompt(region.requiredProperty ? facingExit ? "Follow the path back to your farm" : "Follow the path through the entrance to the fishing bank" : "Follow the path back to the Cove");
    }
    if (!region && !harbor && player.x > 15 && player.z > 15.7) return setPrompt("Coast path → Mainland Harbor · walk through the opening to the pier and boats");
    if (!region && !harbor && Math.abs(player.z - 9.5) < 3 && Math.abs(player.x) > 15.5) return setPrompt(player.x < 0 ? "West path: Fernfall Grotto - waterfall pools (Fishing 8)" : "East path: Emberglass Lagoon - volcanic pools (Fishing 20)");
    if (harbor && Math.hypot(player.x - HARBOR_COVE_EXIT.x, player.z - HARBOR_COVE_EXIT.z) < 6) return setPrompt("Follow the coast path back to the Cove");
  }
  const untie = free ? away.action(pose) : null;
  if (untie && !doorInReach && entered && !panelOpen()) {
    stallInReach = null;
    seatInReach = null;
    nearbyVisitor = null;
    atWater = false;
    return setPrompt(untie.prompt);
  }
  stallInReach = free && !doorInReach ? findStallInReach(pose, COVE_STALLS) : null;
  seatInReach = free && !doorInReach && !stallInReach ? findSeatInReach(seats, pose) : null;
  nearbyVisitor = free && !doorInReach && !stallInReach && !seatInReach ? visitors.nearest(pose) : null;
  atWater = entered && !panelOpen() && body.mode !== "climbing" && Boolean(castOrigin(pose));
  if (stallInReach?.keeper && performance.now() - (keeperSaidAt.get(stallInReach.id) ?? -Infinity) > 20_000) {
    keeperSays(stallInReach, stallInReach.keeper.greeting);
  }
  if (!entered || panelOpen() || leaving) {
    if (!leaving) setPrompt("");
    return;
  }
  if (fishing.busy()) return setPrompt("");
  if (body.mode === "seated") return setPrompt(atWater ? `${SEATED_PROMPT} · or hold Space to cast from here` : SEATED_PROMPT);
  if (doorInReach) {
    const back = doorInReach.doorId === COVE_MARKET_GATE;
    return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (back ? " · the path back up to the Market Square" : ""));
  }
  if (stallInReach) return setPrompt(coveStallPrompt(stallInReach, signedIn));
  if (seatInReach) return setPrompt(SEAT_PROMPT);
  if (nearbyVisitor) return setPrompt(`Press E to wave at ${nearbyVisitor.displayName}`);
  if (atWater) {
    if (baitCount(angler, baitId) <= 0) return setPrompt("Out of bait — press Q to switch, or visit Bait & Tackle");
    return setPrompt(`Hold Space to cast · ${baitTitle(baitId)} on the hook${preview ? " · practice; catches are not saved" : signedIn ? "" : " · practice (sign in to keep your catch)"}`);
  }
  setPrompt("");
}

function voyage(method: "ferry" | "boat"): void {
  const params = new URLSearchParams({ from: method, at: "dock" });
  // A sea crossing ends a visit to a particular farm; destination residents have their own entrances.
  leaving = true; keys.clear(); document.exitPointerLock?.(); presence.disconnect();
  location.href = publicRegionUrl("harbor", island ? "mainland" : "orchard-isle", params);
}
async function enterIslandFarm(): Promise<void> {
  if (leaving) return;
  // A resident's return entrance retains the public visit instead of selecting the visitor's farm.
  if (fromFarm && destinationQuery.get("property") === ISLAND_PROPERTY) {
    location.href = `../index.html?id=${encodeURIComponent(fromFarm)}&property=${ISLAND_PROPERTY}&from=orchard-harbor`; return;
  }
  if (!signedIn) { notice("Sign in and visit the Property Office in Orchard Market to buy an island homestead.", 5); return; }
  leaving = true; keys.clear();
  try {
    const latest = await createLayoutStore(FARM_LAYOUT_SPEC).load();
    if (latest.source !== "account") throw Error("unavailable");
    const result = latest.layout.lot === ISLAND_PROPERTY ? { ok: true }
      : await api.saveGameGarage("farm", { selectProperty: ISLAND_PROPERTY, propertyRevision: latest.layout.propertyRevision ?? 0 });
    if (!result?.ok) {
      notice(result?.error === "trade_in_progress" ? "Finish your trade before entering another farm." : "Visit the Property Office in Orchard Market to buy or select your island homestead.", 5);
      leaving = false; return;
    }
    document.exitPointerLock?.(); presence.disconnect();
    location.href = "../index.html?from=orchard-harbor";
  } catch { leaving = false; notice("Your farm records could not be reached. Try the entrance again.", 4); }
}
function useHarborPlace(): boolean {
  if (!harbor || !entered || leaving || fishing.busy() || panelOpen()) return false;
  if (aboard) { if (boatState.z < -73) { voyage("boat"); return true; } return false; }
  if (!island) {
    if (Math.hypot(player.x + 6, player.z - 25) < 2.8) { voyage("ferry"); return true; }
    return false;
  }
  const place = islandPlaceInReach(player);
  if (place === "ferry") voyage("ferry");
  else if (place === "market") followTrail("orchard-market");
  else if (place === "farm") void enterIslandFarm();
  else if (place === "residents") { keys.clear(); residents.open(); }
  return Boolean(place);
}
function interact(): void {
  if (useHarborPlace()) return;
  if (boardOrDisembark()) return;
  if (!doorInReach && (away.mounted() || away.action(player)?.kind === "mount")) {
    const wasMounted = away.mounted();
    const spot = away.act(player);
    if (spot) {
      player.x = spot.x;
      player.z = spot.z;
      if (!wasMounted) player.pitch = -0.32;
      keys.clear();
      if (wasMounted) notice(`${away.horseName()} is tied up. Walk back to the rail and press E to ride again.`, 4);
    }
    return;
  }
  if (body.mode === "seated") {
    const step = standUp(player, body);
    Object.assign(player, step.pose);
    body = step.body;
    return;
  }
  if (doorInReach) {
    const leaves = world.doorsFor(doorInReach.doorId);
    if (!leaves) return;
    const open = !leaves.isOpen();
    leaves.setOpen(open);
    if (open) openDoors.add(doorInReach.doorId);
    else openDoors.delete(doorInReach.doorId);
    obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls, ...water];
    return;
  }
  if (stallInReach) return workStall(stallInReach);
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

function updatePlayer(dt: number): void {
  if (!entered || leaving || panelOpen() || fishing.busy()) return;
  if (harbor) {
    if (aboard) {
      const next = stepBoat(boatState, { throttle: Number(keys.has("KeyW") || keys.has("ArrowUp")) - Number(keys.has("KeyS") || keys.has("ArrowDown")), turn: Number(keys.has("KeyA") || keys.has("ArrowLeft")) - Number(keys.has("KeyD") || keys.has("ArrowRight")), brake: keys.has("ShiftLeft") || keys.has("ShiftRight") }, dt);
      boatState = next.state; player.x = boatState.x; player.z = boatState.z;
      if (boatState.mode === "sailing") player.yaw = boatState.yaw;
    } else {
      Object.assign(player, stepHarborWalker(player, keys, dt, island).pose);
      body = { ...body, y: harborWalkHeight(player) ?? body.y };
    }
    return;
  }
  if (away.mounted()) {
    away.step(dt, keys);
    const ride = away.state();
    if (ride) {
      player.x = ride.x;
      player.z = ride.z;
    }
    return;
  }
  const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms: docks, ladders: [] });
  if (!step.moved) return;
  player.x = step.pose.x;
  player.z = step.pose.z;
  body = step.body;
}

function trailDestination(): string | null {
  if (harbor) return !aboard && Math.abs(player.x - HARBOR_COVE_EXIT.x) < 2.3 && player.z > HARBOR_COVE_EXIT.z - 1 ? island ? "orchard-market" : "cove" : null;
  if (region) return Math.abs(player.x - region.exit.x) < 2.2 && Math.abs(player.z - region.exit.z) < 2.6 ? region.requiredProperty ? "farm" : "cove" : null;
  if (player.x > 18.6 && player.z > 16 && player.z < 18.5) return "harbor";
  if (Math.abs(player.z - 9.5) > 2.1) return null;
  if (player.x < -18.6) return "grotto";
  if (player.x > 18.6) return "volcanic";
  return null;
}

function followTrail(destination: string): void {
  leaving = true; keys.clear(); document.exitPointerLock?.(); presence.disconnect();
  const horse = harbor ? destinationQuery.get("horse") ?? "" : away.mounted() ? away.horseId() : "";
  const params = new URLSearchParams(horseTravelQuery(fromFarm, horse));
  if (destination === "orchard-market") {
    params.set("from", "harbor"); location.href = publicRegionUrl("market", "orchard-isle", params); return;
  }
  if (destination === "harbor") { params.set("from", "cove"); location.href = `../harbor/index.html?${params}`; return; }
  if (harbor && destination === "cove") { params.set("from", "harbor"); location.href = `../cove/index.html?${params}`; return; }
  if (destination === "farm") {
    if (preview) { location.href = backLink.href; return; }
    params.delete("farm"); if (fromFarm) params.set("id", fromFarm); params.set("from", region!.id);
    location.href = `../index.html?${params}`; return;
  }
  if (destination === "cove") params.set("from", region!.id);
  else params.set("area", destination);
  location.href = `index.html?${params}`;
}

function checkGateway(): void {
  if (!entered || leaving || body.mode !== "walking") return;
  if (fishing.busy() || panelOpen()) return;
  const destination = trailDestination();
  if (destination) { followTrail(destination); return; }
  if (region || harbor || !gatewayAt(layout.decor, openDoors, player, COVE_BOUNDS)) return;
  leaving = true;
  keys.clear();
  document.exitPointerLock?.();
  const horse = away.mounted() ? away.horseId() : "";
  const words = horse ? "Riding back up the path to the Market Square…" : "Back up the path to the Market Square…";
  setPrompt(words);
  status.textContent = words;
  presence.disconnect();
  location.href = `../market/index.html?from=cove&${horseTravelQuery(fromFarm, horse)}`.replace(/&$/, "");
}

function fishingPose() {
  return { x: player.x, z: player.z, forward: forwardOf(player.yaw) };
}

function steerFromKeys(): void {
  const left = keys.has("KeyA") || keys.has("ArrowLeft");
  const right = keys.has("KeyD") || keys.has("ArrowRight");
  fishing.steer(left === right ? 0 : left ? -1 : 1);
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && fishing.busy() && !panelOpen()) {
    event.preventDefault(); fishing.cancel(); keys.clear(); return;
  }
  // I and K toggle (and switch) their sheets, Escape closes the top one, ? the controls card (farm-hud.mts).
  if (farmHud.handleKey(event)) {
    keys.clear();
    return;
  }
  if (harbor && aboard && entered && event.code === "KeyF" && !event.repeat && !fishing.busy() && !panelOpen() && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault(); changeBoatAnchor(); return;
  }
  if (entered && !event.repeat && (event.code === "KeyC" || event.code === "KeyF") && !fishing.busy() && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    keys.clear();
    toggleCreel(event.code === "KeyC" ? "creel" : "dex");
    return;
  }
  if (panelOpen()) {
    keys.clear();
    return;
  }
  if (entered && !fishing.busy() && chatView.handleKey(event)) {
    keys.clear();
    return;
  }
  if (!entered) return;
  if (event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    const phase = fishing.state().phase;
    if (phase === "idle" && !atWater) return;
    if (phase === "idle" && baitCount(angler, baitId) <= 0) {
      notice("Out of bait — press Q to switch, or visit Bait & Tackle.");
      return;
    }
    if (phase === "reveal") hud.hideCatch();
    if (body.mode === "seated" && phase === "idle" && !atWater) return;
    fishing.primary(true, fishingPose());
    return;
  }
  if (fishing.busy()) {
    if (event.code === "KeyE") {
      event.preventDefault();
      if (!event.repeat) fishing.net();
      return;
    }
    keys.add(event.code);
    if (event.code === "Escape") fishing.cancel();
    if (event.code === "KeyW" || event.code === "ArrowUp") fishing.bow();
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
  if (event.repeat) return;
  if (event.code === "KeyM") {
    music.setMuted(!music.isMuted());
    renderMusicButton();
  } else if (event.code === "KeyE") {
    event.preventDefault();
    interact();
  } else if (event.code === "KeyQ") {
    baitId = nextBait(angler, baitId);
    saveEquipment();
    renderTackleBar();
    notice(`${baitTitle(baitId)} on the hook.`, 1.5);
  } else if (event.code === "KeyR") {
    rodId = nextRod(angler, rodId).id;
    saveEquipment();
    fishingView.setRod(rodId);
    renderTackleBar();
    notice(`${findFishingRod(rodId)?.title ?? "Rod"} in hand.`, 1.5);
  }
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "Space" && entered) fishing.primary(false, fishingPose());
  if (fishing.busy()) steerFromKeys();
});
window.addEventListener("blur", () => {
  keys.clear();
  fishing.steer(0);
  if (fishing.state().phase === "fighting") fishing.primary(false, fishingPose());
});

canvas.addEventListener("click", () => {
  if (entered && !panelOpen()) canvas.requestPointerLock?.()?.catch?.(() => undefined);
});
enterButton.addEventListener("click", () => {
  if (!entered && !harbor) player.x += spawnOffsetForCompany({ x: player.x, z: player.z }, presence.members());
  entered = true;
  music.start();
  startGate.classList.add("is-hidden");
  canvas.focus();
  status.textContent = "WASD to move · Drag to look · Click the shore to capture the mouse";
});
document.addEventListener("pointerlockchange", () => {
  startGate.classList.toggle("is-hidden", entered);
});
canvas.addEventListener("pointerdown", () => { draggingLook = true; });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
  if (panelOpen()) return;
  if (away.mounted()) return;
  if (document.pointerLockElement !== canvas && !draggingLook) return;
  // While a fish is on, the view stays on the line.
  const phase = fishing.state().phase;
  if (phase === "fighting" || phase === "netting" || phase === "reveal") return;
  const looked = lookWalker(player, event.movementX, event.movementY);
  player.yaw = looked.yaw;
  player.pitch = looked.pitch;
});
window.addEventListener("pagehide", () => music.destroy(), { once: true });

function resize(): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * renderer.getPixelRatio()) || canvas.height !== Math.round(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
  }
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function publishPresence(): void {
  if (preview) return;
  const snapshot = fishing.state();
  const phase = snapshot.phase;
  const rod = presenceRodFor(phase, snapshot.landing, rodId);
  presence.publishPose({
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    moving: keys.size > 0 && body.mode === "walking" && !fishing.busy(),
    ...(away.presenceMount() ? { mount: away.presenceMount()! } : {}),
    ...(rod ? { rod } : {}),
    activity: ACTIVITY[phase] ?? (fishmongerPanel.isOpen() ? "at the Fishmonger" : tacklePanel.isOpen() ? "at Bait & Tackle" : recordsPanel.isOpen() ? "reading the Cove Records" : ""),
  });
}

publishPresence();
if (!preview) presence.connect();
void loadShadows();
repaintPanels();
void loadAngler();

const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
let seconds = 0;
function frame(now: number): void {
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
  if (snapshot.shadowId && snapshot.phase !== "waiting" && snapshot.phase !== "flight") hidden.add(snapshot.shadowId);
  shadowsView.hide(hidden);
  shadowsView.lure(snapshot.interestedShadowId ?? (snapshot.phase === "waiting" ? snapshot.shadowId : null), snapshot.landing ?? undefined);
  shadowsView.update(Date.now(), frameSeconds);
  fishingView.setRodVisible(atWater && !panelOpen());
  fishingView.update(snapshot, frameSeconds, seconds);
  hud.render(snapshot);
  refreshBoatControls();
  world.update(frameSeconds);
  terrain.update(frameSeconds, seconds);
  keepers.update(frameSeconds, now, keeperMembers);
  visitors.update(frameSeconds, now, presence.members());
  riderClock += frameSeconds;
  const placements = visitors.placements();
  away.draw(frameSeconds, riderClock, placements);
  anglersView.update(frameSeconds, seconds, placements);
  chatView.tick();
  applyCamera();
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Read-only handle for headless verification. Nothing in the page uses it.
(globalThis as any).__cove = Object.freeze({
  pose: () => ({ ...player, y: body.y }),
  mounted: () => away.mounted(),
  fishing: () => fishing.state(),
  angler: () => angler,
  accountLoaded: () => accountLoaded,
  aboard: () => aboard,
  boat: () => ({ ...boatState }),
  atWater: () => atWater,
  shadows: () => shadows,
  stallInReach: () => stallInReach?.id ?? "",
  doorInReach: () => doorInReach?.doorId ?? "",
  zoneMinLevel: ZONE_MIN_LEVEL,
});

applyCamera();
if (harbor) enterButton.disabled = false;
requestAnimationFrame(frame);
if (harborWorld) window.addEventListener("pagehide", () => harborWorld.dispose(), { once: true });
