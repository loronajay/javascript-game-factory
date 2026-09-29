// Windrush Downs (planning-docs/FARM_RIDING_PLAN.md): the farm's riding
// grounds, out through the Market Square's west gate — for riders only.
//
// This page is the composition root. It reads the rider's horse out of the
// SERVER's copy of their farm (the URL only names it), rides it on the PILOTED
// sim through `farm-riding-away` — its own stats, its condition, its traits and
// the rider's Riding perks — over the Downs' own ground and fences
// (`downs-terrain`, `downs-scene`), keeps course runs (`downs-course`) and
// sends every finished one to the server to be ridden again for Riding XP and
// training, and shares the place with everyone else riding there. It decides
// nothing itself; every rule lives in a pure module.
import * as THREE_VENDOR from "./vendor/three.module.js";
import { createLayoutStore, createRoomLayoutStore } from "./arcade-room-store.mjs";
import { lookWalker } from "./arcade-room-walker.mjs";
import { createRoomPresence } from "./arcade-room-presence.mjs";
import { createRoomVisitors } from "./arcade-room-visitors.mjs";
import { createRoomChat } from "./arcade-room-chat.mjs";
import { createRoomChatView } from "./arcade-room-chat-view.mjs";
import { FARM_LAYOUT_SPEC, normalizeFarmLayout } from "./farm-layout.mjs";
import { findPetCare, petRideTraits } from "./farm-pet-care.mjs";
import { growthStage } from "./farm-pet-growth.mjs";
import { horseStats } from "./farm-horse-riding.mjs";
import { rideProfile } from "./farm-ride-profile.mjs";
import { packRideInput, rideInputFromKeys } from "./farm-ride.mjs";
import { createAwayRiding } from "./farm-riding-away.mjs";
import { horseTravelQuery, ridingHorseFrom } from "./farm-riding-travel.mjs";
import { getRidingPrompt } from "./farm-interaction.mjs";
import { farmingLevelForXp, skillLabel } from "./farm-skills.mjs";
import { createFarmMusic } from "./farm-music.mjs";
import { createTicketWalletClient, formatTicketBalance, publishTicketBalance } from "./platform/api/ticket-wallet.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createDownsWorld } from "./downs-world.mjs";
import { createDownsProps } from "./downs-props.mjs";
import { DOWNS_BETTING_BOOTH, DOWNS_NOTICE_BOARD, DOWNS_PRESENCE_ROOM, DOWNS_PROPS, DOWNS_RACE_BOARD, DOWNS_SPAWN, DOWNS_WALKER_BOUNDS, downsJumps, downsSolids, inDownsGateway } from "./downs-scene.mjs";
import { downsGround, downsWaterDepth } from "./downs-terrain.mjs";
import { findDownsCourse, formatRunTime, loadRunBests, recordRunBest, stepCourse } from "./downs-course.mjs";
import { createDownsHud } from "./downs-hud.mjs";
import { createDownsMap } from "./downs-map.mjs";
import { courseOpenTo, createDownsBoard } from "./downs-board.mjs";
import { createDownsRacing } from "./downs-racing.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Windrush Downs is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#downsCanvas");
const prompt = requiredElement("#downsPrompt");
const startGate = requiredElement("#startGate");
const enterButton = requiredElement("#enterDowns");
const status = requiredElement("#downsStatus");
const backLink = requiredElement("#downsBackLink");
const ticketChip = requiredElement("#downsTickets");
const ridingChip = requiredElement("#downsRiding");
const musicButton = requiredElement("#toggleDownsMusic");
const visitorsChip = requiredElement("#downsVisitors");
const visitorsChipLabel = requiredElement("#downsVisitorsLabel");
const visitorsChipNames = requiredElement("#downsVisitorsNames");
const params = new URLSearchParams(location.search);
const fromFarm = params.get("farm") ?? "";
// The rider's horse, from the server's copy of their farm (the URL only says which one).
const farmStore = createLayoutStore(FARM_LAYOUT_SPEC);
const farmLoad = await farmStore.load();
const signedIn = farmStore.accountBacked && farmLoad.source === "account";
let farm = farmLoad.layout;
const horse = ridingHorseFrom(farm, params.get("horse"));
const backUrl = (riding) => `../market/index.html?from=downs${horseTravelQuery(fromFarm, riding && horse ? horse.instanceId : "") ? `&${horseTravelQuery(fromFarm, riding && horse ? horse.instanceId : "")}` : ""}`;
backLink.href = backUrl(true);
if (!horse) {
    requiredElement("#startTitle").textContent = "For riders only.";
    requiredElement("#startWords").textContent = "Windrush Downs is ridden, not walked. Ride out here on your horse from the Market Square's west gate — Hollis the Livestock Dealer sells horses, and a horse lives in a Stable stall on your farm.";
    enterButton.hidden = true;
    requiredElement("#noHorseBack").hidden = false;
}
const ridingLevel = () => farmingLevelForXp(farm.skills.riding.xp);
/** The horse's piloted numbers: its four stats, how it is kept, its traits, and the rider's perks. */
function horseProfile(pet) {
    const profile = pet.profile;
    const care = findPetCare(pet.speciesId);
    const elder = care ? growthStage(profile.ageDays, care.maxLifeDays).id === "elder" : false;
    return rideProfile(horseStats(profile), { hunger: profile.hunger, happiness: profile.happiness, elder }, petRideTraits(profile), ridingLevel());
}
// ---------------------------------------------------------------- tickets, riding, music
const ticketClient = createTicketWalletClient();
const api = createPlatformApiClient();
let balance = null;
function renderChips() {
    ticketChip.hidden = balance === null;
    ticketChip.querySelector("strong").textContent = formatTicketBalance(balance);
    ridingChip.hidden = !signedIn;
    ridingChip.querySelector("strong").textContent = String(ridingLevel());
}
function takeBalance(value) {
    if (!Number.isSafeInteger(value))
        return;
    balance = value;
    publishTicketBalance(balance);
    renderChips();
}
if (signedIn)
    void ticketClient.getWallet().then((wallet) => takeBalance(wallet?.balance)).catch(() => undefined);
