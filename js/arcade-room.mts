import * as THREE_VENDOR from "./vendor/three.module.js";
import { CABINET_CATALOG, getCabinetFootprint, getCabinetLaunchUrl } from "./arcade-room-cabinet.mjs";
import { createCabinetRuntime, type CabinetRuntimeInstance } from "./arcade-room-cabinet-runtime.mjs";
import { createRoomEditor } from "./arcade-room-editor.mjs";
import { createArcadeAvatarPreview } from "./arcade-room-avatar-preview.mjs";
import {
  canInteractWithCabinet,
  closeCabinetSession,
  createCabinetSession,
  findInteractiveDecor,
  getCabinetPrompt,
  getVisitorPrompt,
  openCabinetSession,
  spawnOffsetForCompany,
  type InteractiveDecorHit,
} from "./arcade-room-interaction.mjs";
import { createRoomPresence, type RemoteMember } from "./arcade-room-presence.mjs";
import { createRoomVisitors } from "./arcade-room-visitors.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createDecorOverlay } from "./arcade-room-decor-overlay.mjs";
import { JUKEBOX_ITEM_ID, createRoomJukebox } from "./arcade-room-jukebox.mjs";
import { pulseJukeboxGlow } from "./arcade-room-decor-model.mjs";
import { createRoomInventory } from "./arcade-room-catalog/inventory.mjs";
import { createDecorRuntime } from "./arcade-room-decor-runtime.mjs";
import { visibleRoomItems, worldPointFromPlacement } from "./arcade-room-layout.mjs";
import { createRoomShell } from "./arcade-room-shell.mjs";
import { createRoomLayoutStore } from "./arcade-room-store.mjs";
import { BATTLESHITS_PLAY_VIEW, CABINET_PLAY_VIEW, COCKPIT_SWARM_PLAY_VIEW, LOVERS_LOST_PLAY_VIEW, PLAYER_ROOM_SHELL, SHARK_HALL_PLAY_VIEW, SUMORAI_PLAY_VIEW, YAM_BOWLING_PLAY_VIEW } from "./arcade-room-scene.mjs";
import { playScreenRect } from "./arcade-room-screen.mjs";

const THREE: any = THREE_VENDOR;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Arcade room is missing ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#roomCanvas");
const prompt = requiredElement<HTMLElement>("#cabinetPrompt");
const startGate = requiredElement<HTMLElement>("#startGate");
const playLayer = requiredElement<HTMLElement>("#cabinetPlayLayer");
const gameFrame = requiredElement<HTMLIFrameElement>("#cabinetGame");
const gameScreen = requiredElement<HTMLElement>("#cabinetGameScreen");
const leaveButton = requiredElement<HTMLButtonElement>("#leaveCabinet");
const fullscreenButton = requiredElement<HTMLButtonElement>("#fullscreenCabinet");
const decorOverlayLayer = requiredElement<HTMLElement>("#decorOverlay");
const decorOverlayFrame = requiredElement<HTMLIFrameElement>("#decorOverlayFrame");
const decorOverlayTitle = requiredElement<HTMLElement>("#decorOverlayTitle");
const decorOverlayClose = requiredElement<HTMLButtonElement>("#closeDecorOverlay");
const jukeboxChip = requiredElement<HTMLElement>("#jukeboxNowPlaying");
const jukeboxChipTitle = requiredElement<HTMLElement>("#jukeboxNowPlayingTitle");
const enterButton = requiredElement<HTMLButtonElement>("#enterShowroom");
const status = requiredElement<HTMLElement>("#roomStatus");
const editorPanel = requiredElement<HTMLElement>("#roomEditor");
const editArcadeButton = requiredElement<HTMLButtonElement>("#editArcade");
const fullscreenRoomButton = requiredElement<HTMLButtonElement>("#fullscreenRoom");
const rotateLeftButton = requiredElement<HTMLButtonElement>("#rotateCabinetLeft");
const rotateRightButton = requiredElement<HTMLButtonElement>("#rotateCabinetRight");
const resetLayoutButton = requiredElement<HTMLButtonElement>("#resetRoomLayout");
const saveLayoutButton = requiredElement<HTMLButtonElement>("#saveRoomLayout");
const finishEditingButton = requiredElement<HTMLButtonElement>("#finishEditing");
const editorStatus = requiredElement<HTMLElement>("#editorStatus");
const undoButton = requiredElement<HTMLButtonElement>("#undoRoomEdit");
const cabinetList = requiredElement<HTMLElement>("#cabinetList");
const editorTabs = requiredElement<HTMLElement>("#editorTabs");
const editorTabPanels = requiredElement<HTMLElement>("#editorTabPanels");
const surfacePicker = requiredElement<HTMLElement>("#surfacePicker");
const decorCategories = requiredElement<HTMLElement>("#decorCategories");
const decorCatalog = requiredElement<HTMLElement>("#decorCatalog");
const decorInspector = requiredElement<HTMLElement>("#decorInspector");
const decorPlaced = requiredElement<HTMLElement>("#decorPlaced");
const avatarPicker = requiredElement<HTMLElement>("#avatarPicker");
const avatarPreviewCanvas = requiredElement<HTMLCanvasElement>("#avatarPreview");
const avatarCaption = requiredElement<HTMLElement>("#avatarCaption");
const editorDrawer = requiredElement<HTMLElement>("#editorDrawer");
const viewButtons = requiredElement<HTMLElement>("#cameraViews");
const roomTitle = requiredElement<HTMLElement>("#roomTitle");
const roomEyebrow = requiredElement<HTMLElement>("#roomEyebrow");
const startTag = requiredElement<HTMLElement>("#startTag");
const startHeading = requiredElement<HTMLElement>("#startHeading");
const startCopy = requiredElement<HTMLElement>("#startCopy");
const ownerLink = requiredElement<HTMLAnchorElement>("#roomOwnerLink");
const visitorsChip = requiredElement<HTMLElement>("#roomVisitors");
const visitorsChipLabel = requiredElement<HTMLElement>("#roomVisitorsLabel");
const visitorsChipNames = requiredElement<HTMLElement>("#roomVisitorsNames");

