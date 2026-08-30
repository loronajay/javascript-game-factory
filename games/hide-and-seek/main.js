import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { mergeGeometries } from './vendor/utils/BufferGeometryUtils.js';
import { CONFIG, FLASHLIGHT_CONFIG, FLOOR_DEFS, HIDER_CONFIG, ROUND_CONFIG, SANITY_CONFIG, STAMINA_CONFIG, floorY, inspectionViews, keyIdForFloor, keyLabelForFloor } from './modules/game-config.js';
import { createRendering } from './modules/rendering.js';
import { createWorld } from './modules/world.js';
import './modules/performance.js';
import { createFurnishings } from './modules/furnishings.js';
import { createHotel } from './modules/hotel.js';
import { createElevator } from './modules/elevator.js';
import { createPlayer } from './modules/player.js';
import { createFlashlightPickups } from './modules/flashlight-pickups.js';
import { createMonster } from './modules/monster.js';
import { createDemons } from './modules/demons.js';
import { createSanity } from './modules/sanity.js';
import { createStamina } from './modules/stamina.js';
import { createMenu } from './modules/menu.js';
import { createSessionMenuHandler } from './modules/online-session-menu.js';
import { createOnline } from './modules/online.js';
import { createAvatars } from './modules/avatars.js';
import { createSpectator } from './modules/spectator.js';
import { createSoloMatch } from './modules/solo-match.js';
import { createModelViewer } from './modules/model-viewer.js';
import { createPrototypeApi } from './modules/prototype-api.js';
import { createAccountAccess } from './modules/account-access.js';
import { createMapSession, placeAtMapSpawn } from './modules/map-session.js';
// The pure layer loads as classic scripts first, so a missing one fails loudly here rather than as
// an undefined call three frames into a round. Which building it stands: `modules/map-session.js`.
for (const name of ['HotelAvatarLogic', 'HotelCollision', 'HotelControls', 'HotelDemon', 'HotelEnemyLogic', 'HotelFixtures', 'HotelFlashlight', 'HotelHiders', 'HotelLayout', 'HotelMaps', 'HotelMenu', 'HotelMovement', 'HotelMusic', 'HotelOnline', 'HotelPlan', 'HotelRound', 'HotelSanity', 'HotelSeeker', 'HotelSpectator', 'HotelStamina']) {
  if (!window[name]) throw new Error(`Hotel pure module ${name} failed to load`);
}
const mapSession = createMapSession({ maps: window.HotelMaps, window });
const rendering = createRendering({ THREE, document, window, config: CONFIG });
const world = createWorld({ THREE, scene: rendering.scene, materials: rendering.materials, config: CONFIG, layout: window.HotelLayout, logic: window.HotelCollision, plan: window.HotelPlan, document, window });
const elevator = createElevator({
  THREE, scene: rendering.scene, camera: rendering.camera, materials: rendering.materials,
  config: CONFIG, floorY, world, performance: window.HotelPerformance, document, window,
});
const furnishings = createFurnishings({ THREE, materials: rendering.materials, world, keyLabelForFloor });
const hotel = createHotel({
  THREE, scene: rendering.scene, camera: rendering.camera, materials: rendering.materials, config: CONFIG,
  floorY, keyIdForFloor, keyLabelForFloor, floorDefs: FLOOR_DEFS, layout: window.HotelLayout, plan: window.HotelPlan, maps: window.HotelMaps, mapId: mapSession.activeMapId(),
  world, furnishings, elevator, performance: window.HotelPerformance, mergeGeometries,
});
hotel.build();
elevator.build();
placeAtMapSpawn({ camera: rendering.camera, world, spawn: hotel.getPlan().spawns.seeker, eyeHeight: CONFIG.eyeHeight });
const inspectTarget = new URLSearchParams(location.search).get('inspect');
const inspectionView = hotel.getPlan().inspectionViews?.[inspectTarget] || inspectionViews[inspectTarget];
if (inspectionView) {
  rendering.camera.position.set(inspectionView.x, inspectionView.y, inspectionView.z);
  rendering.camera.rotation.y = inspectionView.yaw;
  rendering.camera.rotation.x = inspectionView.pitch;
  world.state.yaw = inspectionView.yaw;
  world.state.pitch = inspectionView.pitch;
  world.state.isLocked = true;
  document.getElementById('overlay').style.display = 'none';
}
const account = inspectionView ? null : createAccountAccess({ document });
let hiders = null; let round = null; let seeker = null; let online = null;
const menu = inspectionView ? null : createMenu({
  logic: window.HotelMenu, document, window,
  onPlay: () => player.beginPlay(),
  onStartSingle: (options) => startSingleMatch(options), maps: window.HotelMaps, mapSession,
  canPause: () => !online?.isActive(),
  onQuit: () => online?.disconnect(),
  onScreen: createSessionMenuHandler({ logic: window.HotelMenu, account, getOnline: () => online }),
});
const stamina = inspectionView ? null : createStamina({ logic: window.HotelStamina, config: STAMINA_CONFIG, world, document });
const player = createPlayer({
  THREE, camera: rendering.camera, renderer: rendering.renderer, scene: rendering.scene,
  config: CONFIG, floorY, world, elevator, controls: window.HotelControls, movement: window.HotelMovement, flashlight: window.HotelFlashlight, flashlightConfig: FLASHLIGHT_CONFIG,
  performance: window.HotelPerformance, menu, stamina, document, window,
});
const flashlightDrops = createFlashlightPickups({ THREE, scene: rendering.scene, world, player });
const soundtrack = inspectionView ? null : window.HotelMusic.createSoundtrack({ eventTarget: window });
const soundEffects = inspectionView ? null : window.HotelMusic.createSoundEffects({ eventTarget: window });
const sanity = inspectionView ? null : createSanity({ camera: rendering.camera, world, logic: window.HotelSanity, config: SANITY_CONFIG, document });
// The map's roster, however long it is. The workbench shows one body, so it takes the first.
const demons = createDemons({ createMonster, roster: inspectionView ? mapSession.demonRoster().slice(0, 1) : mapSession.demonRoster(), common: {
  THREE, GLTFLoader, scene: rendering.scene, camera: rendering.camera, config: CONFIG, floorY,
  layout: window.HotelLayout, world, player, logic: window.HotelEnemyLogic, movement: window.HotelMovement, sanity, document, window,
} });
const monster = demons.primary;
const avatars = createAvatars({ THREE, GLTFLoader, scene: rendering.scene, config: CONFIG, logic: window.HotelAvatarLogic });
const spectator = createSpectator({ logic: window.HotelSpectator, camera: rendering.camera, world, avatars, config: CONFIG, document, window });
const viewerSubject = inspectTarget === 'monster'
  ? { root: monster.root, setInspectionAnimation: monster.setInspectionAnimation, title: mapSession.demonRoster()[0].name }
  : inspectTarget === 'avatar'
    ? { ...avatars.createShowcase(), title: 'Hotel Guest', eyebrow: 'PLAYER FIGURE', motions: ['idle', 'walk', 'run', 'crouch'], rimColor: 0x4f7cc4 }
    : null;
