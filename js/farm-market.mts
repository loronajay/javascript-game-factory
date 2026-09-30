// The Market Square page: the shared square at the end of the farm's road.
//
// It is the farm's stack by import. The square's paving, walls, well, lamps and
// dressing are farm decor rows (farm-market-square.mts), so the farm's world
// draws them (`createFarmWorld`), the farm's scene rules make them solid and
// sittable, and the farm's body walks them. The stalls and their keepers are
// the square's own (farm-market-props.mts; keepers are arcade avatars driven
// through the room's visitor bodies). Everyone here shares one presence room on
// the arcade-room bridge, with its chat, so the square is a place people meet.
//
// Trading between players is the same (farm-market-trading.mts): T on a person
// in reach invites them, and the table the two of them build is the server's
// (`/games/farm/trades`), which moves the goods between the farms only when
// both have locked the same offers and both have confirmed. The Exchange
// Board is the other way goods change hands: listings for tickets, held in
// escrow by the server (`/games/farm/market/listings`), priced inside a band
// round the goods' worth, with the Market keeping a tenth of every sale.
//
// Money is never decided here. The day's prices are the server's
// (`GET /games/farm/market/prices`, farm-market-day.mts): the Produce Merchant
// pays them and the Seed Merchant marks three seeds down, and a sale or a
// special-price purchase names the day it was shown, so a day that turned over
// at the counter is refused and re-read rather than paid at a surprise price.
// The Produce Merchant's panel names crops (by grade) and
// counts, the Kitchen's names dishes, the Sawmill's logs to saw and furniture
// to sell (farm-market-sawmill.mts); the server prices the sale, takes the
// goods and pays the tickets in one transaction (`POST /games/farm/market/sales`),
// and the page shows what it answers. The Order Board is the same: the server writes the day's orders
// (`GET /games/farm/market/orders`), the panel names one to fill, and the
// server checks the basket and the Farming level, pays and grants the XP.
// Nothing on this page is saved: the square is a constant.

import * as THREE_VENDOR from "./vendor/three.module.js";
import { createLayoutStore, createRoomLayoutStore } from "./arcade-room-store.mjs";
import { forwardOf, lookWalker } from "./arcade-room-walker.mjs";
import { spawnOffsetForCompany } from "./arcade-room-interaction.mjs";
import { createRoomPresence, type RemoteMember } from "./arcade-room-presence.mjs";
import { createRoomVisitors } from "./arcade-room-visitors.mjs";
import { createRoomChat } from "./arcade-room-chat.mjs";
import { createRoomChatView } from "./arcade-room-chat-view.mjs";
import { createFarmWorld } from "./farm-world.mjs";
import { EYE_HEIGHT, doorRows, farmObstacles, farmSeats, nearestDoor, type DoorRow } from "./farm-scene.mjs";
import { createFarmBody, eyeHeight, isMoveKey, sitOn, standUp, stepFarmBody, type FarmBody } from "./farm-body.mjs";
import { SEATED_PROMPT, SEAT_PROMPT, canWorkDoor, findSeatInReach, getDoorPrompt, type SeatInReach } from "./farm-interaction.mjs";
import { FARM_LAYOUT_SPEC, normalizeFarmLayout } from "./farm-layout.mjs";
import { gatewayAt } from "./farm-gateway.mjs";
import {
  MARKET_BOUNDS,
  MARKET_HOME_GATE,
  MARKET_COVE_GATE,
  MARKET_COVE_SPAWN,
  MARKET_PAVING,
  MARKET_PRESENCE_ROOM,
  MARKET_SPAWN,
  KITCHEN_STALL_ID,
  MARKET_STALLS,
  ORDER_BOARD_ID,
  PRODUCE_STALL_ID,
  SAWMILL_STALL_ID,
  SEED_STALL_ID,
  LIVESTOCK_STALL_ID,
  BUTCHER_STALL_ID,
  EXCHANGE_BOARD_ID,
  findMarketStall,
  findStallInReach,
  keeperPose,
  stallLocalToWorld,
  marketSquareLayout,
  stallObstacles,
  stallPrompt,
  MARKET_DOWNS_GATE,
  MARKET_DOWNS_SPAWN,
  MARKET_RAIL_IDS,
  type MarketStall,
} from "./farm-market-square.mjs";
import { createMarketStallModel } from "./farm-market-props.mjs";
import { createMarketSalePanel, type SaleOutcome } from "./farm-market-panel.mjs";
import { createSeedMerchantPanel, type SeedPurchaseOutcome } from "./farm-seed-merchant-panel.mjs";
import { createLivestockDealerPanel, type LivestockPurchaseOutcome } from "./farm-livestock-dealer-panel.mjs";
import { createMarketButcher } from "./farm-market-butcher.mjs";
import { freeHorseStalls, herdHomes, livestockHomes } from "./farm-livestock-housing.mjs";
import { createHorsePaddock, horseLineTitle, type HorsePurchaseOutcome } from "./farm-horse-paddock.mjs";
import { horseStockLine } from "./farm-horse-stock.mjs";
import { MAX_PETS } from "./farm-layout.mjs";
import { livestockKind, normalizeLivestockAnimal, normalizeLivestockHerd, type LivestockAnimal } from "./farm-livestock.mjs";
import { findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { createAvatarThumbnails } from "./arcade-room-avatar-thumbnails.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
import { createAwayRiding } from "./farm-riding-away.mjs";
import { cosmeticRideProfile } from "./farm-ride-profile.mjs";
import { getRidingPrompt } from "./farm-interaction.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";
import { bodyObstacles, obstaclesForSpan } from "./farm-body.mjs";
import { horseTravelQuery, ridingHorseFrom } from "./farm-riding-travel.mjs";
import { riderReach } from "./farm-ride.mjs";
import { assetUrlFor, petClips } from "./farm-pet-bodies.mjs";
import { livestockAssetUrl, livestockClips } from "./farm-livestock-bodies.mjs";
import { dayPrice, normalizeMarketDay, trendNote, turnoverNote, type MarketDay } from "./farm-market-day.mjs";
import { createCropThumbnails } from "./farm-crop-thumbnails.mjs";
import { createExchangePanel, type ExchangeOutcome } from "./farm-exchange-panel.mjs";
import { LISTING_MESSAGES, listingStandingValue, normalizeListingBoard } from "./farm-listings.mjs";
import { stockEntries, tradeAnimalOf } from "./farm-trade.mjs";
import { findCrop } from "./farm-crops.mjs";
import { createOrderBoardPanel, type OrderFillOutcome } from "./farm-orders-panel.mjs";
import { createMarketSawmill } from "./farm-market-sawmill.mjs";
import { createMarketTrading } from "./farm-market-trading.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { SKILL_TITLES, normalizeOrderBoard, normalizeRaisedGoods, type FarmOrderBoard } from "./farm-orders.mjs";
import { SELLABLE_DISHES } from "./farm-market-prices.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";
import { barterPurchasePrice, barterSalePrice } from "./farm-bartering.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { createFarmItemThumbnails } from "./farm-item-thumbnails.mjs";
import { createFishPortraits } from "./farm-fish-portraits.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { FEED_STOCK, INGREDIENT_STOCK, LIVESTOCK_GOODS_STOCK, MEAT_STOCK, RECIPE_STOCK, type FeedStockLine, type IngredientStockLine, type RecipeStockLine } from "./farm-vendor-stock.mjs";
import { createVendorShelf } from "./farm-vendor-shelf.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createFarmInventorySummary } from "./farm-inventory-summary.mjs";
import { createFarmStatsPanel } from "./farm-stats-panel.mjs";
import { createFarmHud, wireSheetTabs } from "./farm-hud.mjs";
import { normalizeAngler, type Angler } from "./farm-angler.mjs";
import { resolveFarmSceneTime } from "./farm-time.mjs";

const THREE: Record<string, any> = THREE_VENDOR;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Market Square is missing ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#marketCanvas");
const prompt = requiredElement<HTMLElement>("#marketPrompt");
const startGate = requiredElement<HTMLElement>("#startGate");
const enterButton = requiredElement<HTMLButtonElement>("#enterMarket");
const status = requiredElement<HTMLElement>("#marketStatus");
const homeLink = requiredElement<HTMLAnchorElement>("#marketHomeLink");
const ticketChip = requiredElement<HTMLElement>("#marketTickets");
const musicButton = requiredElement<HTMLButtonElement>("#toggleMarketMusic");
const visitorsChip = requiredElement<HTMLElement>("#marketVisitors");
const visitorsChipLabel = requiredElement<HTMLElement>("#marketVisitorsLabel");
const visitorsChipNames = requiredElement<HTMLElement>("#marketVisitorsNames");

// The HUD layer (farm-hud.mts): the counters below register with it; it owns the mouse, Escape and the toast.
const hud = createFarmHud({
  canvas,
  canRelock: () => entered && !leaving,
  controls: requiredElement<HTMLElement>("#controlHint"),
});
hud.fullscreen.bind(requiredElement<HTMLButtonElement>("#fullscreenMarket"));

// The road home: back to whichever farm the player walked out of.
const fromFarm = new URLSearchParams(location.search).get("farm") ?? "";
const homeUrl = fromFarm ? `../index.html?id=${encodeURIComponent(fromFarm)}` : "../index.html";
// Down the north gate to the Cove, carrying the farm to come home to.
const coveUrl = fromFarm ? `../cove/index.html?farm=${encodeURIComponent(fromFarm)}` : "../cove/index.html";
const cameFromCove = new URLSearchParams(location.search).get("from") === "cove";
const cameFromDowns = new URLSearchParams(location.search).get("from") === "downs";
// Out the west gate to Windrush Downs — on horseback only (FARM_RIDING_PLAN.md).
const downsUrl = (horseId: string): string => `../downs/index.html?${horseTravelQuery(fromFarm, horseId)}`;
homeLink.href = homeUrl;
if (fromFarm) homeLink.querySelector(".back-link__words")!.textContent = "Their farm";

// What the player has to sell is on THEIR farm document (visiting someone else's
// farm does not change whose basket this is). Read once; the server's answer to
// every sale replaces it.
const farmStore = createLayoutStore(FARM_LAYOUT_SPEC);
const farmLoad = await farmStore.load();
const canSell = farmStore.accountBacked && farmLoad.source === "account";
let produce: Readonly<Record<string, number>> = farmLoad.layout.agriculture.inventory.produce;
let dishes: Readonly<Record<string, number>> = farmLoad.layout.agriculture.inventory.dishes;
let seeds: Readonly<Record<string, number>> = farmLoad.layout.agriculture.inventory.seeds;
/** The whole farm as the server last answered: the Sawmill reads its logs, planks and furniture shelf from it. */
let farm = farmLoad.layout;
let farmFishing: Angler | null = null;
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
  beforeOpen: () => inventorySummary.close(),
  onClose: () => canvas.focus(),
});
const farmPanelsApi = createPlatformApiClient();
function renderPersonalPanels(): void {
  inventorySummary.render(farm, farmFishing);
  statsPanel.render(farm.skills, farmFishing);
}
async function refreshFarmFishing(): Promise<void> {
  if (!farmStore.accountBacked) return;
  const next = normalizeAngler(await farmPanelsApi.fetchFarmFishing().catch(() => null));
  if (next) farmFishing = next;
  renderPersonalPanels();
}
renderPersonalPanels();
requiredElement<HTMLButtonElement>("#openInventory").addEventListener("click", () => {
  statsPanel.close();
  void refreshFarmFishing();
});
requiredElement<HTMLButtonElement>("#openStats").addEventListener("click", () => { void refreshFarmFishing(); });
void refreshFarmFishing();
/** Take the basket and pantry from a farm the server answered with. */
function takeStock(layoutValue: unknown): ReturnType<typeof normalizeFarmLayout> | null {
  if (!layoutValue) return null;
  const next = normalizeFarmLayout(layoutValue);
  farm = next;
  produce = next.agriculture.inventory.produce;
  dishes = next.agriculture.inventory.dishes;
  seeds = next.agriculture.inventory.seeds;
  renderPersonalPanels();
  salePanel?.repaint?.();
  ingredientShelf?.render?.();
  recipeShelf?.render?.();
  return next;
}
const barteringLevel = (): number => farmingLevelForXp(farm.skills.bartering.xp);
const ticketClient = createTicketWalletClient();