// Whose room this is. `?id=` names a player to visit; without it, this is the
// signed-in player's own room (or a local-only room when signed out). The store
// decides which, and everything below asks it rather than re-deriving the answer.
const visitPlayerId = new URLSearchParams(location.search).get("id") ?? "";
const layoutStore = createRoomLayoutStore({ visitPlayerId });
const visiting = layoutStore.mode === "visitor";
const loaded = await layoutStore.load();

function applyRoomIdentity(): void {
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
    startCopy.textContent = "Walk up to play Bird Duty, Lovers Lost, Sumorai, Battleshits, Cockpit Swarm's twin-seat machine, the Yam Bowling lane, the Shark Hall pool table, Puck'd Up air hockey, or the Mini Hoops carnival machine, then build the room out — floors, walls, neon and decor. Sign in to keep it on your account so friends can visit it.";
  }
}
applyRoomIdentity();

let renderer: any;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
} catch {
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

type CabinetPlayView = Readonly<{
  position?: Readonly<{ x: number; y: number; z: number }>;
  fov?: number;
  screen?: Readonly<{ width: number; height: number; y: number; z: number }>;
  gameAspect: number;
}>;
const playViews: Readonly<Record<string, CabinetPlayView>> = Object.freeze({
  "bird-duty": CABINET_PLAY_VIEW,
  "lovers-lost": LOVERS_LOST_PLAY_VIEW,
  "sumorai": SUMORAI_PLAY_VIEW,
  "battleshits": BATTLESHITS_PLAY_VIEW,
  "yam-bowling": YAM_BOWLING_PLAY_VIEW,
  "shark-hall": SHARK_HALL_PLAY_VIEW,
  "cockpit-swarm": COCKPIT_SWARM_PLAY_VIEW,
});

const cabinetRuntime = createCabinetRuntime(THREE, scene, CABINET_CATALOG);
cabinetRuntime.sync(loaded.layout);
const avatarPreview = createArcadeAvatarPreview(THREE, avatarPreviewCanvas);
avatarPreview.show(loaded.layout.avatarId);
const cabinetPlayView = (cabinet: CabinetRuntimeInstance): CabinetPlayView => playViews[cabinet.definition.gameSlug] ?? CABINET_PLAY_VIEW;

const keys = new Set<string>();
let session = createCabinetSession(CABINET_CATALOG[0].id);
let interactionReady = false;
let nearbyCabinet: CabinetRuntimeInstance | null = null;
let nearbyDecor: InteractiveDecorHit | null = null;
let nearbyVisitor: RemoteMember | null = null;
/** Set by updatePlayer on any tick the player actually moved; read by the pose publisher. */
let playerMoved = false;
let activeCabinet: CabinetRuntimeInstance | null = null;
let playing = false;
/** The game fills the viewport instead of the cabinet's screen. */
let playFullscreen = false;
let roomEntered = false;
let draggingLook = false;
let prePlayView: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number } | null = null;

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
    if (result.ok && result.target === "account") return { ok: true, message: "Saved to your account. Friends can visit this room." };
    if (result.ok) return { ok: true, message: "Saved on this device only. Sign in to keep it on your account." };
    if (result.target === "account") return { ok: false, message: "Kept on this device, but the account save failed. Try again in a moment." };
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
    avatarCaption,
    drawer: editorDrawer,
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
    // Bodies would sit under the editor's picking rays and the top-down camera; they come back with the walk.
    visitors.setVisible(!editing);
    // The walking fog closes in at 27 m for mood; the build camera stands up to 22 m
    // outside a 20 m room and would see nothing but fog colour, so it lifts too.
    scene.fog.near = editing ? WALKING_FOG.near * 4 : WALKING_FOG.near;
    scene.fog.far = editing ? WALKING_FOG.far * 4 : WALKING_FOG.far;
    if (editing) {
      roomEntered = true;
      startGate.classList.add("is-hidden");
      status.textContent = "Build mode · drag cabinets to place · B to walk again";
    } else {
      status.textContent = "Click the room to look around again · B to build";
    }
  },
});

