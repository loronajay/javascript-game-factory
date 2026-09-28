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
// Money is never decided here. The Produce Merchant's panel names crops and
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
  MARKET_PAVING,
  MARKET_PRESENCE_ROOM,
  MARKET_SPAWN,
  KITCHEN_STALL_ID,
  MARKET_STALLS,
  ORDER_BOARD_ID,
  PRODUCE_STALL_ID,
  SAWMILL_STALL_ID,
  findMarketStall,
  findStallInReach,
  keeperPose,
  marketSquareLayout,
  stallObstacles,
  stallPrompt,
  type MarketStall,
} from "./farm-market-square.mjs";
import { createMarketStallModel } from "./farm-market-props.mjs";
import { createMarketSalePanel, type SaleOutcome } from "./farm-market-panel.mjs";
import { createOrderBoardPanel, type OrderFillOutcome } from "./farm-orders-panel.mjs";
import { createMarketSawmill } from "./farm-market-sawmill.mjs";
import { normalizeOrderBoard, type FarmOrderBoard } from "./farm-orders.mjs";
import { SELLABLE_DISHES } from "./farm-market-prices.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { createFarmItemThumbnails } from "./farm-item-thumbnails.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";

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

// The road home: back to whichever farm the player walked out of.
const fromFarm = new URLSearchParams(location.search).get("farm") ?? "";
const homeUrl = fromFarm ? `../index.html?id=${encodeURIComponent(fromFarm)}` : "../index.html";
homeLink.href = homeUrl;
if (fromFarm) homeLink.textContent = "← Back to their farm";

// What the player has to sell is on THEIR farm document (visiting someone else's
// farm does not change whose basket this is). Read once; the server's answer to
// every sale replaces it.
const farmStore = createLayoutStore(FARM_LAYOUT_SPEC);
const farmLoad = await farmStore.load();
const canSell = farmStore.accountBacked && farmLoad.source === "account";
let produce: Readonly<Record<string, number>> = farmLoad.layout.agriculture.inventory.produce;
let dishes: Readonly<Record<string, number>> = farmLoad.layout.agriculture.inventory.dishes;
/** The whole farm as the server last answered: the Sawmill reads its logs, planks and furniture shelf from it. */
let farm = farmLoad.layout;
/** Take the basket and pantry from a farm the server answered with. */
function takeStock(layoutValue: unknown): ReturnType<typeof normalizeFarmLayout> | null {
  if (!layoutValue) return null;
  const next = normalizeFarmLayout(layoutValue);
  farm = next;
  produce = next.agriculture.inventory.produce;
  dishes = next.agriculture.inventory.dishes;
  return next;
}
const ticketClient = createTicketWalletClient();

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
  musicButton.firstChild!.textContent = muted ? "Music off " : "Music on ";
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
// The square keeps market hours: a bright mid-afternoon for everyone in it
// (`?time=<minute>` checks another light, the farm page's QA seam).
const previewMinute = Number(new URLSearchParams(location.search).get("time"));
world.setTime(Number.isFinite(previewMinute) && previewMinute > 0 ? previewMinute : 15 * 60);
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

const player = { x: MARKET_SPAWN.x, z: MARKET_SPAWN.z, yaw: MARKET_SPAWN.yaw, pitch: -0.03 };
let body: FarmBody = createFarmBody();
const walkerBounds = { halfWidth: MARKET_BOUNDS.width / 2, halfDepth: MARKET_BOUNDS.depth / 2, margin: MARKET_BOUNDS.wallInset };
const openDoors = new Set<string>();
const solidStalls = stallObstacles();
let obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls];
const seats = farmSeats(layout);
const doors = doorRows(layout);
const keys = new Set<string>();
let entered = false;
let leaving = false;
let draggingLook = false;
let doorInReach: DoorRow | null = null;
let seatInReach: SeatInReach | null = null;
let stallInReach: MarketStall | null = null;
let nearbyVisitor: RemoteMember | null = null;
/** A notice E put up (a shut stall's, a wave) holds the prompt until this time. */
let noticeUntil = 0;

function applyCamera(): void {
  camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function setPrompt(text: string): void {
  prompt.textContent = text;
  prompt.classList.toggle("is-visible", Boolean(text));
}

function notice(text: string, seconds = 6): void {
  noticeUntil = performance.now() + seconds * 1000;
  setPrompt(text);
}

// ---------------------------------------------------------------- the others in the square

const visitors = createRoomVisitors(THREE, scene);
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
    activity: salePanel.isOpen() ? "selling produce" : kitchenPanel.isOpen() ? "selling cooking" : ordersPanel.isOpen() ? "reading the Order Board" : sawmill.activity(),
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
  const result = await ticketClient.sellFarmProduce(items, saleId);
  takeStock(result?.layout);
  const stock = stallId === KITCHEN_STALL_ID ? dishes : produce;
  if (!result?.ok) {
    return { ok: false, message: saleMessages[result?.error] ?? "The sale did not go through. Nothing was sold — try again in a moment.", produce: stock };
  }
  takeBalance(result.balance);
  keeperSays(findMarketStall(stallId)!, stallId === KITCHEN_STALL_ID ? "I'll have these on the menu by supper." : "Pleasure doing business!");
  const earned = Number(result.earned) || 0;
  return { ok: true, message: `Sold for ${earned.toLocaleString()} tickets. Your balance is ${formatTicketBalance(balance)}.`, produce: stock };
}

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
  onClose: () => canvas.focus(),
});

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

// ---------------------------------------------------------------- the Order Board