// ---------------------------------------------------------------- the market's day

/** Today's prices and specials, as the server last said. Until they arrive the counters show standing prices. */
let market: MarketDay | null = null;
async function loadMarketDay(): Promise<MarketDay | null> {
  const next = normalizeMarketDay(await ticketClient.getFarmMarketPrices().catch(() => null));
  if (next) market = next;
  salePanel.repaint();
  seedPanel.repaint();
  return market;
}
/** The day turns over at UTC midnight for everyone at once: read it again just after. */
function scheduleTurnover(): void {
  const wait = market ? Math.max(1_000, market.endsAt - Date.now() + 2_000) : 60_000;
  setTimeout(() => { void loadMarketDay().finally(scheduleTurnover); }, Math.min(wait, 2 ** 31 - 1));
}

let balance: number | null = null;
function renderTickets(): void {
  ticketChip.hidden = balance === null;
  ticketChip.querySelector("strong")!.textContent = formatTicketBalance(balance);
}
if (farmStore.accountBacked) {
  void ticketClient.getWallet().then((wallet: any) => {
    if (Number.isSafeInteger(wallet?.balance)) balance = wallet.balance;
    renderTickets();
  }).catch(() => undefined);
}
renderTickets();

const music = createFarmMusic();
function renderMusicButton(): void {
  const muted = music.isMuted();
  musicButton.setAttribute("aria-pressed", String(muted));
  musicButton.title = muted ? "Music off — play it (M)" : "Music on — mute it (M)";
}
musicButton.addEventListener("click", () => { music.setMuted(!music.isMuted()); renderMusicButton(); });
renderMusicButton();

let renderer: any;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
  status.textContent = "The Market Square needs WebGL to render.";
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
const layout = marketSquareLayout();
const world = createFarmWorld(THREE, scene, { groundCover: false });
world.applyGroundStyle(MARKET_PAVING);
world.sync(layout);
// The shared square has no canonical sky: each client sees the minute on their
// own paused farm clock. `?time=<minute>` remains the farm page's visual-QA seam.
world.setTime(resolveFarmSceneTime(farm.clock.farmMinutes, new URLSearchParams(location.search).get("time")));
for (const stall of MARKET_STALLS) scene.add(createMarketStallModel(THREE, stall));