// Everyone else standing in this arcade. The room is keyed by its OWNER's player id so the
// owner and every guest share one roster; a signed-out player's own room has no id and so
// no company — it is a room nobody else can reach anyway. A signed-out guest still counts:
// their local factory profile names them and they wear the default body.
const visitors = createRoomVisitors(THREE, scene);
const factoryProfile = loadFactoryProfile();
const presenceName = factoryProfile.profileName || "Player";
const presence = createRoomPresence({
  roomId: layoutStore.ownerPlayerId,
  identity: {
    playerId: factoryProfile.playerId,
    displayName: presenceName,
    avatarId: visiting ? "" : loaded.layout.avatarId,
  },
});
let presenceAvatarId = visiting ? "" : loaded.layout.avatarId;

function renderVisitorsChip(): void {
  const members = presence.members();
  const status = presence.status();
  const hidden = members.length === 0 && status !== "full";
  visitorsChip.hidden = hidden;
  if (hidden) return;
  if (status === "full") {
    visitorsChipLabel.textContent = "ARCADE FULL";
    visitorsChipNames.textContent = "Too many people are in here right now.";
    return;
  }
  visitorsChipLabel.textContent = `HERE NOW · ${members.length}`;
  visitorsChipNames.textContent = members
    .map((member) => (member.pose.activity ? `${member.displayName} (${member.pose.activity})` : member.displayName))
    .join(" · ");
}

presence.onChange(() => {
  visitors.sync(presence.members());
  renderVisitorsChip();
});
window.addEventListener("pagehide", () => presence.disconnect());
// A page restored from the back/forward cache comes back with the socket it left with: closed.
window.addEventListener("pageshow", () => presence.connect());
if (visiting) {
  // A guest's body is on their own layout, which a visit never loads.
  void layoutStore.loadSelfAvatarId().then((avatarId) => {
    presenceAvatarId = avatarId;
    presence.setIdentity({ playerId: factoryProfile.playerId, displayName: presenceName, avatarId });
  });
}

function publishPresence(): void {
  // A change of body in build mode reaches the others as a rejoin.
  const avatarId = roomEditor.getLayout().avatarId;
  if (!visiting && avatarId !== presenceAvatarId) {
    presenceAvatarId = avatarId;
    presence.setIdentity({ playerId: factoryProfile.playerId, displayName: presenceName, avatarId });
  }
  presence.publishPose({
    x: player.x,
    z: player.z,
    yaw: player.yaw,
    moving: playerMoved,
    activity: playing && activeCabinet ? activeCabinet.definition.title : roomEditor.isEditing() ? "building" : "",
  });
}

// The join carries this pose, so the others see the spawn point and not the origin.
publishPresence();
presence.connect();

let lastWaveAt = 0;
/** The prompt shows the wave went out until this time; the waver has no body of their own to see it on. */
let waveFeedbackUntil = 0;
let waveFeedbackText = "";
function waveAtVisitor(): void {
  if (!nearbyVisitor || playing || decorOverlay.isOpen() || roomEditor.isEditing()) return;
  const now = performance.now();
  if (now - lastWaveAt < 1200) return;
  lastWaveAt = now;
  presence.emote("wave");
  waveFeedbackText = `👋 You waved at ${nearbyVisitor.displayName}`;
  waveFeedbackUntil = now + 1400;
  prompt.textContent = waveFeedbackText;
  status.textContent = `You waved at ${nearbyVisitor.displayName}`;
}