const achievementToaster = createAchievementToaster();
const orderMessages: Readonly<Record<string, string>> = Object.freeze({
  not_enough_produce: "Your basket came up short when it was counted. Nothing was delivered.",
  not_enough_dishes: "Your pantry came up short when it was counted. Nothing was delivered.",
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

async function loadOrderBoard(): Promise<FarmOrderBoard | null> {
  const board = normalizeOrderBoard(await ticketClient.getFarmOrders());
  // The board carries the basket and pantry as the server holds them now: fresher than the page's.
  if (board) {
    produce = board.produce;
    dishes = board.dishes;
  }
  return board;
}

async function fillOrder(orderId: string): Promise<OrderFillOutcome> {
  const result = await ticketClient.fillFarmOrder(orderId);
  const layout = takeStock(result?.layout);
  const levels = layout ? { farming: farmingLevelForXp(layout.skills.farming.xp), cooking: farmingLevelForXp(layout.skills.cooking.xp) } : undefined;
  const stock = { produce, dishes, levels };
  if (!result?.ok) {
    return { ok: false, message: orderMessages[result?.error] ?? "The delivery did not go through. Nothing was taken — try again in a moment.", ...stock };
  }
  takeBalance(result.balance);
  if (Array.isArray(result.achievements) && result.achievements.length) achievementToaster.show("farm", "The Farm", result.achievements);
  if (result.duplicate) return { ok: true, message: "That order was already delivered.", ...stock, filled: true };
  const customer = typeof result.order?.customer === "string" ? result.order.customer : "The customer";
  const cooking = result.skill === "cooking";
  const summary = cooking ? result.cooking : result.farming;
  const skill = cooking ? "Cooking" : "Farming";
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
  thumbnail: itemThumbnails.get,
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

/** A counter or the board has the player's attention: no walking, no looking round. */
function panelOpen(): boolean {
  return salePanel.isOpen() || kitchenPanel.isOpen() || ordersPanel.isOpen() || sawmill.isOpen();
}

function workStall(stall: MarketStall): void {
  if (!stall.open) {
    notice(stall.closedNote);
    return;
  }
  if (!canSell) {
    notice(farmStore.accountBacked
      ? "The market cannot see your farm's records right now. Try again in a moment."
      : stall.kind === "board"
        ? "Sign in to fill orders — only an account farm's harvest can be delivered for tickets."
        : stall.id === KITCHEN_STALL_ID
          ? "Sign in to sell your cooking — only an account farm's dishes can be traded for tickets."
          : stall.id === SAWMILL_STALL_ID
            ? "Sign in to saw logs and sell furniture — only an account farm's timber and pieces count."
            : "Sign in to sell your produce — only an account farm's harvest can be traded for tickets.");
    return;
  }
  keys.clear();
  if (stall.id === ORDER_BOARD_ID) {
    ordersPanel.open();
    return;
  }
  if (stall.id === KITCHEN_STALL_ID) kitchenPanel.open(dishes);
  else if (stall.id === SAWMILL_STALL_ID) sawmill.open();
  else salePanel.open(produce);
  if (stall.keeper) keeperSays(stall, stall.keeper.greeting);
}

// ---------------------------------------------------------------- walking and E

function updateInteraction(): void {
  const pose = { x: player.x, z: player.z, y: body.y, yaw: player.yaw, forward: forwardOf(player.yaw) };
  const walking = entered && !leaving && !panelOpen() && body.mode === "walking";
  doorInReach = walking ? nearestDoor(doors, pose, (entry) => canWorkDoor(pose, entry.door, entry.reach)) : null;
  stallInReach = walking && !doorInReach ? findStallInReach(pose) : null;
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
  if (performance.now() < noticeUntil) return;
  if (body.mode === "seated") return setPrompt(SEATED_PROMPT);
  if (doorInReach) {
    const home = doorInReach.doorId === MARKET_HOME_GATE;
    return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (home ? " · the road back to the farm" : ""));
  }
  if (stallInReach) return setPrompt(stallPrompt(stallInReach, canSell));
  if (seatInReach) return setPrompt(SEAT_PROMPT);
  if (nearbyVisitor) return setPrompt(`Press E to wave at ${nearbyVisitor.displayName}`);
  setPrompt("");
}

function interact(): void {
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
  const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms: [], ladders: [] });
  if (!step.moved) return;
  player.x = step.pose.x;
  player.z = step.pose.z;
  body = step.body;
}

// Out through the open south gate is the road home.
function checkGateway(): void {
  if (!entered || leaving || body.mode !== "walking") return;
  if (!gatewayAt(layout.decor, openDoors, player, MARKET_BOUNDS)) return;
  leaving = true;
  keys.clear();
  document.exitPointerLock?.();
  setPrompt("Back up the road to the farm…");
  status.textContent = "Back up the road to the farm…";
  presence.disconnect();
  location.href = homeUrl;
}

window.addEventListener("keydown", (event) => {
  if (panelOpen()) {
    if (event.code === "Escape") {
      salePanel.close();
      kitchenPanel.close();
      ordersPanel.close();
      sawmill.close();
    }
    keys.clear();
    return;
  }
  if (entered && chatView.handleKey(event)) {
    keys.clear();
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
  chatView.tick();
  applyCamera();
  resize();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Read-only handle for headless verification. Nothing in the page uses it.
(globalThis as any).__market = Object.freeze({
  pose: () => ({ ...player, y: body.y }),
  stallInReach: () => stallInReach?.id ?? "",
  doorInReach: () => doorInReach?.doorId ?? "",
  openDoors: () => [...openDoors],
  saleOpen: () => salePanel.isOpen(),
  ordersOpen: () => ordersPanel.isOpen(),
  kitchenOpen: () => kitchenPanel.isOpen(),
  produce: () => produce,
  dishes: () => dishes,
  canSell: () => canSell,
  presence: () => presence.status(),
});

applyCamera();
requestAnimationFrame(frame);
