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
// counts; the server prices the sale, takes the produce and pays the tickets in
// one transaction (`POST /games/farm/market/sales`), and the page shows what it
// answers. The Order Board is the same: the server writes the day's orders
// (`GET /games/farm/market/orders`), the panel names one to fill, and the
// server checks the basket and the Farming level, pays and grants the XP.
// Nothing on this page is saved: the square is a constant.
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
import { FARM_LAYOUT_SPEC, normalizeFarmLayout } from "./farm-layout.mjs";
import { gatewayAt } from "./farm-gateway.mjs";
import { MARKET_BOUNDS, MARKET_HOME_GATE, MARKET_PAVING, MARKET_PRESENCE_ROOM, MARKET_SPAWN, MARKET_STALLS, ORDER_BOARD_ID, PRODUCE_STALL_ID, findMarketStall, findStallInReach, keeperPose, marketSquareLayout, stallObstacles, stallPrompt, } from "./farm-market-square.mjs";
import { createMarketStallModel } from "./farm-market-props.mjs";
import { createMarketSalePanel } from "./farm-market-panel.mjs";
import { createOrderBoardPanel } from "./farm-orders-panel.mjs";
import { normalizeOrderBoard } from "./farm-orders.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";
import { createAchievementToaster } from "./platform/achievements/achievements.mjs";
import { createCropThumbnails } from "./farm-crop-thumbnails.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Market Square is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#marketCanvas");
const prompt = requiredElement("#marketPrompt");
const startGate = requiredElement("#startGate");
const enterButton = requiredElement("#enterMarket");
const status = requiredElement("#marketStatus");
const homeLink = requiredElement("#marketHomeLink");
const ticketChip = requiredElement("#marketTickets");
const musicButton = requiredElement("#toggleMarketMusic");
const visitorsChip = requiredElement("#marketVisitors");
const visitorsChipLabel = requiredElement("#marketVisitorsLabel");
const visitorsChipNames = requiredElement("#marketVisitorsNames");
// The road home: back to whichever farm the player walked out of.
const fromFarm = new URLSearchParams(location.search).get("farm") ?? "";
const homeUrl = fromFarm ? `../index.html?id=${encodeURIComponent(fromFarm)}` : "../index.html";
homeLink.href = homeUrl;
if (fromFarm)
    homeLink.textContent = "← Back to their farm";
// What the player has to sell is on THEIR farm document (visiting someone else's
// farm does not change whose basket this is). Read once; the server's answer to
// every sale replaces it.
const farmStore = createLayoutStore(FARM_LAYOUT_SPEC);
const farmLoad = await farmStore.load();
const canSell = farmStore.accountBacked && farmLoad.source === "account";
let produce = farmLoad.layout.agriculture.inventory.produce;
const ticketClient = createTicketWalletClient();
let balance = null;
function renderTickets() {
    ticketChip.hidden = balance === null;
    ticketChip.querySelector("strong").textContent = formatTicketBalance(balance);
}
if (farmStore.accountBacked) {
    void ticketClient.getWallet().then((wallet) => {
        if (Number.isSafeInteger(wallet?.balance))
            balance = wallet.balance;
        renderTickets();
    }).catch(() => undefined);
}
renderTickets();
const music = createFarmMusic();
function renderMusicButton() {
    const muted = music.isMuted();
    musicButton.setAttribute("aria-pressed", String(muted));
    musicButton.firstChild.textContent = muted ? "Music off " : "Music on ";
}
musicButton.addEventListener("click", () => { music.setMuted(!music.isMuted()); renderMusicButton(); });
renderMusicButton();
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
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
for (const stall of MARKET_STALLS)
    scene.add(createMarketStallModel(THREE, stall));