renderChips();
const music = createFarmMusic();
function renderMusicButton() {
    const muted = music.isMuted();
    musicButton.setAttribute("aria-pressed", String(muted));
    musicButton.firstChild.textContent = muted ? "Music off " : "Music on ";
}
musicButton.addEventListener("click", () => { music.setMuted(!music.isMuted()); renderMusicButton(); });
renderMusicButton();
// ---------------------------------------------------------------- the scene
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
    status.textContent = "Windrush Downs needs WebGL to render.";
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
const BASE_FOV = 68;
const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 560);
camera.rotation.order = "YXZ";
const world = createDownsWorld(THREE, scene);
const props = createDownsProps(THREE, scene);
let championship = false;
const solids = downsSolids();
let jumps = downsJumps(false);
function setChampionship(on) {
    championship = on && courseOpenTo(findDownsCourse("xc-championship"), ridingLevel());
    jumps = downsJumps(championship);
    props.showCrossCountry(championship);
}
const away = createAwayRiding(THREE, scene, {
    horse,
    mode: "piloted",
    profile: (pet) => horseProfile(pet),
    world: () => ({ bounds: DOWNS_WALKER_BOUNDS, solids, jumps, ground: downsGround, water: downsWaterDepth }),
    canStand: () => false,
    rails: [],
    canTie: false,
});
const player = { x: DOWNS_SPAWN.x, z: DOWNS_SPAWN.z, yaw: DOWNS_SPAWN.yaw, pitch: -0.3 };
const keys = new Set();
let entered = false;
let leaving = false;
let draggingLook = false;
let noticeUntil = 0;
let riderClock = 0;
/** A tap of Space shorter than a tick still jumps: held until the next tick reads it. */
let jumpLatch = false;
function setPrompt(text) {
    prompt.textContent = text;
    prompt.classList.toggle("is-visible", Boolean(text));
}
function notice(text, seconds = 4) {
    noticeUntil = performance.now() + seconds * 1000;
    setPrompt(text);
}
// ---------------------------------------------------------------- the HUD, the map, the board
const hud = createDownsHud({
    ride: requiredElement("#rideHud"),
    horseName: requiredElement("#rideHorseName"),
    gait: requiredElement("#rideGait"),
    wind: requiredElement("#rideWind"),
    speed: requiredElement("#rideSpeed"),
    winded: requiredElement("#rideWinded"),
    run: requiredElement("#runHud"),
    course: requiredElement("#runCourse"),
    time: requiredElement("#runTime"),
    faults: requiredElement("#runFaults"),
    next: requiredElement("#runNext"),
    toast: requiredElement("#runToast"),
});
hud.setHorse(horse?.name ?? "");
const map = createDownsMap(requiredElement("#downsMap"));
const storage = (() => { try {
    return globalThis.localStorage ?? null;
}
catch {
    return null;
} })();
let bests = loadRunBests(storage);
const board = createDownsBoard({
    root: requiredElement("#boardPanel"),
    close: requiredElement("#closeBoard"),
    rider: requiredElement("#boardRider"),
    courses: requiredElement("#boardCourses"),
    line: requiredElement("#boardLine"),
    perks: requiredElement("#boardPerks"),
}, {
    bests: () => bests,
    ridingLevel,
    ridingXp: () => skillLabel("Riding", farm.skills.riding.xp),
    horse: () => horse?.name ?? "",
    championship: () => championship,
    setChampionship,
    onClose: () => canvas.focus(),
});
// ---------------------------------------------------------------- the others at the Downs
const visitors = createRoomVisitors(THREE, scene, { mountSeat: (mount) => away.seatFor(mount) });
const factoryProfile = loadFactoryProfile();
const presenceName = factoryProfile.profileName || "Rider";
const presence = createRoomPresence({
    roomId: DOWNS_PRESENCE_ROOM,
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
        visitorsChipLabel.textContent = "DOWNS FULL";
        visitorsChipNames.textContent = "Too many riders are out right now.";
        return;
    }
    visitorsChipLabel.textContent = `AT THE DOWNS · ${members.length}`;
    visitorsChipNames.textContent = members.map((member) => member.displayName).join(", ");
}
const chat = createRoomChat({ send: (text) => presence.sendChat(text), selfName: presenceName });
const chatView = createRoomChatView({
    chat,
    root: requiredElement("#downsChat"),
    log: requiredElement("#downsChatLog"),
    input: requiredElement("#downsChatInput"),
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
// ---------------------------------------------------------------- races (the race board and the betting booth)
const racing = createDownsRacing({
    api,
    signedIn,
    selfPlayerId: factoryProfile.playerId,
    horse: () => horse,
    presenceMembers: () => presence.members(),
    selfName: presenceName,
    takeBalance,
    refreshBalance: () => { if (signedIn)
        void ticketClient.getWallet().then((wallet) => takeBalance(wallet?.balance)).catch(() => undefined); },
    takeFarm: (value) => {
        if (value)
            farm = normalizeFarmLayout(value);
        else if (signedIn)
            void farmStore.load().then((loaded) => { farm = loaded.layout; renderChips(); }).catch(() => undefined);
        renderChips();
    },
    hud,
    elements: {
        racePanel: requiredElement("#racePanel"),
        closeRaces: requiredElement("#closeRaces"),
        raceCompose: requiredElement("#raceCompose"),
        raceList: requiredElement("#raceList"),
        raceStatus: requiredElement("#raceStatus"),
        boothPanel: requiredElement("#boothPanel"),
        closeBooth: requiredElement("#closeBooth"),
        boothList: requiredElement("#boothList"),
        boothStatus: requiredElement("#boothStatus"),
    },
    onClose: () => canvas.focus(),
});
function panelOpen() {
    return board.isOpen() || racing.panelOpen();
}
function publishPresence() {
    presence.publishPose({
        x: player.x,
        z: player.z,
        yaw: away.state()?.heading ?? player.yaw,
        moving: Math.abs(away.state()?.speed ?? 0) > 0.1,
        activity: racing.activity() || (run?.phase === "running" ? `riding ${findDownsCourse(run.courseId)?.title ?? "a course"}` : ""),
        ...(away.presenceMount() ? { mount: away.presenceMount() } : {}),
    });
}
// ---------------------------------------------------------------- courses
let run = null;
/** A finished run goes to the server to be ridden again from its reins; it pays Riding XP and trains the horse if it holds up. */
async function submitRun(finished) {
    if (!signedIn || !horse)
        return;
    const result = await api.submitFarmRidingRun({
        horseId: horse.instanceId,
        courseId: finished.courseId,
        ticks: finished.ticks,
        faults: finished.faults,
        start: finished.start,
        inputs: finished.inputs,
    }).catch(() => null);
    if (!result?.ok) {
        if (result?.error === "replay_mismatch")
            hud.toast("The stewards couldn't match that run.", "It stands as your own best, but earns no Riding XP.", 5);
        return;
    }
    if (result.layout)
        farm = normalizeFarmLayout(result.layout);
    renderChips();
    const levelUp = result.levelAfter > result.levelBefore ? ` · Riding ${result.levelAfter}!` : "";
    hud.toast(`+${Number(result.xp).toLocaleString()} Riding XP${levelUp}`, result.trainingNote || "", 5);
}
function keepCourse(before, after, input, events) {
    if (racing.racing())
        return;
    const level = ridingLevel();
    const step = stepCourse(run, before, after, input, events, (course) => courseOpenTo(course, level) && (course.id !== "xc" || !championship) && (course.id !== "xc-championship" || championship));
    run = step.run;
    for (const event of step.events) {
        const course = findDownsCourse(event.courseId);
        if (event.kind === "started" || event.kind === "restarted")
            hud.toast(`${course?.title ?? "Course"} — go!`, event.kind === "restarted" ? "Started again from the line." : "", 2);
        else if (event.kind === "fault")
            hud.toast("Rail down — 4 faults", "", 1.6);
        else if (event.kind === "missed")
            hud.toast("Missed a fence!", "Go back and take it, then carry on.", 3);
        else if (event.kind === "abandoned")
            hud.toast("Run abandoned", "Ten minutes is long enough for any course.", 3);
        else if (event.kind === "finished" && run) {
            const recorded = recordRunBest(bests, run, horse?.name ?? "", Date.now(), storage);
            bests = recorded.bests;
            hud.toast(`${course?.title}: ${formatRunTime(run.ticks)}${run.faults ? ` · ${run.faults} faults` : " · clear round"}`, recorded.improved ? "A new personal best!" : "", 5);
            void submitRun(run);
        }
    }
}
// ---------------------------------------------------------------- riding, E and the keys
function nearProp(id, reach = 3.4) {
    const entry = DOWNS_PROPS.find((candidate) => candidate.id === id);
    return Boolean(entry && Math.hypot(entry.x - player.x, entry.z - player.z) <= reach + Math.max(entry.width, entry.depth) / 2);
}
function updateInteraction() {
    if (!entered || leaving || panelOpen()) {
        if (!leaving)
            setPrompt("");
        return;
    }
    if (performance.now() < noticeUntil)
        return;
    if (racing.prompt())
        return setPrompt(racing.prompt());
    if (nearProp(DOWNS_NOTICE_BOARD))
        return setPrompt("Press E to read the notice board: courses, your bests, perks");
    if (nearProp(DOWNS_RACE_BOARD))
        return setPrompt("Press E for the race board: post a race or enter one");
    if (nearProp(DOWNS_BETTING_BOOTH))
        return setPrompt("Press E at the betting booth: back a rider");
    setPrompt(getRidingPrompt(horse?.name ?? "your horse", "downs"));
}
function interact() {
    if (racing.interact())
        return;
    if (nearProp(DOWNS_NOTICE_BOARD)) {
        keys.clear();
        board.open();
        return;
    }
    if (nearProp(DOWNS_RACE_BOARD)) {
        keys.clear();
        racing.openRaces();
        return;
    }
    if (nearProp(DOWNS_BETTING_BOOTH)) {
        keys.clear();
        racing.openBooth();
        return;
    }
}
function updateRider(dt) {
    if (!entered || leaving)
        return;
    const held = rideInputFromKeys(keys);
    const input = panelOpen() ? rideInputFromKeys(new Set()) : jumpLatch && !held.jump ? { ...held, jump: true } : held;
    jumpLatch = false;
    // In a race the race drives the horse: the room's sim, predicted here, and nothing outside the race.
    if (racing.racing()) {
        const state = racing.stepLocal(input);
        if (state) {
            away.setState(state);
            player.x = state.x;
            player.z = state.z;
        }
        return;
    }
    const before = away.state();
    const events = away.step(dt, input);
    const after = away.state();
    if (before && after) {
        keepCourse(before, after, packRideInput(input), events);
        player.x = after.x;
        player.z = after.z;
    }
}
function checkGateway() {
    if (!entered || leaving || !inDownsGateway(player))
        return;
    if (racing.racing())
        return;
    leaving = true;
    keys.clear();
    document.exitPointerLock?.();
    setPrompt("Riding back to the Market Square…");
    status.textContent = "Riding back to the Market Square…";
    presence.disconnect();
    location.href = backUrl(true);
}
window.addEventListener("keydown", (event) => {
    if (panelOpen()) {
        if (event.code === "Escape") {
            board.close();
            racing.closePanels();
        }
        keys.clear();
        return;
    }
    if (entered && chatView.handleKey(event)) {
        keys.clear();
        return;
    }
    if (event.code === "Space" || event.code.startsWith("Arrow"))
        event.preventDefault();
    if (event.code === "Space" && !event.repeat)
        jumpLatch = true;
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
    if (!horse || entered)
        return;
    if (!away.arrive({ x: DOWNS_SPAWN.x, z: DOWNS_SPAWN.z, heading: DOWNS_SPAWN.yaw }))
        return;
    entered = true;
    racing.start();
    music.start();
    startGate.classList.add("is-hidden");
    canvas.focus();
    status.textContent = "W urge on · Shift gallop · Space jump · Click for mouse capture";
    hud.toast(`${horse.name} is ready.`, "Try the Gallop to the north, the rings, or the cross-country from the Green.", 5);
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
// The rider looks where the horse goes unless they are looking about: the view eases back behind the ears.
let lookDrift = 0;
function applyCamera(dt) {
    const ride = away.state();
    if (!ride) {
        camera.position.set(player.x, downsGround(player) + 2.2, player.z);
        camera.rotation.set(player.pitch, player.yaw, 0);
        return;
    }
    const eye = away.eye(riderClock);
    camera.position.set(eye.x, eye.y, eye.z);
    if (!draggingLook && document.pointerLockElement !== canvas) {
        // Without mouse look, keep the view over the horse's head.
        const delta = Math.atan2(Math.sin(ride.heading - player.yaw), Math.cos(ride.heading - player.yaw));
        player.yaw += delta * Math.min(1, dt * 4);
    }
    else {
        lookDrift = 0;
    }
    const fov = BASE_FOV + eye.fovKick;
    if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }
    camera.rotation.set(player.pitch, player.yaw, 0);
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
publishPresence();
presence.connect();
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now) {
    const frameSeconds = Math.min(Math.max(0, (now - previous) / 1000), 0.1);
    accumulator += frameSeconds;
    previous = now;
    while (accumulator >= TICK_SECONDS) {
        updateRider(TICK_SECONDS);
        checkGateway();
        updateInteraction();
        publishPresence();
        racing.tick(TICK_SECONDS);
        accumulator -= TICK_SECONDS;
    }
    riderClock += frameSeconds;
    const focus = away.state() ?? player;
    world.update(frameSeconds, focus);
    visitors.update(frameSeconds, now, racing.visibleMembers(presence.members()));
    away.draw(frameSeconds, riderClock, visitors.placements());
    racing.draw(frameSeconds, riderClock);
    chatView.tick();
    hud.render(away.state(), away.profile(), racing.racing() ? racing.run() : run);
    const ride = away.state();
    map.draw(ride ? { x: ride.x, z: ride.z, heading: ride.heading } : null, presence.members().map((member) => ({ x: member.pose.x, z: member.pose.z, racing: member.pose.activity.startsWith("racing") })), racing.racing() ? racing.courseId() : run?.phase === "running" ? run.courseId : null);
    applyCamera(frameSeconds);
    resize();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
// Read-only handle for headless verification. Nothing in the page uses it.
globalThis.__downs = Object.freeze({
    pose: () => ({ ...player }),
    ride: () => away.state(),
    profile: () => away.profile(),
    run: () => run,
    horse: () => horse?.instanceId ?? "",
    entered: () => entered,
    racing: () => racing.debug(),
});
void lookDrift;
applyCamera(0);
requestAnimationFrame(frame);