const modelViewer = viewerSubject ? createModelViewer({ THREE, scene: rendering.scene, camera: rendering.camera, renderer: rendering.renderer, subject: viewerSubject, world, document, window }) : null;
function startSingleMatch(options) {
  if (modelViewer || hiders) return;
  ({ hiders, seeker, round } = createSoloMatch({
    THREE, camera: rendering.camera, config: CONFIG, roundConfig: ROUND_CONFIG, hiderConfig: HIDER_CONFIG, seekerConfig: window.HotelSeeker.SEEKER_DEFAULTS, floorY,
    layout: window.HotelLayout, world, player, elevator, avatars, avatarLogic: window.HotelAvatarLogic, hiderLogic: window.HotelHiders, seekerLogic: window.HotelSeeker,
    enemyLogic: window.HotelEnemyLogic, movement: window.HotelMovement, sanityLogic: window.HotelSanity, sanityConfig: SANITY_CONFIG,
    demons, flashlightDrops, spectator, document, window, options: window.HotelMenu.normalizeMatchConfig(options),
  }));
}
online = createOnline({
  logic: window.HotelOnline, avatars, avatarLogic: window.HotelAvatarLogic, camera: rendering.camera,
  world, player, menu, config: CONFIG, hotel, furnishings, elevator, demons, flashlightDrops, hiders, spectator, document, window, maps: window.HotelMaps, mapId: mapSession.activeMapId(),
  identity: account ? account.identity() : null,
});
if (account) account.syncMenu();
const LOCAL_AVATAR = 'local';
if (!modelViewer) avatars.spawn(LOCAL_AVATAR, { role: window.HotelAvatarLogic.ROLES.SEEKER, seat: 0, hideHead: true, name: 'You' });
if (menu && window.HotelControls.shouldAutoStartDragLook(location.search)) {
  menu.dispatch(window.HotelMenu.ACTIONS.SINGLE_PLAYER);
  menu.dispatch(window.HotelMenu.ACTIONS.PLAY);
}
world.updateInventoryHud();
const clock = new THREE.Clock();
const adaptiveQuality = window.HotelPerformance.createAdaptiveQualityController();
// Gameplay runs on a fixed 60hz accumulator, not on the display's refresh rate: a 144hz monitor must
// simulate the same hotel a 60hz one does, and a server cannot be authoritative over anything else.
const timestep = window.HotelPerformance.createFixedTimestep({ tickRate: 60, maxTicksPerFrame: 5 });
// Online, the server owns the round and the roster, so the local round and the demons stand down —
// there is one authority per hotel, and a second one running here would disagree about who was caught.
function simulate(delta, elapsed) {
  if (!modelViewer) {
    hotel.update(delta); furnishings.update(delta, CONFIG); elevator.update(delta, elapsed); player.update(delta, elapsed);
    if (sanity) sanity.update(delta);
    if (online.isActive()) online.update(delta); else if (round) round.update(delta);
    if (!online.isActive()) spectator.update();
    avatars.followCamera(LOCAL_AVATAR, { camera: rendering.camera, world, player });
    avatars.update(delta);
  }
  // The demons still `update` online — but as puppets. Their brains stood down when the match
  // started, and this only advances the mixer over the pose the server sent.
  demons.update(delta, elapsed);
}
function animate() {
  requestAnimationFrame(animate);
  const frameDelta = clock.getDelta();
  // Behind a menu nothing simulates. The accumulator is not advanced at all, so the paused seconds
  // are never owed back and meters like sanity cannot tick while the player is reading the controls.
  const running = !!modelViewer || online.isActive() || world.state.isLocked || world.state.gameOver;
  const ticks = running ? timestep.advance(frameDelta) : 0;
  for (let tick = 0; tick < ticks; tick += 1) simulate(timestep.step, timestep.getElapsed());
  if (modelViewer) modelViewer.update(frameDelta);
  rendering.renderer.render(rendering.scene, rendering.camera);
  const renderScale = adaptiveQuality.sample(frameDelta * 1000);
  if (renderScale !== null) rendering.setRenderScale(renderScale);
}
rendering.warmUp();
animate();
createPrototypeApi({
  window, world, rendering, hotel, player, monster, demons, flashlightDrops, sanity, stamina, menu,
  online, round, hiders, seeker, spectator, avatars, elevator, timestep, soundtrack, soundEffects,
  floorDefs: FLOOR_DEFS, inspectionViews, mapSession, version: '7.2',
});
