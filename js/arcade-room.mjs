import * as THREE_VENDOR from "./vendor/three.module.js";
import { CABINET_CATALOG, getCabinetFootprint, getCabinetLaunchUrl } from "./arcade-room-cabinet.mjs";
import { createCabinetRuntime } from "./arcade-room-cabinet-runtime.mjs";
import { createRoomEditor } from "./arcade-room-editor.mjs";
import { createArcadeAvatarPreview } from "./arcade-room-avatar-preview.mjs";
import { canInteractWithCabinet, closeCabinetSession, createCabinetSession, findInteractiveDecor, getCabinetPrompt, openCabinetSession, } from "./arcade-room-interaction.mjs";
import { createDecorOverlay } from "./arcade-room-decor-overlay.mjs";
import { JUKEBOX_ITEM_ID, createRoomJukebox } from "./arcade-room-jukebox.mjs";
import { pulseJukeboxGlow } from "./arcade-room-decor-model.mjs";
import { createRoomInventory } from "./arcade-room-catalog/inventory.mjs";
import { createDecorRuntime } from "./arcade-room-decor-runtime.mjs";
import { visibleRoomItems, worldPointFromPlacement } from "./arcade-room-layout.mjs";
import { createRoomShell } from "./arcade-room-shell.mjs";
import { createRoomLayoutStore } from "./arcade-room-store.mjs";
import { CABINET_PLAY_VIEW, LOVERS_LOST_PLAY_VIEW, PLAYER_ROOM_SHELL, SHARK_HALL_PLAY_VIEW, SUMORAI_PLAY_VIEW, YAM_BOWLING_PLAY_VIEW } from "./arcade-room-scene.mjs";
import { playScreenRect } from "./arcade-room-screen.mjs";
const THREE = THREE_VENDOR;
function requiredElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Arcade room is missing ${selector}`);
    return element;
}
const canvas = requiredElement("#roomCanvas");
const prompt = requiredElement("#cabinetPrompt");
const startGate = requiredElement("#startGate");
const playLayer = requiredElement("#cabinetPlayLayer");
const gameFrame = requiredElement("#cabinetGame");
const gameScreen = requiredElement("#cabinetGameScreen");
const leaveButton = requiredElement("#leaveCabinet");
const fullscreenButton = requiredElement("#fullscreenCabinet");
const decorOverlayLayer = requiredElement("#decorOverlay");
const decorOverlayFrame = requiredElement("#decorOverlayFrame");
const decorOverlayTitle = requiredElement("#decorOverlayTitle");
const decorOverlayClose = requiredElement("#closeDecorOverlay");
const jukeboxChip = requiredElement("#jukeboxNowPlaying");
const jukeboxChipTitle = requiredElement("#jukeboxNowPlayingTitle");
const enterButton = requiredElement("#enterShowroom");
const status = requiredElement("#roomStatus");
const editorPanel = requiredElement("#roomEditor");
const editArcadeButton = requiredElement("#editArcade");
const fullscreenRoomButton = requiredElement("#fullscreenRoom");
const rotateLeftButton = requiredElement("#rotateCabinetLeft");
const rotateRightButton = requiredElement("#rotateCabinetRight");
const resetLayoutButton = requiredElement("#resetRoomLayout");
const saveLayoutButton = requiredElement("#saveRoomLayout");
const finishEditingButton = requiredElement("#finishEditing");
const editorStatus = requiredElement("#editorStatus");
const undoButton = requiredElement("#undoRoomEdit");
const cabinetList = requiredElement("#cabinetList");
const editorTabs = requiredElement("#editorTabs");
const editorTabPanels = requiredElement("#editorTabPanels");
const surfacePicker = requiredElement("#surfacePicker");
const decorCategories = requiredElement("#decorCategories");
const decorCatalog = requiredElement("#decorCatalog");
const decorInspector = requiredElement("#decorInspector");
const decorPlaced = requiredElement("#decorPlaced");
const avatarPicker = requiredElement("#avatarPicker");
const avatarPreviewCanvas = requiredElement("#avatarPreview");
const viewButtons = requiredElement("#cameraViews");
const roomTitle = requiredElement("#roomTitle");
const roomEyebrow = requiredElement("#roomEyebrow");
const startTag = requiredElement("#startTag");
const startHeading = requiredElement("#startHeading");
const startCopy = requiredElement("#startCopy");
const ownerLink = requiredElement("#roomOwnerLink");
// Whose room this is. `?id=` names a player to visit; without it, this is the
// signed-in player's own room (or a local-only room when signed out). The store
// decides which, and everything below asks it rather than re-deriving the answer.
const visitPlayerId = new URLSearchParams(location.search).get("id") ?? "";
const layoutStore = createRoomLayoutStore({ visitPlayerId });
const visiting = layoutStore.mode === "visitor";
const loaded = await layoutStore.load();
function applyRoomIdentity() {
    document.body.classList.toggle("is-visiting", visiting);
    const floorCount = visibleRoomItems(loaded.layout).length;
    const cabinetCount = `${floorCount} CABINET${floorCount === 1 ? "" : "S"}`;
    if (visiting) {
        const ownerName = loaded.ownerName || "Player";
        document.title = `${ownerName}'s Arcade | Javascript Game Factory`;
        roomEyebrow.textContent = `VISITING · ${cabinetCount}`;
        roomTitle.textContent = `${ownerName}'s Arcade`;
        startTag.textContent = "YOU ARE A GUEST HERE";
        startHeading.textContent = `Step into ${ownerName}'s arcade.`;
        startCopy.textContent = loaded.source === "account"
            ? "Walk the room they built and play any cabinet on the floor."
            : "They have not arranged their room yet, so this is the starter floor. Every cabinet still plays.";
        enterButton.textContent = "Enter the arcade";
        editArcadeButton.hidden = true;
        ownerLink.href = `../player/index.html?id=${encodeURIComponent(layoutStore.ownerPlayerId)}`;
        ownerLink.hidden = false;
        status.textContent = "Click to capture the mouse · WASD to move · E to play";
        return;
    }
    roomEyebrow.textContent = `PERSONAL SPACE · ${cabinetCount}`;
    ownerLink.hidden = true;
    if (!layoutStore.accountBacked) {
        startCopy.textContent = "Walk up to play Bird Duty, Lovers Lost, Sumorai, the Yam Bowling lane, or the Shark Hall pool table, then build the room out — floors, walls, neon and decor. Sign in to keep it on your account so friends can visit it.";
    }
}
applyRoomIdentity();
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
}
catch {
    status.textContent = "This room needs WebGL to render the cabinet.";
    startGate.dataset.state = "error";
    throw new Error("WebGL is unavailable");
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07101b);
const WALKING_FOG = Object.freeze({ near: 12, far: 27 });
scene.fog = new THREE.Fog(0x07101b, WALKING_FOG.near, WALKING_FOG.far);
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 40);
camera.rotation.order = "YXZ";
const player = { x: 0, y: 1.68, z: -0.8, yaw: 0, pitch: -0.03 };
const hemisphere = new THREE.HemisphereLight(0x8fd7ff, 0x101018, 1.8);
scene.add(hemisphere);
const keyLight = new THREE.DirectionalLight(0xfff2d1, 2.6);
keyLight.position.set(3.5, 6.8, 4.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);
// The shell — floor, walls, ceiling, trim — is built once and re-dressed from
// the layout's surfaces; the neon that used to be hardcoded here is starter decor.
const shell = createRoomShell(THREE, scene, {
    width: PLAYER_ROOM_SHELL.width,
    depth: PLAYER_ROOM_SHELL.depth,
    height: PLAYER_ROOM_SHELL.height,
    wallThickness: PLAYER_ROOM_SHELL.wallThickness,
});
const { floor, ceiling } = shell;
const roomHalfWidth = PLAYER_ROOM_SHELL.width / 2;
const roomHalfDepth = PLAYER_ROOM_SHELL.depth / 2;
// The placement grid only shows in build mode: it is a tool, not a floor.
const grid = new THREE.GridHelper(PLAYER_ROOM_SHELL.width, 40, 0x297697, 0x1d3447);
grid.position.y = 0.004;
grid.visible = false;
scene.add(grid);
const decorRuntime = createDecorRuntime(THREE, scene);
// Everything in the catalog is granted in this phase; see arcade-room-catalog/inventory.mts.
const inventory = createRoomInventory({ grantAll: true });
const playViews = Object.freeze({
    "bird-duty": CABINET_PLAY_VIEW,
    "lovers-lost": LOVERS_LOST_PLAY_VIEW,
    "sumorai": SUMORAI_PLAY_VIEW,
    "yam-bowling": YAM_BOWLING_PLAY_VIEW,
    "shark-hall": SHARK_HALL_PLAY_VIEW,
});
const cabinetRuntime = createCabinetRuntime(THREE, scene, CABINET_CATALOG);
cabinetRuntime.sync(loaded.layout);
const avatarPreview = createArcadeAvatarPreview(THREE, avatarPreviewCanvas);
avatarPreview.show(loaded.layout.avatarId);
const cabinetPlayView = (cabinet) => playViews[cabinet.definition.gameSlug] ?? CABINET_PLAY_VIEW;
const keys = new Set();
let session = createCabinetSession(CABINET_CATALOG[0].id);
let interactionReady = false;
let nearbyCabinet = null;
let nearbyDecor = null;
let activeCabinet = null;
let playing = false;
/** The game fills the viewport instead of the cabinet's screen. */
let playFullscreen = false;
let roomEntered = false;
let draggingLook = false;
let prePlayView = null;
const roomEditor = createRoomEditor({
    THREE,
    scene,
    camera,
    canvas,
    shell,
    decor: decorRuntime,
    cabinetRuntime,
    inventory,
    cabinets: CABINET_CATALOG.map((cabinet) => ({
        cabinet,
        footprint: getCabinetFootprint(cabinet),
    })),
    room: {
        width: PLAYER_ROOM_SHELL.width,
        depth: PLAYER_ROOM_SHELL.depth,
        // The cabinet's padded footprint may come within 2 cm of the inner wall face.
        // The old full-thickness + 28 cm inset created a conspicuous dead strip.
        wallInset: PLAYER_ROOM_SHELL.wallThickness / 2 + 0.02,
        height: PLAYER_ROOM_SHELL.height,
        wallThickness: PLAYER_ROOM_SHELL.wallThickness,
    },
    initialLayout: loaded.layout,
    // The store owns where a save lands — the account when signed in, this device otherwise —
    // and the message here says which, so the player is never told a save happened that
    // never left the tab.
    persist: async (layout) => {
        const result = await layoutStore.save(layout);
        if (result.ok && result.target === "account")
            return { ok: true, message: "Saved to your account. Friends can visit this room." };
        if (result.ok)
            return { ok: true, message: "Saved on this device only. Sign in to keep it on your account." };
        if (result.target === "account")
            return { ok: false, message: "Kept on this device, but the account save failed. Try again in a moment." };
        return { ok: false, message: "This browser could not save the layout." };
    },
    // A picture can only be hung on an account-backed room; otherwise the inspector says to sign in.
    uploadPicture: layoutStore.accountBacked ? (file) => layoutStore.uploadPicture(file) : null,
    avatarPreview,
    elements: {
        panel: editorPanel,
        editButton: editArcadeButton,
        cabinetList,
        tabs: editorTabs,
        tabPanels: editorTabPanels,
        surfacePicker,
        decorCategories,
        decorCatalog,
        decorInspector,
        decorPlaced,
        avatarPicker,
        undoButton,
        rotateLeftButton,
        rotateRightButton,
        resetButton: resetLayoutButton,
        saveButton: saveLayoutButton,
        finishButton: finishEditingButton,
        status: editorStatus,
        viewButtons,
    },
    // A visitor can look but never build: the store has no write path for them either.
    canEnter: () => !playing && !decorOverlay.isOpen() && !visiting,
    onEditingChange: (editing) => {
        keys.clear();
        // Roof off while building: the overview and top-down views look into the room from
        // above the ceiling, which would otherwise be all they could see.
        ceiling.visible = !editing;
        grid.visible = editing;
        // The walking fog closes in at 27 m for mood; the build camera stands up to 22 m
        // outside a 20 m room and would see nothing but fog colour, so it lifts too.
        scene.fog.near = editing ? WALKING_FOG.near * 4 : WALKING_FOG.near;
        scene.fog.far = editing ? WALKING_FOG.far * 4 : WALKING_FOG.far;
        if (editing) {
            roomEntered = true;
            startGate.classList.add("is-hidden");
            status.textContent = "Build mode · drag cabinets to place · B to walk again";
        }
        else {
            status.textContent = "Click the room to look around again · B to build";
        }
    },
});
function applyCamera() {
    if (roomEditor.isEditing())
        return;
    camera.position.set(player.x, player.y, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
}
function forwardVector() {
    return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
}
function updateInteraction() {
    nearbyCabinet = null;
    let nearestDistance = Infinity;
    for (const cabinet of cabinetRuntime.instances()) {
        const placement = roomEditor.getCabinetPlacement(cabinet.instanceId);
        if (!placement)
            continue;
        const cabinetForward = worldPointFromPlacement(placement, { x: 0, z: 1 });
        const canInteract = canInteractWithCabinet({ x: player.x, z: player.z, forward: forwardVector() }, {
            position: { x: placement.x, z: placement.z },
            forward: { x: cabinetForward.x - placement.x, z: cabinetForward.z - placement.z },
            radius: cabinet.definition.interaction.radius,
            facingThreshold: cabinet.definition.interaction.facingThreshold,
        });
        const distance = Math.hypot(player.x - placement.x, player.z - placement.z);
        if (canInteract && distance < nearestDistance) {
            nearbyCabinet = cabinet;
            nearestDistance = distance;
        }
    }
    // A cabinet wins when both are in reach; otherwise any interactive decor (the calendar).
    nearbyDecor = nearbyCabinet ? null : findInteractiveDecor(roomEditor.getLayout().decor, { x: player.x, z: player.z, forward: forwardVector() });
    interactionReady = Boolean(nearbyCabinet || nearbyDecor);
    prompt.textContent = !roomEntered
        ? ""
        : nearbyCabinet
            ? getCabinetPrompt(true, nearbyCabinet.definition.title)
            : nearbyDecor?.definition.interaction?.prompt ?? "";
    prompt.classList.toggle("is-visible", interactionReady && !playing && !decorOverlay.isOpen());
}
// Interactive decor opens its page over the room; the walk resumes where it left off.
const decorOverlay = createDecorOverlay({
    elements: { layer: decorOverlayLayer, frame: decorOverlayFrame, title: decorOverlayTitle, closeButton: decorOverlayClose },
    roomHref: location.href,
    onOpen: () => {
        keys.clear();
        document.exitPointerLock?.();
        document.body.classList.add("is-viewing");
        prompt.classList.remove("is-visible");
    },
    onClose: () => {
        document.body.classList.remove("is-viewing");
        canvas.focus();
        status.textContent = "Click the room to look around again";
    },
});
// The jukebox is the one decor item whose page talks back: the room plays what it picks,
// from the box the player opened, and keeps playing after the overlay closes.
const jukebox = createRoomJukebox({
    siteRoot: new URL("../", location.href).toString(),
    frame: decorOverlayFrame,
    // A guest hears the house record but cannot change it: that is the owner's room.
    canSetDefault: !visiting,
    onSetDefault: (trackId) => { void roomEditor.setDefaultTrack(trackId); },
    onChange: (state) => {
        jukeboxChip.hidden = !state.playing || !state.track;
        jukeboxChipTitle.textContent = state.track ? `${state.track.title} · ${state.track.gameTitle}` : "";
    },
});
jukebox.setDefaultTrack(roomEditor.getLayout().music.defaultTrackId);
function openDecor() {
    if (!nearbyDecor || playing || decorOverlay.isOpen() || roomEditor.isEditing())
        return;
    if (nearbyDecor.item.itemId === JUKEBOX_ITEM_ID)
        jukebox.attach(nearbyDecor.item.instanceId);
    decorOverlay.open(nearbyDecor.definition);
}
// The whole page goes fullscreen, not the canvas, so the header, hint and editor overlays
// keep working on top of it. A cabinet's own fullscreen nests inside this one: leaving the
// game pops back to the fullscreen room rather than out to the browser.
function isRoomFullscreen() {
    return document.fullscreenElement !== null;
}
function setRoomFullscreen(on) {
    if (on) {
        document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
    else if (isRoomFullscreen()) {
        document.exitFullscreen?.().catch(() => undefined);
    }
}
function syncRoomFullscreenButton() {
    const on = isRoomFullscreen();
    fullscreenRoomButton.setAttribute("aria-pressed", String(on));
    fullscreenRoomButton.innerHTML = on ? "Exit fullscreen <kbd>F</kbd>" : "Fullscreen <kbd>F</kbd>";
}
function setPlayFullscreen(on) {
    playFullscreen = on;
    playLayer.classList.toggle("is-fullscreen", on);
    fullscreenButton.setAttribute("aria-pressed", String(on));
    fullscreenButton.textContent = on ? "Exit fullscreen" : "Fullscreen";
    // Real browser fullscreen when the page is allowed it; the viewport-fill layout above does
    // not depend on the answer, so an embed that refuses still gets a full-window game.
    if (on) {
        playLayer.requestFullscreen?.().catch(() => undefined);
    }
    else if (document.fullscreenElement === playLayer) {
        document.exitFullscreen?.().catch(() => undefined);
    }
    if (playing)
        gameFrame.focus();
}
function openCabinet() {
    if (!interactionReady || !nearbyCabinet || playing || roomEditor.isEditing())
        return;
    if (decorOverlay.isOpen())
        return;
    activeCabinet = nearbyCabinet;
    session = openCabinetSession(createCabinetSession(activeCabinet.definition.id));
    playing = true;
    jukebox.suspend();
    prePlayView = { ...player, fov: camera.fov };
    const placement = roomEditor.getCabinetPlacement(activeCabinet.instanceId);
    if (!placement)
        return;
    const launchFullscreen = activeCabinet.definition.launchMode === "fullscreen";
    const playView = cabinetPlayView(activeCabinet);
    if (!launchFullscreen && playView.position && playView.fov !== undefined) {
        const playPosition = worldPointFromPlacement(placement, playView.position);
        Object.assign(player, {
            ...playPosition,
            y: playView.position.y,
            yaw: placement.rotationY,
            pitch: 0,
        });
        camera.fov = playView.fov;
        camera.updateProjectionMatrix();
    }
    if (activeCabinet.screen)
        activeCabinet.screen.visible = false;
    document.body.classList.add("is-playing");
    document.body.style.setProperty("--active-cabinet-accent", activeCabinet.definition.palette.trim);
    document.exitPointerLock?.();
    gameFrame.title = `${activeCabinet.definition.title} arcade game`;
    gameFrame.src = getCabinetLaunchUrl(activeCabinet.definition, location.href, {
        roomId: layoutStore.ownerPlayerId || "local-arcade",
        cabinetInstanceId: activeCabinet.instanceId,
    });
    playLayer.hidden = false;
    playLayer.setAttribute("aria-hidden", "false");
    fullscreenButton.hidden = launchFullscreen;
    if (launchFullscreen)
        setPlayFullscreen(true);
    prompt.classList.remove("is-visible");
}
function closeCabinet() {
    if (!playing)
        return;
    setPlayFullscreen(false);
    session = closeCabinetSession(session);
    playing = false;
    jukebox.resume();
    gameFrame.src = "about:blank";
    playLayer.hidden = true;
    playLayer.setAttribute("aria-hidden", "true");
    fullscreenButton.hidden = false;
    document.body.classList.remove("is-playing");
    if (activeCabinet?.screen)
        activeCabinet.screen.visible = true;
    if (prePlayView) {
        const { fov, ...pose } = prePlayView;
        Object.assign(player, pose);
        camera.fov = fov;
        camera.updateProjectionMatrix();
        prePlayView = null;
    }
    canvas.focus();
    status.textContent = "Click the room to look around again";
    activeCabinet = null;
}
leaveButton.addEventListener("click", closeCabinet);
fullscreenButton.addEventListener("click", () => setPlayFullscreen(!playFullscreen));
fullscreenRoomButton.hidden = !document.fullscreenEnabled;
fullscreenRoomButton.addEventListener("click", () => {
    setRoomFullscreen(!isRoomFullscreen());
    canvas.focus();
});
// The browser's own Esc (or a swipe on a phone) leaves fullscreen without telling us.
document.addEventListener("fullscreenchange", () => {
    syncRoomFullscreenButton();
    // Screenless attractions keep the viewport-fill presentation even when the browser's
    // native fullscreen layer is dismissed. Their next Escape leaves the game entirely.
    if (!document.fullscreenElement && playFullscreen && activeCabinet?.definition.launchMode !== "fullscreen")
        setPlayFullscreen(false);
});
gameFrame.addEventListener("load", () => {
    if (playing)
        gameFrame.focus();
});
window.addEventListener("keydown", (event) => {
    if (roomEditor.isEditing())
        return;
    if (playing) {
        if (event.code === "Escape") {
            if (activeCabinet?.definition.launchMode === "fullscreen")
                closeCabinet();
            else if (playFullscreen)
                setPlayFullscreen(false);
            else
                closeCabinet();
        }
        return;
    }
    if (decorOverlay.isOpen()) {
        if (event.code === "Escape")
            decorOverlay.close();
        return;
    }
    keys.add(event.code);
    if (event.code === "KeyF" && !event.repeat && document.fullscreenEnabled) {
        event.preventDefault();
        setRoomFullscreen(!isRoomFullscreen());
        return;
    }
    if (event.code === "KeyE" && interactionReady) {
        event.preventDefault();
        if (nearbyCabinet)
            openCabinet();
        else
            openDecor();
    }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("click", () => {
    if (!playing && !decorOverlay.isOpen() && !roomEditor.isEditing() && roomEntered)
        canvas.requestPointerLock?.().catch(() => undefined);
});
enterButton.addEventListener("click", () => {
    if (playing)
        return;
    const firstEntry = !roomEntered;
    roomEntered = true;
    startGate.classList.add("is-hidden");
    canvas.focus();
    status.textContent = "WASD to move · Drag to look · Click for mouse capture";
    // The house record starts here and not on load: this click is the gesture autoplay wants.
    if (firstEntry && !jukebox.status().playing)
        jukebox.playDefault();
});
document.addEventListener("pointerlockchange", () => {
    const locked = document.pointerLockElement === canvas;
    startGate.classList.toggle("is-hidden", roomEntered);
    status.textContent = locked
        ? "WASD to move · Mouse to look · E to interact"
        : "WASD to move · Drag to look · Click for mouse capture";
});
canvas.addEventListener("pointerdown", () => { draggingLook = !roomEditor.isEditing(); });
window.addEventListener("pointerup", () => { draggingLook = false; });
document.addEventListener("mousemove", (event) => {
    if ((document.pointerLockElement !== canvas && !draggingLook) || playing || decorOverlay.isOpen() || roomEditor.isEditing())
        return;
    player.yaw -= event.movementX * 0.0022;
    player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.0018, -1.1, 1.05);
});
function updatePlayer(dt) {
    if (playing || decorOverlay.isOpen() || roomEditor.isEditing() || !roomEntered)
        return;
    const forward = forwardVector();
    const right = { x: -forward.z, z: forward.x };
    let moveX = 0;
    let moveZ = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
        moveX += forward.x;
        moveZ += forward.z;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
        moveX -= forward.x;
        moveZ -= forward.z;
    }
    if (keys.has("KeyD") || keys.has("ArrowRight")) {
        moveX += right.x;
        moveZ += right.z;
    }
    if (keys.has("KeyA") || keys.has("ArrowLeft")) {
        moveX -= right.x;
        moveZ -= right.z;
    }
    const length = Math.hypot(moveX, moveZ);
    if (!length)
        return;
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4.3 : 2.65;
    const nextX = THREE.MathUtils.clamp(player.x + (moveX / length) * speed * dt, -roomHalfWidth + 0.55, roomHalfWidth - 0.55);
    const nextZ = THREE.MathUtils.clamp(player.z + (moveZ / length) * speed * dt, -roomHalfDepth + 0.55, roomHalfDepth - 0.55);
    // Cabinets and solid decor alike: one obstacle list, the same one placement uses.
    const blocked = roomEditor.getFloorObstacles().some((obstacle) => {
        const dx = nextX - obstacle.x;
        const dz = nextZ - obstacle.z;
        const cosine = Math.cos(obstacle.rotationY);
        const sine = Math.sin(obstacle.rotationY);
        const localX = dx * cosine - dz * sine;
        const localZ = dx * sine + dz * cosine;
        return Math.abs(localX) < obstacle.footprint.width / 2 + 0.18
            && Math.abs(localZ) < obstacle.footprint.depth / 2 + 0.18;
    });
    if (!blocked) {
        player.x = nextX;
        player.z = nextZ;
    }
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
function positionGameOnCabinetScreen() {
    if (!playing || !activeCabinet)
        return;
    const playView = cabinetPlayView(activeCabinet);
    if (activeCabinet.definition.launchMode === "fullscreen" || playFullscreen) {
        const fitted = playScreenRect({
            fullscreen: true,
            viewport: { width: playLayer.clientWidth, height: playLayer.clientHeight },
            projected: { left: 0, top: 0, width: playLayer.clientWidth, height: playLayer.clientHeight },
            aspect: playView.gameAspect,
        });
        gameScreen.style.left = `${fitted.left}px`;
        gameScreen.style.top = `${fitted.top}px`;
        gameScreen.style.width = `${fitted.width}px`;
        gameScreen.style.height = `${fitted.height}px`;
        return;
    }
    const placement = roomEditor.getCabinetPlacement(activeCabinet.instanceId);
    if (!placement)
        return;
    if (!playView.screen)
        return;
    const { width, height, y, z } = playView.screen;
    const corners = [
        { x: -width / 2, y: y + height / 2 },
        { x: width / 2, y: y + height / 2 },
        { x: -width / 2, y: y - height / 2 },
        { x: width / 2, y: y - height / 2 },
    ].map((corner) => {
        const world = worldPointFromPlacement(placement, { x: corner.x, z });
        return new THREE.Vector3(world.x, corner.y, world.z).project(camera);
    });
    const xValues = corners.map((point) => (point.x + 1) * 0.5 * canvas.clientWidth);
    const yValues = corners.map((point) => (1 - point.y) * 0.5 * canvas.clientHeight);
    const left = Math.min(...xValues);
    const right = Math.max(...xValues);
    const top = Math.min(...yValues);
    const bottom = Math.max(...yValues);
    const fitted = playScreenRect({
        fullscreen: playFullscreen,
        viewport: { width: playLayer.clientWidth, height: playLayer.clientHeight },
        projected: { left, top, width: right - left, height: bottom - top },
        aspect: playView.gameAspect,
    });
    gameScreen.style.left = `${fitted.left}px`;
    gameScreen.style.top = `${fitted.top}px`;
    gameScreen.style.width = `${fitted.width}px`;
    gameScreen.style.height = `${fitted.height}px`;
}
const TICK_SECONDS = 1 / 60;
let previous = performance.now();
let accumulator = 0;
function frame(now) {
    accumulator += Math.min((now - previous) / 1000, 0.1);
    previous = now;
    while (accumulator >= TICK_SECONDS) {
        updatePlayer(TICK_SECONDS);
        updateInteraction();
        // Undo, reset and a fresh load all change the house record under the player; the layout is the truth.
        jukebox.setDefaultTrack(roomEditor.getLayout().music.defaultTrackId);
        jukebox.update(player, roomEditor.getLayout().decor);
        accumulator -= TICK_SECONDS;
    }
    const jukeboxPulse = jukebox.pulse(now);
    for (const instanceId of jukebox.emitterInstanceIds(roomEditor.getLayout().decor)) {
        pulseJukeboxGlow(decorRuntime.modelFor(instanceId), jukeboxPulse);
    }
    applyCamera();
    resize();
    camera.updateMatrixWorld();
    positionGameOnCabinetScreen();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
}
applyCamera();
updateInteraction();
requestAnimationFrame(frame);