// The keepers stand behind their counters: arcade avatars on the room's visitor
// bodies, so they breathe, wear a name tag and can speak in a bubble.
const keepers = createRoomVisitors(THREE, scene);
const keeperMembers: readonly RemoteMember[] = MARKET_STALLS.filter((stall) => stall.keeper).map((stall) => {
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

const arrival = cameFromCove ? MARKET_COVE_SPAWN : cameFromDowns ? MARKET_DOWNS_SPAWN : MARKET_SPAWN;
const player = { x: arrival.x, z: arrival.z, yaw: arrival.yaw, pitch: -0.03 };
// `?at=<stall id>` stands the player at that counter, facing it — a QA seam like `?time=`.
const startStall = findMarketStall(new URLSearchParams(location.search).get("at") ?? "");
if (startStall) {
  const spot = stallLocalToWorld(startStall, { x: 0, z: startStall.footprint.depth / 2 + 1 });
  Object.assign(player, { x: spot.x, z: spot.z, yaw: Math.atan2(-(startStall.x - spot.x), -(startStall.z - spot.z)) });
}
let body: FarmBody = createFarmBody();
const walkerBounds = { halfWidth: MARKET_BOUNDS.width / 2, halfDepth: MARKET_BOUNDS.depth / 2, margin: MARKET_BOUNDS.wallInset };
const openDoors = new Set<string>();
const solidStalls = stallObstacles();
let obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls];
const seats = farmSeats(layout);
const doors = doorRows(layout);
// A rider who came on horseback rides on here (cosmetic riding: their own pace), and ties up at a rail to walk.
const away = createAwayRiding(THREE, scene, {
  horse: ridingHorseFrom(farm, new URLSearchParams(location.search).get("horse")),
  mode: "cosmetic",
  profile: () => cosmeticRideProfile(),
  world: () => ({ bounds: walkerBounds, solids: obstaclesForSpan(obstacles, 0.3, 2.4) }),
  canStand: (point) => !bodyObstacles(obstacles, 0).some((solid) => obstacleBlocks(point, solid)),
  rails: layout.decor.filter((row) => MARKET_RAIL_IDS.includes(row.instanceId)),
  canTie: true,
});
if (away.hasHorse() && away.arrive({ x: arrival.x, z: arrival.z, heading: arrival.yaw })) player.pitch = -0.32;
let riderClock = 0;
const keys = new Set<string>();
let entered = false;
let leaving = false;
let draggingLook = false;
let doorInReach: DoorRow | null = null;
let seatInReach: SeatInReach | null = null;
let stallInReach: MarketStall | null = null;
let nearbyVisitor: RemoteMember | null = null;

function applyCamera(): void {
  if (away.mounted()) {
    const eye = away.eye(riderClock);
    camera.position.set(eye.x, eye.y, eye.z);
  } else {
    camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
  }
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function setPrompt(text: string): void {
  hud.setPrompt(prompt, text);
}

/** What just happened (a shut stall, a wave, a trade note): the HUD's toast, above the prompt, which stays live. */
function notice(text: string, seconds = 6): void {
  hud.toast(text, seconds);
}

// ---------------------------------------------------------------- the others in the square

const visitors = createRoomVisitors(THREE, scene, { mountSeat: (mount) => away.seatFor(mount) });
const factoryProfile = loadFactoryProfile();
const presenceName = factoryProfile.profileName || "Player";
const presence = createRoomPresence({
  roomId: MARKET_PRESENCE_ROOM,
  identity: { playerId: factoryProfile.playerId, displayName: presenceName, avatarId: "" },
});
// The body the player wears here is the one they wear in their arcade.
void createRoomLayoutStore().loadSelfAvatarId().then((avatarId) => {
  presence.setIdentity({ playerId: factoryProfile.playerId, displayName: presenceName, avatarId });
}).catch(() => undefined);

function renderVisitorsChip(): void {
  const members = presence.members();
  const state = presence.status();
  visitorsChip.hidden = !(state === "full" || members.length > 0);
  if (state === "full") {
    visitorsChipLabel.textContent = "SQUARE FULL";
    visitorsChipNames.textContent = "Too many people are in the square right now.";
    return;
  }
  visitorsChipLabel.textContent = `IN THE SQUARE · ${members.length}`;
  visitorsChipNames.textContent = members.map((member) => member.displayName).join(", ");
}

const chat = createRoomChat({ send: (text) => presence.sendChat(text), selfName: presenceName });
const chatView = createRoomChatView({
  chat,
  root: requiredElement<HTMLElement>("#marketChat"),
  log: requiredElement<HTMLElement>("#marketChatLog"),
  input: requiredElement<HTMLInputElement>("#marketChatInput"),
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

function publishPresence(): void {
  presence.publishPose({
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    moving: keys.size > 0 && body.mode === "walking",
    ...(away.presenceMount() ? { mount: away.presenceMount()! } : {}),
    activity: trading.activity() || (salePanel.isOpen() ? "at the Produce Merchant" : seedPanel.isOpen() ? "buying seeds" : dealerPanel.isOpen() ? "at the Livestock Dealer" : butcherCounter.isOpen() ? "at the Butcher" : exchangePanel.isOpen() ? "at the Exchange Board" : kitchenPanel.isOpen() ? "at the Kitchen" : ordersPanel.isOpen() ? "reading the Order Board" : sawmill.activity()),
  });
}

// ---------------------------------------------------------------- the Produce Merchant and the Kitchen

// Every line on every counter and notice is the item itself: its model, rendered offscreen.
const itemThumbnails = createFarmItemThumbnails(THREE);
const saleMessages: Readonly<Record<string, string>> = Object.freeze({
  not_enough_produce: "Your basket was not what the merchant was shown, so she counted again. Nothing was sold.",
  not_enough_dishes: "Your pantry was not what Basil was shown, so he counted again. Nothing was sold.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
  invalid_sale: "That sale did not add up. Nothing was sold.",
});

/** One counter's sale: the server prices it, takes the goods and pays; the counter shows what it answered. */
async function sellAt(stallId: string, items: Record<string, number>): Promise<SaleOutcome> {
  const saleId = `sale-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await ticketClient.sellFarmProduce(items, saleId, market?.day);
  takeStock(result?.layout);
  const stock = stallId === KITCHEN_STALL_ID ? dishes : produce;
  if (result?.error === "prices_changed") {
    await loadMarketDay();
    return { ok: false, message: "The day turned over while you were at the counter, and the prices with it. Check the new prices — nothing was sold.", produce: stock };
  }
  if (!result?.ok) {
    return { ok: false, message: saleMessages[result?.error] ?? "The sale did not go through. Nothing was sold — try again in a moment.", produce: stock };
  }
  takeBalance(result.balance);
  keeperSays(findMarketStall(stallId)!, stallId === KITCHEN_STALL_ID ? "I'll have these on the menu by supper." : "Pleasure doing business!");
  const earned = Number(result.earned) || 0;
  return { ok: true, message: `Sold for ${earned.toLocaleString()} tickets. Your balance is ${formatTicketBalance(balance)}.`, produce: stock };
}

const saleTurnover = requiredElement<HTMLElement>("#saleTurnover");
const salePanel = createMarketSalePanel({
  root: requiredElement<HTMLElement>("#salePanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeSale"),
  list: requiredElement<HTMLElement>("#saleList"),
  total: requiredElement<HTMLElement>("#saleTotal"),
  sellButton: requiredElement<HTMLButtonElement>("#sellProduce"),
  pickAllButton: requiredElement<HTMLButtonElement>("#pickAllProduce"),
  status: requiredElement<HTMLElement>("#saleStatus"),
}, {
  sell: (items) => sellAt(PRODUCE_STALL_ID, items),
  thumbnail: itemThumbnails.get,
  priceOf: (key) => barterSalePrice(dayPrice(market, key), barteringLevel()),
  lineNote: (key) => trendNote(market, key),
  onRender: () => { saleTurnover.textContent = turnoverNote(market, Date.now()); },
  onClose: () => canvas.focus(),
});

const vendorPurchaseMessages: Readonly<Record<string, string>> = Object.freeze({
  insufficient_tickets: "Not enough tickets for that.",
  inventory_full: "That stack is full (99).",
  already_owned: "That recipe is already in your cookbook.",
  prices_changed: "The market day changed while you were choosing. Check the shelf again.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});

async function buyIngredient(line: IngredientStockLine, quantity: number, seller = PRODUCE_STALL_ID): Promise<{ ok: boolean; message: string }> {
  if (!market) await loadMarketDay();
  if (!market) return { ok: false, message: seller === PRODUCE_STALL_ID ? "Marigold is still opening the till. Try again in a moment." : "Otto is still sharpening his knives. Try again in a moment." };
  const purchaseId = `ingredient-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await ticketClient.purchaseFarmSupply(`ingredient.${line.id}`, quantity, purchaseId, { venue: "market", day: market.day });
  takeStock(result?.layout);
  if (!result?.ok) return { ok: false, message: vendorPurchaseMessages[result?.error] ?? "The purchase did not go through. Nothing was bought." };
  takeBalance(result.balance);
  keeperSays(findMarketStall(seller)!, seller === PRODUCE_STALL_ID ? "Straight into your harvest basket." : "Wrapped and in your basket. Cook it well.");
  return { ok: true, message: `Bought ${quantity} ${line.title}${quantity === 1 ? "" : "s"} for ${Number(result.price).toLocaleString()} tickets.` };
}

const ingredientShelf = createVendorShelf({
  list: requiredElement<HTMLElement>("#ingredientShelf"),
  status: requiredElement<HTMLElement>("#ingredientStatus"),
}, {
  stock: [...INGREDIENT_STOCK, ...LIVESTOCK_GOODS_STOCK],
  buy: (line, quantity) => buyIngredient(line as IngredientStockLine, quantity),
  held: (line) => Number(produce[(line as IngredientStockLine).id]) || 0,
  price: (base) => barterPurchasePrice(base, barteringLevel()),
  thumbnail: itemThumbnails.get,
});

// ---------------------------------------------------------------- the Seed Merchant

const cropThumbnails = createCropThumbnails(THREE);
const seedMessages: Readonly<Record<string, string>> = Object.freeze({
  insufficient_tickets: "Not enough tickets for that.",
  inventory_full: "Your seed stack for that crop is full (99).",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});

async function buySeeds(cropId: string, quantity: number): Promise<SeedPurchaseOutcome> {
  if (!market) await loadMarketDay();
  if (!market) return { ok: false, message: "Juniper is still chalking up today's prices. Try again in a moment.", seeds };
  const purchaseId = `seed-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await ticketClient.purchaseFarmSupply(`seed.${cropId}`, quantity, purchaseId, { venue: "market", day: market.day });
  takeStock(result?.layout);
  if (result?.error === "prices_changed") {
    await loadMarketDay();
    return { ok: false, message: "The specials just changed with the day. Check the new board — nothing was bought.", seeds };
  }
  if (!result?.ok) return { ok: false, message: seedMessages[result?.error] ?? "The purchase did not go through. Nothing was bought — try again in a moment.", seeds };
  takeBalance(result.balance);
  keeperSays(findMarketStall(SEED_STALL_ID)!, quantity > 1 ? "A good handful. Plant them soon!" : "One packet. Grow it well.");
  const title = findCrop(cropId)?.title ?? cropId;
  return { ok: true, message: `Bought ${quantity} ${title} seed${quantity === 1 ? "" : "s"} for ${Number(result.price).toLocaleString()} tickets. They are in your farm's Inventory.`, seeds };
}

const seedPanel = createSeedMerchantPanel({
  root: requiredElement<HTMLElement>("#seedPanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeSeeds"),
  list: requiredElement<HTMLElement>("#seedList"),
  turnover: requiredElement<HTMLElement>("#seedTurnover"),
  status: requiredElement<HTMLElement>("#seedStatus"),
}, {
  buy: buySeeds,
  market: () => market,
  price: (base) => barterPurchasePrice(base, barteringLevel()),
  thumbnail: cropThumbnails.get,
  onClose: () => canvas.focus(),
});

// ---------------------------------------------------------------- the Livestock Dealer

/** The player's herd, as the server last said: the Dealer counts the room it leaves. */
let herd: readonly LivestockAnimal[] = [];
const livestockApi = createPlatformApiClient();
async function loadHerd(): Promise<void> {
  if (!canSell || !farmStore.ownerPlayerId) return;
  const answer = await livestockApi.fetchFarmLivestock(farmStore.ownerPlayerId).catch(() => null);
  if (Array.isArray(answer)) herd = normalizeLivestockHerd(answer);
  dealerPanel.repaint();
  butcherCounter.repaint();
  if (dealerPanel.isOpen()) horsePaddock.render();
}
const livestockMessages: Readonly<Record<string, string>> = Object.freeze({
  insufficient_tickets: "Not enough tickets for that one yet.",
  no_room: "There is no room at home. Build a pen, or free a stall, first.",
  home_full: "That home is full.",
  herd_full: "Your farm has as many animals as it can manage.",
  level_too_low: "Hollis won't sell you that one yet — raise your Husbandry by caring for the animals you have.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});
async function buyLivestock(speciesId: string, name: string): Promise<LivestockPurchaseOutcome> {
  const purchaseId = `stock-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await livestockApi.buyFarmLivestock({ purchaseId, speciesId, ...(name ? { name } : {}) }).catch(() => null);
  if (!result?.ok) return { ok: false, message: livestockMessages[result?.error] ?? "The sale did not go through. Nothing was bought — try again in a moment." };
  if (Array.isArray(result.herd)) herd = normalizeLivestockHerd(result.herd);
  takeBalance(result.balance);
  const animal = result.animal ? normalizeLivestockAnimal(result.animal) : null;
  if (!animal) return { ok: true, message: "Bought. It is on its way to your farm." };
  const home = livestockHomes(farm.decor).find((entry) => entry.id === animal.homeId);
  keeperSays(findMarketStall(LIVESTOCK_STALL_ID)!, `${animal.name}'s a good one. Look after ${animal.gender === "male" ? "him" : "her"}.`);
  return {
    ok: true,
    message: `${animal.name} the ${livestockKind(animal, farm.clock.farmMinutes).toLowerCase()} is on the way to ${home?.title ?? "your farm"} — ${Number(result.price).toLocaleString()} tickets. Press L on the farm to see its stats or rename it.`,
  };
}

const horseMessages: Readonly<Record<string, string>> = Object.freeze({
  insufficient_tickets: "Not enough tickets for that horse yet.",
  no_stall: "Every Stable stall at home is taken. Build another Stable, or free a stall, first.",
  farm_full: `Your farm has as many pets as it can keep (${MAX_PETS}).`,
  level_too_low: "Hollis keeps that one for a better rider — raise your Riding at Windrush Downs.",
  already_bought: "You already bought that horse today.",
  stock_changed: "Hollis has brought in new horses since you looked. Take another look.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});
/** One of Hollis's horses: the server rolls it from the day's seed and stables it (the pet lands in the farm document). */
async function buyHorse(day: number, slot: number, name: string): Promise<HorsePurchaseOutcome> {
  const result = await livestockApi.buyFarmHorse({ day, slot, ...(name ? { name } : {}) }).catch(() => null);
  takeStock(result?.layout);
  if (!result?.ok) return { ok: false, bought: result?.error === "already_bought", message: horseMessages[result?.error] ?? "The sale did not go through. Nothing was bought — try again in a moment." };
  takeBalance(result.balance);
  const line = horseStockLine(day, slot);
  const pet = result.pet;
  keeperSays(findMarketStall(LIVESTOCK_STALL_ID)!, `${pet?.name ?? "That one"}'s a fine horse. Ride ${pet?.profile?.gender === "male" ? "him" : "her"} well.`);
  return { ok: true, message: `${pet?.name ?? "Your horse"}${line ? `, the ${horseLineTitle(line).split(" · ")[0]!.toLowerCase()},` : ""} is on the way to your Stable — ${Number(result.price).toLocaleString()} tickets. Press P on the farm to see it, and E beside it to ride.` };
}

/** Hollis's feed: into the farm's supplies at the supply shop's price (a Market purchase names its day, like Marigold's). */
async function buyFeed(line: FeedStockLine, quantity: number): Promise<{ ok: boolean; message: string }> {
  if (!market) await loadMarketDay();
  if (!market) return { ok: false, message: "Hollis is still opening up. Try again in a moment." };
  const purchaseId = `feed-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await ticketClient.purchaseFarmSupply(line.itemId, quantity, purchaseId, { venue: "market", day: market.day });
  takeStock(result?.layout);
  if (!result?.ok) return { ok: false, message: vendorPurchaseMessages[result?.error] ?? "The purchase did not go through. Nothing was bought." };
  takeBalance(result.balance);
  keeperSays(findMarketStall(LIVESTOCK_STALL_ID)!, "I'll send it up to your feed store.");
  return { ok: true, message: `Bought ${quantity} ${line.title} for ${Number(result.price).toLocaleString()} tickets. Feed it from the Herd panel (L) or with G at an animal.` };
}
// The Dealer's cards show the real animal, from the room's offscreen portrait renderer.
const livestockPortraits = createAvatarThumbnails(THREE, {
  resolve: (speciesId) => {
    const species = findLivestockSpecies(speciesId);
    return species ? { assetUrl: livestockAssetUrl(species), poseClip: (gltf) => livestockClips(gltf, species).idle, height: 1.45, lookAtY: 0.7, yaw: species.modelYaw + (species.portraitTurn ?? 0), fitPosed: species.fitPosed } : undefined;
  },
});
// Hollis's horses are pets (FARM_RIDING_PLAN.md): their portraits come from the pets' bodies' asset and clips.
const petPortraits = createAvatarThumbnails(THREE, {
  resolve: (speciesId) => {
    const species = findAnimal(speciesId);
    return species ? { assetUrl: assetUrlFor(species), poseClip: (gltf) => petClips(THREE, gltf, species).idle, height: 1.45, lookAtY: 0.8, yaw: -0.6 } : undefined;
  },
});
const dealerPanel = createLivestockDealerPanel({
  root: requiredElement<HTMLElement>("#dealerPanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeDealer"),
  room: requiredElement<HTMLElement>("#dealerRoom"),
  list: requiredElement<HTMLElement>("#dealerList"),
  status: requiredElement<HTMLElement>("#dealerStatus"),
  name: requiredElement<HTMLInputElement>("#dealerName"),
}, {
  buy: buyLivestock,
  farm: () => ({ homes: herdHomes(farm.decor, farm.pets), herd }),
  husbandryLevel: () => farmingLevelForXp(farm.skills.husbandry.xp),
  thumbnail: livestockPortraits.get,
  onClose: () => canvas.focus(),
});
// Hollis's paddock, under his young stock: today's three horses (FARM_RIDING_PLAN.md).
const horsePaddock = createHorsePaddock({
  list: requiredElement<HTMLElement>("#horseList"),
  room: requiredElement<HTMLElement>("#horseRoom"),
  status: requiredElement<HTMLElement>("#horseStatus"),
  name: requiredElement<HTMLInputElement>("#dealerName"),
}, {
  room: () => ({
    freeStalls: freeHorseStalls(farm.decor, farm.pets, herd).length,
    stalls: livestockHomes(farm.decor).filter((home) => home.kind === "stall").length,
    petRoom: MAX_PETS - farm.pets.length,
  }),
  ridingLevel: () => farmingLevelForXp(farm.skills.riding.xp),
  buy: buyHorse,
  thumbnail: petPortraits.get,
});
// Hollis's feed shelf, under his young stock: hay, pig feed, chicken feed, into the farm's supplies.
const feedShelf = createVendorShelf({
  list: requiredElement<HTMLElement>("#feedShelf"),
  status: requiredElement<HTMLElement>("#feedStatus"),
}, {
  stock: FEED_STOCK,
  buy: (line, quantity) => buyFeed(line as FeedStockLine, quantity),
  held: (line) => Number(farm.agriculture.inventory.supplies[(line as FeedStockLine).feedId]) || 0,
  price: (base) => barterPurchasePrice(base, barteringLevel()),
  thumbnail: itemThumbnails.get,
});
// The Butcher (farm-market-butcher.mts): Otto takes a grown animal from the herd for meat in the basket.
const butcherCounter = createMarketButcher({
  api: livestockApi,
  farm: () => farm,
  herd: () => herd,
  takeHerd: (next) => {
    herd = next;
    dealerPanel.repaint();
  },
  takeStock,
  keeperSays: (text) => keeperSays(findMarketStall(BUTCHER_STALL_ID)!, text),
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
  thumbnail: livestockPortraits.get,
  onClose: () => canvas.focus(),
});
// Otto's meat counter, the Butcher's second tab: Normal-grade cuts into the basket, bought like Marigold's ingredients.
const meatShelf = createVendorShelf({
  list: requiredElement<HTMLElement>("#meatShelf"),
  status: requiredElement<HTMLElement>("#meatStatus"),
}, {
  stock: MEAT_STOCK,
  buy: (line, quantity) => buyIngredient(line as IngredientStockLine, quantity, BUTCHER_STALL_ID),
  held: (line) => Number(produce[(line as IngredientStockLine).id]) || 0,
  price: (base) => barterPurchasePrice(base, barteringLevel()),
  thumbnail: itemThumbnails.get,
});
void loadHerd();

const kitchenPanel = createMarketSalePanel({
  root: requiredElement<HTMLElement>("#kitchenPanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeKitchen"),
  list: requiredElement<HTMLElement>("#kitchenList"),
  total: requiredElement<HTMLElement>("#kitchenTotal"),
  sellButton: requiredElement<HTMLButtonElement>("#sellDishes"),
  pickAllButton: requiredElement<HTMLButtonElement>("#pickAllDishes"),
  status: requiredElement<HTMLElement>("#kitchenStatus"),
}, {
  sell: (items) => sellAt(KITCHEN_STALL_ID, items),
  thumbnail: itemThumbnails.get,
  sellable: SELLABLE_DISHES,
  emptyNote: "Your pantry is empty. Cook something at your farm's Kitchen Range and bring it here.",
  onClose: () => canvas.focus(),
});

async function buyRecipe(line: RecipeStockLine): Promise<{ ok: boolean; message: string }> {
  if (!market) await loadMarketDay();
  if (!market) return { ok: false, message: "Basil is still setting out the recipe cards. Try again in a moment." };
  const purchaseId = `recipe-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const result = await ticketClient.purchaseFarmSupply(`recipe.${line.recipeId}`, 1, purchaseId, { venue: "market", day: market.day });
  takeStock(result?.layout);
  if (!result?.ok) return { ok: false, message: vendorPurchaseMessages[result?.error] ?? "The recipe purchase did not go through. Nothing was bought." };
  takeBalance(result.balance);
  keeperSays(findMarketStall(KITCHEN_STALL_ID)!, "That's yours for good. Try it at your Kitchen Range!");
  return { ok: true, message: `${line.title} was added to your cookbook for ${Number(result.price).toLocaleString()} tickets.` };
}

const recipeShelf = createVendorShelf({
  list: requiredElement<HTMLElement>("#recipeShelf"),
  status: requiredElement<HTMLElement>("#recipeStatus"),
}, {
  stock: RECIPE_STOCK,
  buy: (line) => buyRecipe(line as RecipeStockLine),
  held: (line) => farm.skills.cooking.learned.includes((line as RecipeStockLine).recipeId) ? 1 : 0,
  price: (base) => barterPurchasePrice(base, barteringLevel()),
  thumbnail: itemThumbnails.get,
});

// ---------------------------------------------------------------- the Order Board

const achievementToaster = createAchievementToaster();
const orderMessages: Readonly<Record<string, string>> = Object.freeze({
  not_enough_produce: "Your basket came up short when it was counted. Nothing was delivered.",
  not_enough_dishes: "Your pantry came up short when it was counted. Nothing was delivered.",
  not_enough_fish: "Your creel came up short when it was counted (a locked fish never goes). Nothing was delivered.",
  not_enough_goods: "Your basket came up short of milk or wool when it was counted. Nothing was delivered.",
  goods_not_raised: "The herd's customers only take goods from your own animals — bought or traded milk, eggs and wool don't count. Nothing was delivered.",
  level_too_low: "That order needs a higher level. Nothing was delivered.",
  order_expired: "That notice came down while you were reading it — the board has turned over. Nothing was delivered.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});

function takeBalance(value: unknown): void {
  if (!Number.isSafeInteger(value)) return;
  balance = value as number;
  publishTicketBalance(balance);
  renderTickets();
}

/** The herd goods the farm raised itself, as the board or a fill last said: a herd notice's stock. */
let raisedGoods: Readonly<Record<string, number>> = Object.freeze({});
/** The board as last read: a fish fill answers with the fish it took, and the creel shown is this one less those. */
let lastBoard: FarmOrderBoard | null = null;
async function loadOrderBoard(): Promise<FarmOrderBoard | null> {
  const board = normalizeOrderBoard(await ticketClient.getFarmOrders());
  // The board carries the basket and pantry as the server holds them now: fresher than the page's.
  if (board) {
    produce = board.produce;
    raisedGoods = board.raised;
    dishes = board.dishes;
    lastBoard = board;
  }
  return board;
}

async function fillOrder(orderId: string): Promise<OrderFillOutcome> {
  const result = await ticketClient.fillFarmOrder(orderId);
  const layout = takeStock(result?.layout);
  const fishingLevel = Number(result?.fishing?.level) || lastBoard?.levels.fishing || 1;
  const levels = layout ? {
    farming: farmingLevelForXp(layout.skills.farming.xp), cooking: farmingLevelForXp(layout.skills.cooking.xp), fishing: fishingLevel,
    husbandry: farmingLevelForXp(layout.skills.husbandry.xp),
  } : undefined;
  // A fish order took its fish: the creel the board shows is what is left.
  const used = new Set<string>(Array.isArray(result?.fishUsed) ? result.fishUsed.map((fish: any) => String(fish?.id)) : []);
  const fish = lastBoard ? lastBoard.fish.filter((entry) => !used.has(entry.id)) : undefined;
  if (lastBoard && fish) lastBoard = { ...lastBoard, fish };
  if (layout) raisedGoods = normalizeRaisedGoods(result?.layout?.agriculture?.inventory?.raised);
  const stock = { produce, raised: raisedGoods, dishes, levels, fish };
  if (!result?.ok) {
    return { ok: false, message: orderMessages[result?.error] ?? "The delivery did not go through. Nothing was taken — try again in a moment.", ...stock };
  }
  takeBalance(result.balance);
  if (Array.isArray(result.achievements) && result.achievements.length) achievementToaster.show("farm", "The Farm", result.achievements);
  if (result.duplicate) return { ok: true, message: "That order was already delivered.", ...stock, filled: true };
  const customer = typeof result.order?.customer === "string" ? result.order.customer : "The customer";
  const orderSkill = result.skill === "cooking" || result.skill === "fishing" || result.skill === "husbandry" ? result.skill as "cooking" | "fishing" | "husbandry" : "farming";
  const summary = result[orderSkill];
  const skill = SKILL_TITLES[orderSkill];
  const levelUp = Number(summary?.level) > Number(summary?.levelBefore) ? ` ${skill} level ${summary.level}!` : "";
  return {
    ok: true,
    message: `${customer} paid ${Number(result.earned).toLocaleString()} tickets · +${Number(result.xp).toLocaleString()} ${skill} XP.${levelUp}`,
    ...stock, filled: true,
  };
}

const ordersPanel = createOrderBoardPanel({
  root: requiredElement<HTMLElement>("#ordersPanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeOrders"),
  list: requiredElement<HTMLElement>("#ordersList"),
  level: requiredElement<HTMLElement>("#ordersLevel"),
  turnover: requiredElement<HTMLElement>("#ordersTurnover"),
  status: requiredElement<HTMLElement>("#ordersStatus"),
}, {
  load: loadOrderBoard,
  fill: fillOrder,
  thumbnail: (key, onReady) => portraits(key, onReady),
  onClose: () => canvas.focus(),
});

// The Sawmill (farm-market-sawmill.mts): Bram saws logs for a ticket a log and buys furniture off the shelf.
const sawmill = createMarketSawmill({
  ticketClient,
  farm: () => farm,
  takeStock,
  takeBalance,
  keeperSays: (text) => keeperSays(findMarketStall(SAWMILL_STALL_ID)!, text),
  onAchievements: (achievements) => achievementToaster.show("farm", "The Farm", achievements as any[]),
  thumbnail: itemThumbnails.get,
  onClose: () => canvas.focus(),
});

// ---------------------------------------------------------------- the Exchange Board

const listingApi = createPlatformApiClient();
const newId = (prefix: string): string => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
/** Adopt the farm and balance a listing move answered with, and word the refusal if it was one. An animal or a fish moved as a row: read the herd and the creel again. */
function exchangeOutcome(result: any, success: string, stack = ""): ExchangeOutcome {
  takeStock(result?.layout);
  takeBalance(result?.balance);
  if (result?.ok && stack === "livestock") void loadHerd();
  if (result?.ok && stack === "fish") void trading.reloadCreel();
  if (result?.ok) return { ok: true, message: success };
  return { ok: false, message: LISTING_MESSAGES[result?.error] ?? "That did not go through. Nothing moved — try again in a moment." };
}

const exchangePanel = createExchangePanel({
  root: requiredElement<HTMLElement>("#exchangePanel"),
  closeButton: requiredElement<HTMLButtonElement>("#closeExchange"),
  buyTab: requiredElement<HTMLButtonElement>("#exchangeBuyTab"),
  sellTab: requiredElement<HTMLButtonElement>("#exchangeSellTab"),
  buyView: requiredElement<HTMLElement>("#exchangeBuyList"),
  sellView: requiredElement<HTMLElement>("#exchangeSellView"),
  limits: requiredElement<HTMLElement>("#exchangeLimits"),
  status: requiredElement<HTMLElement>("#exchangeStatus"),
}, {
  load: async () => normalizeListingBoard(await listingApi.fetchFarmListings()),
  buy: async (listing, quantity) => {
    const result = await listingApi.buyFarmListing({ listingId: listing.id, quantity, purchaseId: newId("buy") });
    const landed = listing.stack === "livestock" ? `${listing.animal?.name ?? "It"} is on its way to your farm — press L there to see it.`
      : listing.stack === "fish" ? "It is in your creel." : "They are on your farm.";
    return exchangeOutcome(result, `Bought ${listing.stack === "livestock" || listing.stack === "fish" ? "" : `${quantity} `}${listing.title} from ${listing.sellerName} for ${(quantity * listing.unitPrice).toLocaleString()} tickets. ${landed}`, listing.stack);
  },
  list: async (draft) => {
    const result = await listingApi.createFarmListing({ listingId: newId("listing"), ...draft });
    const single = draft.stack === "livestock" || draft.stack === "fish";
    return exchangeOutcome(result, single
      ? `Listed for ${draft.unitPrice.toLocaleString()} tickets. It waits on the board until it sells or you take it down.`
      : `Listed ${draft.quantity} at ${draft.unitPrice} tickets each. They are held on the board until they sell or you take them down.`, draft.stack);
  },
  withdraw: async (listing) => {
    const result = await listingApi.withdrawFarmListing({ listingId: listing.id });
    const home = listing.stack === "livestock" ? "It is back on your farm (in the first place with room, or out on the field if there is none)."
      : listing.stack === "fish" ? "It is back in your creel." : `${Number(result?.returned) || 0} went back to your farm.`;
    return exchangeOutcome(result, `Took the ${listing.title} down. ${home}`, listing.stack);
  },
  stock: () => stockEntries(farm, trading.creel(), herdCards()),
  guide: (entry) => entry.stack === "fish"
    ? trading.creel().find((fish) => fish.id === entry.id)?.value ?? 0
    : listingStandingValue(entry.stack, entry.id, entry.stack === "livestock" ? herd.find((animal) => animal.id === entry.id)?.speciesId : ""),
  thumbnail: (key, onReady) => tradePortraits(key, onReady),
  onClose: () => canvas.focus(),
});

// Trading with the others in the square (farm-market-trading.mts): T on a person, Y/N on an invitation.
// Fish can be traded too (the Cove's creel): portraits for them, and the Cove's reads.
const portraits = createFishPortraits(THREE, itemThumbnails.get);
/** A table's and the board's pictures: an animal by its species' portrait, everything else as the fish/item portraits draw it. */
const tradePortraits = (key: string, onReady: (url: string) => void): string | null =>
  key.startsWith("livestock:") ? livestockPortraits.get(key.slice("livestock:".length), onReady) : portraits(key, onReady);
/** The player's own herd as table and board cards, on the farm's stored clock. */
const herdCards = () => herd.map((animal) => tradeAnimalOf(animal, farm.clock.farmMinutes));
const tradeApi = createPlatformApiClient();
const trading = createMarketTrading({
  api: tradeApi,
  canTrade: canSell,
  farm: () => farm,
  takeStock,
  thumbnail: tradePortraits,
  fishApi: tradeApi,
  herd: herdCards,
  fetchAnimalCards: (ids) => tradeApi.fetchFarmLivestockCards(ids),
  onHerdChanged: () => void loadHerd(),
  onClose: () => canvas.focus(),
});
window.addEventListener("pagehide", () => trading.stop());
window.addEventListener("pageshow", () => { if (entered) trading.start(); });

// Every counter, board and table in the square is a sheet of the HUD layer: it frees the mouse, keeps one open,
// and closes the top one on Escape or a click on the square. Walking away from a trade is Escape's alone.
hud.sheet("inventory", { root: requiredElement<HTMLElement>("#inventoryPanel"), open: () => inventorySummary.toggle(), close: () => inventorySummary.close(), key: "KeyI", enabled: () => entered && !leaving });
hud.sheet("stats", { root: requiredElement<HTMLElement>("#statsPanel"), open: () => statsPanel.open(), close: () => statsPanel.close(), key: "KeyK", enabled: () => entered && !leaving });
hud.sheet("sale", { root: requiredElement<HTMLElement>("#salePanel"), close: () => salePanel.close() });
hud.sheet("seeds", { root: requiredElement<HTMLElement>("#seedPanel"), close: () => seedPanel.close() });
hud.sheet("dealer", { root: requiredElement<HTMLElement>("#dealerPanel"), close: () => dealerPanel.close() });
hud.sheet("butcher", { root: requiredElement<HTMLElement>("#butcherPanel"), close: () => butcherCounter.close() });
hud.sheet("kitchen", { root: requiredElement<HTMLElement>("#kitchenPanel"), close: () => kitchenPanel.close() });
hud.sheet("orders", { root: requiredElement<HTMLElement>("#ordersPanel"), close: () => ordersPanel.close() });
hud.sheet("exchange", { root: requiredElement<HTMLElement>("#exchangePanel"), close: () => exchangePanel.close() });
hud.sheet("mill", { root: requiredElement<HTMLElement>("#millPanel"), close: () => sawmill.close() });
hud.sheet("furniture", { root: requiredElement<HTMLElement>("#furniturePanel"), close: () => sawmill.close() });
hud.sheet("trade", { root: requiredElement<HTMLElement>("#tradePanel"), close: () => trading.escape(), escape: () => trading.escape(), dismissable: false });
for (const id of ["#salePanel", "#kitchenPanel", "#dealerPanel"]) wireSheetTabs(requiredElement<HTMLElement>(id));

/** A counter, the board or a trading table has the player's attention: no walking, no looking round. */
function panelOpen(): boolean {
  return hud.anyOpen();
}

function workStall(stall: MarketStall): void {
  if (!stall.open) {
    notice(stall.closedNote);
    return;
  }
  if (!canSell) {
    notice(farmStore.accountBacked
      ? "The market cannot see your farm's records right now. Try again in a moment."
      : stall.id === EXCHANGE_BOARD_ID
        ? "Sign in to buy and sell at the Exchange Board — only account farms trade for tickets."
        : stall.kind === "board"
        ? "Sign in to fill orders — only an account farm's harvest can be delivered for tickets."
        : stall.id === KITCHEN_STALL_ID
          ? "Sign in to sell your cooking — only an account farm's dishes can be traded for tickets."
          : stall.id === SAWMILL_STALL_ID
            ? "Sign in to saw logs and sell furniture — only an account farm's timber and pieces count."
            : stall.id === SEED_STALL_ID
              ? "Sign in to buy seeds — they go to your account farm's Inventory."
              : stall.id === LIVESTOCK_STALL_ID
                ? "Sign in to buy livestock — they are bought with tickets and live on your account farm."
              : stall.id === BUTCHER_STALL_ID
                ? "Sign in to send livestock to the Butcher — only an account farm's herd can go."
              : "Sign in to sell your produce — only an account farm's harvest can be traded for tickets.");
    return;
  }
  keys.clear();
  if (stall.id === ORDER_BOARD_ID) {
    ordersPanel.open();
    return;
  }
  if (stall.id === EXCHANGE_BOARD_ID) {
    exchangePanel.open();
    return;
  }
  if (stall.id === KITCHEN_STALL_ID) {
    recipeShelf.render();
    kitchenPanel.open(dishes);
  }
  else if (stall.id === SAWMILL_STALL_ID) sawmill.open();
  else if (stall.id === LIVESTOCK_STALL_ID) {
    dealerPanel.open();
    horsePaddock.render();
    feedShelf.render();
    if (!market) void loadMarketDay();
    void loadHerd();
  }
  else if (stall.id === BUTCHER_STALL_ID) {
    butcherCounter.open();
    meatShelf.render();
    void loadHerd();
    if (!market) void loadMarketDay();
  }
  else if (stall.id === SEED_STALL_ID) {
    seedPanel.open(seeds);
    if (!market) void loadMarketDay();
  } else {
    ingredientShelf.render();
    salePanel.open(produce);
    if (!market) void loadMarketDay();
  }
  if (stall.keeper) keeperSays(stall, stall.keeper.greeting);
}

// ---------------------------------------------------------------- walking and E

function updateInteraction(): void {
  const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardOf(player.yaw) };
  const walking = entered && !leaving && !panelOpen() && body.mode === "walking";
  const ride = away.state();
  const reachFrom = ride ? riderReach(ride) : pose;
  doorInReach = walking ? nearestDoor(doors, reachFrom, (entry) => canWorkDoor(reachFrom, entry.door, entry.reach)) : null;
  // In the saddle: a gate, the hitching rail, and nothing else — tie up to walk the stalls.
  if (away.mounted()) {
    stallInReach = null;
    seatInReach = null;
    nearbyVisitor = null;
    if (!entered || panelOpen() || leaving) {
      if (!leaving) setPrompt("");
      return;
    }
    if (doorInReach) {
      const home = doorInReach.doorId === MARKET_HOME_GATE;
      const cove = doorInReach.doorId === MARKET_COVE_GATE;
      const downs = doorInReach.doorId === MARKET_DOWNS_GATE;
      return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (home ? " · ride home to the farm" : cove ? " · ride down to the Cove" : downs ? " · ride out to Windrush Downs" : ""));
    }
    const tie = away.action(pose);
    return setPrompt(tie ? tie.prompt : getRidingPrompt(away.horseName(), "away"));
  }
  const untie = walking ? away.action(pose) : null;
  stallInReach = walking && !doorInReach && !untie ? findStallInReach(pose) : null;
  seatInReach = walking && !doorInReach && !stallInReach ? findSeatInReach(seats, pose) : null;
  nearbyVisitor = walking && !doorInReach && !stallInReach && !seatInReach ? visitors.nearest(pose) : null;
  // A keeper calls out once as someone steps up to an open counter.
  if (stallInReach?.keeper && performance.now() - (keeperSaidAt.get(stallInReach.id) ?? -Infinity) > 20_000) {
    keeperSays(stallInReach, stallInReach.keeper.greeting);
  }
  if (!entered || panelOpen() || leaving) {
    if (!leaving) setPrompt("");
    return;
  }
  if (body.mode === "seated") return setPrompt(SEATED_PROMPT);
  if (doorInReach) {
    const home = doorInReach.doorId === MARKET_HOME_GATE;
    const cove = doorInReach.doorId === MARKET_COVE_GATE;
    const downs = doorInReach.doorId === MARKET_DOWNS_GATE;
    return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (home ? " · the road back to the farm" : cove ? " · down to the Cove" : downs ? " · Windrush Downs, for riders only" : ""));
  }
  if (untie) return setPrompt(untie.prompt);
  if (stallInReach) return setPrompt(stallPrompt(stallInReach, canSell));
  if (seatInReach) return setPrompt(SEAT_PROMPT);
  if (nearbyVisitor) return setPrompt(`Press E to wave at ${nearbyVisitor.displayName} · T to trade`);
  setPrompt("");
}

function interact(): void {
  if (away.mounted() && !doorInReach) {
    const spot = away.act(player);
    if (spot) {
      player.x = spot.x;
      player.z = spot.z;
      keys.clear();
      notice(`${away.horseName()} is tied up. Walk back to the rail and press E to ride again.`, 4);
    }
    return;
  }
  if (!away.mounted() && !doorInReach && away.action(player)?.kind === "mount") {
    const spot = away.act(player);
    if (spot) {
      player.x = spot.x;
      player.z = spot.z;
      player.pitch = -0.32;
      keys.clear();
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
    obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls];
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
  if (!entered || leaving || panelOpen()) return;
  if (away.mounted()) {
    away.step(dt, keys);
    const ride = away.state();
    if (ride) {
      player.x = ride.x;
      player.z = ride.z;
    }
    return;
  }
  const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms: [], ladders: [] });
  if (!step.moved) return;
  player.x = step.pose.x;
  player.z = step.pose.z;
  body = step.body;
}

// Out through the open south gate is the road home; out through the north gate, the path down to the Cove.
function checkGateway(): void {
  if (!entered || leaving || body.mode !== "walking") return;
  const gate = gatewayAt(layout.decor, openDoors, player, MARKET_BOUNDS);
  if (!gate) return;
  const toCove = gate.instanceId === MARKET_COVE_GATE;
  const toDowns = gate.instanceId === MARKET_DOWNS_GATE;
  // Windrush Downs is for riders: on foot, the gate stays a view of the gallops.
  if (toDowns && !away.mounted()) {
    notice(away.hasHorse() ? `Windrush Downs is for riders — ride ${away.horseName()} out through this gate.` : "Windrush Downs is for riders — come back on your horse (Hollis sells them).", 3);
    player.x = Math.max(player.x, gate.x + 1.2);
    return;
  }
  leaving = true;
  keys.clear();
  document.exitPointerLock?.();
  const horse = away.mounted() ? away.horseId() : "";
  const words = toDowns ? "Out through the gate to Windrush Downs…" : toCove ? (horse ? "Riding down the path to the Cove…" : "Down the path to the Cove…") : (horse ? "Riding back up the road to the farm…" : "Back up the road to the farm…");
  setPrompt(words);
  status.textContent = words;
  presence.disconnect();
  location.href = toDowns ? downsUrl(horse) : toCove ? `../cove/index.html?${horseTravelQuery(fromFarm, horse)}` : `../index.html?${horseTravelQuery(fromFarm, horse, "id")}`;
}

window.addEventListener("keydown", (event) => {
  // I and K toggle (and switch) their sheets, Escape closes the top one, ? the controls card (farm-hud.mts).
  if (hud.handleKey(event)) {
    keys.clear();
    return;
  }
  if (panelOpen()) {
    keys.clear();
    return;
  }
  if (entered && chatView.handleKey(event)) {
    keys.clear();
    return;
  }
  if (entered && !event.repeat && (event.code === "KeyY" || event.code === "KeyN") && trading.answer(event.code === "KeyY")) {
    event.preventDefault();
    return;
  }
  if (entered && !event.repeat && event.code === "KeyT" && nearbyVisitor) {
    event.preventDefault();
    const note = trading.invite(nearbyVisitor);
    if (note) notice(note);
    return;
  }
  if (body.mode === "seated" && isMoveKey(event.code)) {
    const step = standUp(player, body);
    Object.assign(player, step.pose);
    body = step.body;
    return;
  }
  keys.add(event.code);
  if (event.code === "KeyM" && !event.repeat) {
    event.preventDefault();
    music.setMuted(!music.isMuted());
    renderMusicButton();
    return;
  }
  if (event.code === "KeyF" && !event.repeat && hud.fullscreen.supported) {
    event.preventDefault();
    hud.fullscreen.toggle();
    return;
  }
  if (event.code === "KeyE" && !event.repeat && entered) {
    event.preventDefault();
    interact();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

canvas.addEventListener("click", () => {
  if (entered && !panelOpen()) canvas.requestPointerLock?.()?.catch?.(() => undefined);
});
enterButton.addEventListener("click", () => {
  if (!entered) player.x += spawnOffsetForCompany({ x: player.x, z: player.z }, presence.members());
  entered = true;
  trading.start();
  music.start();
  startGate.classList.add("is-hidden");
  canvas.focus();
  status.textContent = "WASD to move · Drag to look · Click the square to capture the mouse";
});
document.addEventListener("pointerlockchange", () => {
  startGate.classList.toggle("is-hidden", entered);
});
canvas.addEventListener("pointerdown", () => { draggingLook = true; });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
  if (panelOpen()) return;
  if (document.pointerLockElement !== canvas && !draggingLook) return;
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

publishPresence();
presence.connect();
void loadMarketDay().finally(scheduleTurnover);

const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now: number): void {
  // Clamped both ways: a frame stamped before the last one (a stale first frame) must not drive the accumulator negative.
  const frameSeconds = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
  accumulator += frameSeconds;
  previous = now;
  while (accumulator >= TICK_SECONDS) {
    updatePlayer(TICK_SECONDS);
    checkGateway();
    updateInteraction();
    publishPresence();
    accumulator -= TICK_SECONDS;
  }
  world.update(frameSeconds);
  keepers.update(frameSeconds, now, keeperMembers);
  visitors.update(frameSeconds, now, presence.members());
  riderClock += frameSeconds;
  away.draw(frameSeconds, riderClock, visitors.placements());
  chatView.tick();
  applyCamera();
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Read-only handle for headless verification. Nothing in the page uses it.
(globalThis as any).__market = Object.freeze({
  pose: () => ({ ...player, y: body.y }),
  mounted: () => away.mounted(),
  ride: () => away.state(),
  stallInReach: () => stallInReach?.id ?? "",
  doorInReach: () => doorInReach?.doorId ?? "",
  openDoors: () => [...openDoors],
  saleOpen: () => salePanel.isOpen(),
  seedsOpen: () => seedPanel.isOpen(),
  butcherOpen: () => butcherCounter.isOpen(),
  exchangeOpen: () => exchangePanel.isOpen(),
  market: () => market,
  ordersOpen: () => ordersPanel.isOpen(),
  kitchenOpen: () => kitchenPanel.isOpen(),
  produce: () => produce,
  dishes: () => dishes,
  canSell: () => canSell,
  tradeOpen: () => trading.isOpen(),
  nearbyVisitor: () => nearbyVisitor?.displayName ?? "",
  presence: () => presence.status(),
});

applyCamera();
requestAnimationFrame(frame);