// The keepers stand behind their counters: arcade avatars on the room's visitor
// bodies, so they breathe, wear a name tag and can speak in a bubble.
const keepers = createRoomVisitors(THREE, scene);
const keeperMembers = MARKET_STALLS.filter((stall) => stall.keeper).map((stall) => {
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
const player = { x: MARKET_SPAWN.x, z: MARKET_SPAWN.z, yaw: MARKET_SPAWN.yaw, pitch: -0.03 };
let body = createFarmBody();
const walkerBounds = { halfWidth: MARKET_BOUNDS.width / 2, halfDepth: MARKET_BOUNDS.depth / 2, margin: MARKET_BOUNDS.wallInset };
const openDoors = new Set();
const solidStalls = stallObstacles();
let obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls];
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
/** A notice E put up (a shut stall's, a wave) holds the prompt until this time. */
let noticeUntil = 0;
function applyCamera() {
    camera.position.set(player.x, eyeHeight(body, EYE_HEIGHT), player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
}
function setPrompt(text) {
    prompt.textContent = text;
    prompt.classList.toggle("is-visible", Boolean(text));
}
function notice(text, seconds = 6) {
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
function renderVisitorsChip() {
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
    root: requiredElement("#marketChat"),
    log: requiredElement("#marketChatLog"),
    input: requiredElement("#marketChatInput"),
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
function publishPresence() {
    presence.publishPose({
        x: player.x,
        z: player.z,
        yaw: player.yaw,
        moving: keys.size > 0 && body.mode === "walking",
        activity: salePanel.isOpen() ? "selling produce" : ordersPanel.isOpen() ? "reading the Order Board" : "",
    });
}
// ---------------------------------------------------------------- the Produce Merchant
const cropThumbnails = createCropThumbnails(THREE);
const saleMessages = Object.freeze({
    not_enough_produce: "Your basket was not what the merchant was shown, so she counted again. Nothing was sold.",
    farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
    invalid_sale: "That sale did not add up. Nothing was sold.",
});
async function sellProduce(items) {
    const saleId = `sale-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    const result = await ticketClient.sellFarmProduce(items, saleId);
    if (result?.layout)
        produce = normalizeFarmLayout(result.layout).agriculture.inventory.produce;
    if (!result?.ok) {
        return { ok: false, message: saleMessages[result?.error] ?? "The sale did not go through. Nothing was sold — try again in a moment.", produce };
    }
    takeBalance(result.balance);
    const produceStall = findMarketStall(PRODUCE_STALL_ID);
    keeperSays(produceStall, "Pleasure doing business!");
    const earned = Number(result.earned) || 0;
    return { ok: true, message: `Sold for ${earned.toLocaleString()} tickets. Your balance is ${formatTicketBalance(balance)}.`, produce };
}
const salePanel = createMarketSalePanel({
    root: requiredElement("#salePanel"),
    closeButton: requiredElement("#closeSale"),
    list: requiredElement("#saleList"),
    total: requiredElement("#saleTotal"),
    sellButton: requiredElement("#sellProduce"),
    pickAllButton: requiredElement("#pickAllProduce"),
    status: requiredElement("#saleStatus"),
}, {
    sell: sellProduce,
    thumbnail: cropThumbnails.get,
    onClose: () => canvas.focus(),
});
// ---------------------------------------------------------------- the Order Board
const achievementToaster = createAchievementToaster();
const orderMessages = Object.freeze({
    not_enough_produce: "Your basket came up short when it was counted. Nothing was delivered.",
    level_too_low: "That order needs a higher Farming level. Nothing was delivered.",
    order_expired: "That notice came down while you were reading it — the board has turned over. Nothing was delivered.",
    farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
});
function takeBalance(value) {
    if (!Number.isSafeInteger(value))
        return;
    balance = value;
    publishTicketBalance(balance);
    renderTickets();
}
async function loadOrderBoard() {
    const board = normalizeOrderBoard(await ticketClient.getFarmOrders());
    // The board carries the basket as the server holds it now: fresher than the page's.
    if (board)
        produce = board.produce;
    return board;
}
async function fillOrder(orderId) {
    const result = await ticketClient.fillFarmOrder(orderId);
    const layout = result?.layout ? normalizeFarmLayout(result.layout) : null;
    if (layout)
        produce = layout.agriculture.inventory.produce;
    const level = layout ? farmingLevelForXp(layout.skills.farming.xp) : undefined;
    if (!result?.ok) {
        return { ok: false, message: orderMessages[result?.error] ?? "The delivery did not go through. Nothing was taken — try again in a moment.", produce, level };
    }
    takeBalance(result.balance);
    if (Array.isArray(result.achievements) && result.achievements.length)
        achievementToaster.show("farm", "The Farm", result.achievements);
    if (result.duplicate)
        return { ok: true, message: "That order was already delivered.", produce, level, filled: true };
    const customer = typeof result.order?.customer === "string" ? result.order.customer : "The customer";
    const levelUp = Number(result.farming?.level) > Number(result.farming?.levelBefore) ? ` Farming level ${result.farming.level}!` : "";
    return {
        ok: true,
        message: `${customer} paid ${Number(result.earned).toLocaleString()} tickets · +${Number(result.xp).toLocaleString()} Farming XP.${levelUp}`,
        produce, level, filled: true,
    };
}
const ordersPanel = createOrderBoardPanel({
    root: requiredElement("#ordersPanel"),
    closeButton: requiredElement("#closeOrders"),
    list: requiredElement("#ordersList"),
    level: requiredElement("#ordersLevel"),
    turnover: requiredElement("#ordersTurnover"),
    status: requiredElement("#ordersStatus"),
}, {
    load: loadOrderBoard,
    fill: fillOrder,
    thumbnail: cropThumbnails.get,
    onClose: () => canvas.focus(),
});
/** A counter or the board has the player's attention: no walking, no looking round. */
function panelOpen() {
    return salePanel.isOpen() || ordersPanel.isOpen();
}
function workStall(stall) {
    if (!stall.open) {
        notice(stall.closedNote);
        return;
    }
    if (!canSell) {
        notice(farmStore.accountBacked
            ? "The market cannot see your farm's records right now. Try again in a moment."
            : stall.kind === "board"
                ? "Sign in to fill orders — only an account farm's harvest can be delivered for tickets."
                : "Sign in to sell your produce — only an account farm's harvest can be traded for tickets.");
        return;
    }
    keys.clear();
    if (stall.id === ORDER_BOARD_ID) {
        ordersPanel.open();
        return;
    }
    salePanel.open(produce);
    if (stall.keeper)
        keeperSays(stall, stall.keeper.greeting);
}
// ---------------------------------------------------------------- walking and E
function updateInteraction() {
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
        if (!leaving)
            setPrompt("");
        return;
    }
    if (performance.now() < noticeUntil)
        return;
    if (body.mode === "seated")
        return setPrompt(SEATED_PROMPT);
    if (doorInReach) {
        const home = doorInReach.doorId === MARKET_HOME_GATE;
        return setPrompt(getDoorPrompt(openDoors.has(doorInReach.doorId), doorInReach) + (home ? " · the road back to the farm" : ""));
    }
    if (stallInReach)
        return setPrompt(stallPrompt(stallInReach, canSell));
    if (seatInReach)
        return setPrompt(SEAT_PROMPT);
    if (nearbyVisitor)
        return setPrompt(`Press E to wave at ${nearbyVisitor.displayName}`);
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
        obstacles = [...farmObstacles(layout, { openDoors }), ...solidStalls];
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
    if (!entered || leaving || panelOpen())
        return;
    const step = stepFarmBody(player, body, keys, dt, { bounds: walkerBounds, obstacles, platforms: [], ladders: [] });
    if (!step.moved)
        return;
    player.x = step.pose.x;
    player.z = step.pose.z;
    body = step.body;
}
// Out through the open south gate is the road home.
function checkGateway() {
    if (!entered || leaving || body.mode !== "walking")
        return;
    if (!gatewayAt(layout.decor, openDoors, player, MARKET_BOUNDS))
        return;
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
            ordersPanel.close();
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
publishPresence();
presence.connect();
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now) {
    const frameSeconds = Math.min((now - previous) / 1000, 0.1);
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
globalThis.__market = Object.freeze({
    pose: () => ({ ...player, y: body.y }),
    stallInReach: () => stallInReach?.id ?? "",
    doorInReach: () => doorInReach?.doorId ?? "",
    openDoors: () => [...openDoors],
    saleOpen: () => salePanel.isOpen(),
    ordersOpen: () => ordersPanel.isOpen(),
    produce: () => produce,
    canSell: () => canSell,
    presence: () => presence.status(),
});
applyCamera();
requestAnimationFrame(frame);