function applyCamera(): void {
  if (roomEditor.isEditing()) return;
  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function forwardVector(): { x: number; z: number } {
  return { x: -Math.sin(player.yaw), z: -Math.cos(player.yaw) };
}

function updateInteraction(): void {
  nearbyCabinet = null;
  let nearestDistance = Infinity;
  for (const cabinet of cabinetRuntime.instances()) {
    const placement = roomEditor.getCabinetPlacement(cabinet.instanceId);
    if (!placement) continue;
    const cabinetForward = worldPointFromPlacement(placement, { x: 0, z: 1 });
    const canInteract = canInteractWithCabinet(
      { x: player.x, z: player.z, forward: forwardVector() },
      {
        position: { x: placement.x, z: placement.z },
        forward: { x: cabinetForward.x - placement.x, z: cabinetForward.z - placement.z },
        radius: cabinet.definition.interaction.radius,
        facingThreshold: cabinet.definition.interaction.facingThreshold,
      },
    );
    const distance = Math.hypot(player.x - placement.x, player.z - placement.z);
    if (canInteract && distance < nearestDistance) {
      nearbyCabinet = cabinet;
      nearestDistance = distance;
    }
  }
  // A cabinet wins when both are in reach; otherwise any interactive decor (the calendar).
  nearbyDecor = nearbyCabinet ? null : findInteractiveDecor(roomEditor.getLayout().decor, { x: player.x, z: player.z, forward: forwardVector() });
  // A person comes last: the room's things are what E is for, a wave is the courtesy on top.
  nearbyVisitor = nearbyCabinet || nearbyDecor ? null : visitors.nearest({ x: player.x, z: player.z, forward: forwardVector() });
  interactionReady = Boolean(nearbyCabinet || nearbyDecor || nearbyVisitor);
  const waving = performance.now() < waveFeedbackUntil;
  prompt.textContent = !roomEntered
    ? ""
    : waving
      ? waveFeedbackText
      : nearbyCabinet
        ? getCabinetPrompt(true, nearbyCabinet.definition.title)
        : nearbyDecor
          ? nearbyDecor.definition.interaction?.prompt ?? ""
          : nearbyVisitor
            ? getVisitorPrompt(nearbyVisitor.displayName)
            : "";
  prompt.classList.toggle("is-visible", (interactionReady || waving) && !playing && !decorOverlay.isOpen());
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

function openDecor(): void {
  if (!nearbyDecor || playing || decorOverlay.isOpen() || roomEditor.isEditing()) return;
  if (nearbyDecor.item.itemId === JUKEBOX_ITEM_ID) jukebox.attach(nearbyDecor.item.instanceId);
  decorOverlay.open(nearbyDecor.definition);
}

// The whole page goes fullscreen, not the canvas, so the header, hint and editor overlays
// keep working on top of it. A cabinet's own fullscreen nests inside this one: leaving the
// game pops back to the fullscreen room rather than out to the browser.
function isRoomFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

function setRoomFullscreen(on: boolean): void {
  if (on) {
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  } else if (isRoomFullscreen()) {
    document.exitFullscreen?.().catch(() => undefined);
  }
}

function syncRoomFullscreenButton(): void {
  const on = isRoomFullscreen();
  fullscreenRoomButton.setAttribute("aria-pressed", String(on));
  fullscreenRoomButton.innerHTML = on ? "Exit fullscreen <kbd>F</kbd>" : "Fullscreen <kbd>F</kbd>";
}

function setPlayFullscreen(on: boolean): void {
  playFullscreen = on;
  playLayer.classList.toggle("is-fullscreen", on);
  fullscreenButton.setAttribute("aria-pressed", String(on));
  fullscreenButton.textContent = on ? "Exit fullscreen" : "Fullscreen";
  // Real browser fullscreen when the page is allowed it; the viewport-fill layout above does
  // not depend on the answer, so an embed that refuses still gets a full-window game.
  if (on) {
    playLayer.requestFullscreen?.().catch(() => undefined);
  } else if (document.fullscreenElement === playLayer) {
    document.exitFullscreen?.().catch(() => undefined);
  }
  if (playing) gameFrame.focus();
}

function openCabinet(): void {
  if (!interactionReady || !nearbyCabinet || playing || roomEditor.isEditing()) return;
  if (decorOverlay.isOpen()) return;
  activeCabinet = nearbyCabinet;
  session = openCabinetSession(createCabinetSession(activeCabinet.definition.id));
  playing = true;
  jukebox.suspend();
  prePlayView = { ...player, fov: camera.fov };
  const placement = roomEditor.getCabinetPlacement(activeCabinet.instanceId);
  if (!placement) return;
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
  if (activeCabinet.screen) activeCabinet.screen.visible = false;
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
  if (launchFullscreen) setPlayFullscreen(true);
  prompt.classList.remove("is-visible");
}

function closeCabinet(): void {
  if (!playing) return;
  setPlayFullscreen(false);
  session = closeCabinetSession(session);
  playing = false;
  jukebox.resume();
  gameFrame.src = "about:blank";
  playLayer.hidden = true;
  playLayer.setAttribute("aria-hidden", "true");
  fullscreenButton.hidden = false;
  document.body.classList.remove("is-playing");
  if (activeCabinet?.screen) activeCabinet.screen.visible = true;
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
  if (!document.fullscreenElement && playFullscreen && activeCabinet?.definition.launchMode !== "fullscreen") setPlayFullscreen(false);
});
gameFrame.addEventListener("load", () => {
  if (playing) gameFrame.focus();
});
window.addEventListener("keydown", (event) => {
  if (roomEditor.isEditing()) return;
  if (playing) {
    if (event.code === "Escape") {
      if (activeCabinet?.definition.launchMode === "fullscreen") closeCabinet();
      else if (playFullscreen) setPlayFullscreen(false);
      else closeCabinet();
    }
    return;
  }
  if (decorOverlay.isOpen()) {
    if (event.code === "Escape") decorOverlay.close();
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
    if (nearbyCabinet) openCabinet();
    else if (nearbyDecor) openDecor();
    else waveAtVisitor();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());

canvas.addEventListener("click", () => {
  if (!playing && !decorOverlay.isOpen() && !roomEditor.isEditing() && roomEntered) canvas.requestPointerLock?.().catch(() => undefined);
});
enterButton.addEventListener("click", () => {
  if (playing) return;
  const firstEntry = !roomEntered;
  // Step aside from anyone already standing on the spawn point.
  if (firstEntry) player.x += spawnOffsetForCompany({ x: player.x, z: player.z }, presence.members());
  roomEntered = true;
  startGate.classList.add("is-hidden");
  canvas.focus();
  status.textContent = "WASD to move · Drag to look · Click for mouse capture";
  // The house record starts here and not on load: this click is the gesture autoplay wants.
  if (firstEntry && !jukebox.status().playing) jukebox.playDefault();
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
  if ((document.pointerLockElement !== canvas && !draggingLook) || playing || decorOverlay.isOpen() || roomEditor.isEditing()) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch - event.movementY * 0.0018, -1.1, 1.05);
});

function updatePlayer(dt: number): void {
  playerMoved = false;
  if (playing || decorOverlay.isOpen() || roomEditor.isEditing() || !roomEntered) return;
  const forward = forwardVector();
  const right = { x: -forward.z, z: forward.x };
  let moveX = 0;
  let moveZ = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) { moveX += forward.x; moveZ += forward.z; }
  if (keys.has("KeyS") || keys.has("ArrowDown")) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys.has("KeyD") || keys.has("ArrowRight")) { moveX += right.x; moveZ += right.z; }
  if (keys.has("KeyA") || keys.has("ArrowLeft")) { moveX -= right.x; moveZ -= right.z; }
  const length = Math.hypot(moveX, moveZ);
  if (!length) return;
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
    playerMoved = nextX !== player.x || nextZ !== player.z;
    player.x = nextX;
    player.z = nextZ;
  }
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

function positionGameOnCabinetScreen(): void {
  if (!playing || !activeCabinet) return;
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
  if (!placement) return;
  if (!playView.screen) return;
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
  const xValues = corners.map((point: any) => (point.x + 1) * 0.5 * canvas.clientWidth);
  const yValues = corners.map((point: any) => (1 - point.y) * 0.5 * canvas.clientHeight);
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
function frame(now: number): void {
  const frameSeconds = Math.min((now - previous) / 1000, 0.1);
  accumulator += frameSeconds;
  previous = now;
  while (accumulator >= TICK_SECONDS) {
    updatePlayer(TICK_SECONDS);
    updateInteraction();
    publishPresence();
    // Undo, reset and a fresh load all change the house record under the player; the layout is the truth.
    jukebox.setDefaultTrack(roomEditor.getLayout().music.defaultTrackId);
    jukebox.update(player, roomEditor.getLayout().decor);
    accumulator -= TICK_SECONDS;
  }
  visitors.update(frameSeconds, now, presence.members());
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
