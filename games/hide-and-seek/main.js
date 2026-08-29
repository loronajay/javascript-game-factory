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
import { createAvatars } from './modules/avatars.js';
import { createHiders } from './modules/hiders.js';
import { createRound } from './modules/round.js';
import { createModelViewer } from './modules/model-viewer.js';
if (!window.HotelLayout || !window.HotelCollision || !window.HotelPlan) throw new Error('Hotel layout helpers failed to load');
if (!window.HotelControls) throw new Error('Hotel control helpers failed to load');
if (!window.HotelFlashlight) throw new Error('Flashlight helpers failed to load');
if (!window.HotelEnemyLogic) throw new Error('Hotel enemy logic failed to load');
if (!window.HotelAvatarLogic) throw new Error('Hotel avatar logic failed to load');
if (!window.HotelSanity) throw new Error('Hotel sanity logic failed to load');
if (!window.HotelStamina) throw new Error('Hotel stamina logic failed to load');
if (!window.HotelMenu) throw new Error('Hotel menu logic failed to load');
if (!window.HotelRound || !window.HotelHiders) throw new Error('Hotel round logic failed to load');
if (!window.HotelMusic) throw new Error('Hotel music failed to load');
const rendering = createRendering({ THREE, document, window, config: CONFIG });
const world = createWorld({ THREE, scene: rendering.scene, materials: rendering.materials, config: CONFIG, layout: window.HotelLayout, logic: window.HotelCollision, plan: window.HotelPlan, document, window });
const elevator = createElevator({
  THREE, scene: rendering.scene, camera: rendering.camera, materials: rendering.materials,
  config: CONFIG, floorY, world, performance: window.HotelPerformance, document, window,
});
const furnishings = createFurnishings({ THREE, materials: rendering.materials, world, keyLabelForFloor });
const hotel = createHotel({
  THREE, scene: rendering.scene, materials: rendering.materials, config: CONFIG,
  floorY, keyIdForFloor, keyLabelForFloor, floorDefs: FLOOR_DEFS, layout: window.HotelLayout, plan: window.HotelPlan,
  world, furnishings, elevator, performance: window.HotelPerformance, mergeGeometries,
});
hotel.build();
elevator.build();
const inspectTarget = new URLSearchParams(location.search).get('inspect');
const inspectionView = inspectionViews[inspectTarget];
if (inspectionView) {
  rendering.camera.position.set(inspectionView.x, inspectionView.y, inspectionView.z);
  rendering.camera.rotation.y = inspectionView.yaw;
  rendering.camera.rotation.x = inspectionView.pitch;
  world.state.yaw = inspectionView.yaw;
  world.state.pitch = inspectionView.pitch;
  world.state.isLocked = true;
  document.getElementById('overlay').style.display = 'none';
}
// The menu is built before the player so it can drive it: picking Play or Resume is what asks for
// the pointer lock, which has to ride on the click gesture that chose it.
const menu = inspectionView ? null : createMenu({ logic: window.HotelMenu, document, window, onPlay: () => player.beginPlay() });
const stamina = inspectionView ? null : createStamina({ logic: window.HotelStamina, config: STAMINA_CONFIG, world, document });
const player = createPlayer({
  THREE, camera: rendering.camera, renderer: rendering.renderer, scene: rendering.scene,
  config: CONFIG, floorY, world, elevator, controls: window.HotelControls, flashlight: window.HotelFlashlight, flashlightConfig: FLASHLIGHT_CONFIG,
  performance: window.HotelPerformance, menu, stamina, document, window,
});
const flashlightDrops = createFlashlightPickups({ THREE, scene: rendering.scene, world, player });
const soundtrack = inspectionView ? null : window.HotelMusic.createSoundtrack({ eventTarget: window });
const soundEffects = inspectionView ? null : window.HotelMusic.createSoundEffects({ eventTarget: window });
const sanity = inspectionView ? null : createSanity({ camera: rendering.camera, world, logic: window.HotelSanity, config: SANITY_CONFIG, document });
const demons = createDemons({ createMonster, includeHousekeeper: !inspectionView, common: {
  THREE, GLTFLoader, scene: rendering.scene, camera: rendering.camera, config: CONFIG, floorY,
  layout: window.HotelLayout, world, player, logic: window.HotelEnemyLogic, sanity, document, window,
} });
const monster = demons.primary;
const avatars = createAvatars({ THREE, GLTFLoader, scene: rendering.scene, config: CONFIG, logic: window.HotelAvatarLogic });
const viewerSubject = inspectTarget === 'monster'
  ? { root: monster.root, setInspectionAnimation: monster.setInspectionAnimation, title: 'The Bellhop' }
  : inspectTarget === 'avatar'
    ? { ...avatars.createShowcase(), title: 'Hotel Guest', eyebrow: 'PLAYER FIGURE', motions: ['idle', 'walk', 'run', 'crouch'], rimColor: 0x4f7cc4 }
    : null;
const modelViewer = viewerSubject
  ? createModelViewer({ THREE, scene: rendering.scene, camera: rendering.camera, renderer: rendering.renderer, subject: viewerSubject, world, document, window })
  : null;
// You are it. The offline hiders stand in for the other players until the network does, and the
// round owns the three-way resolution: you tag them, the demon takes anyone, and the demon taking
// you ends it for your side.
const hiders = modelViewer ? null : createHiders({
  THREE, config: CONFIG, tuning: HIDER_CONFIG, sanityConfig: SANITY_CONFIG, floorY, layout: window.HotelLayout, world, avatars, count: ROUND_CONFIG.hiderCount,
  logic: window.HotelHiders, enemyLogic: window.HotelEnemyLogic, sanityLogic: window.HotelSanity, avatarLogic: window.HotelAvatarLogic, seekerSpawn: { ...rendering.camera.position, floor: world.state.playerFloor },
});
if (hiders) demons.setPlayers(() => hiders.list());
const round = hiders ? createRound({ camera: rendering.camera, world, player, elevator, hiders, monsters: demons.list, flashlightDrops, logic: window.HotelRound, config: ROUND_CONFIG, document, window }) : null;
document.getElementById('restartBtn').addEventListener('click', () => window.location.reload());
// Every player is a figure in the world, the local one included: the same avatar the network will
// drive for everyone else is driven here by the camera, so remote and local bodies can never drift
// into two different implementations.
const LOCAL_AVATAR = 'local';
if (!modelViewer) avatars.spawn(LOCAL_AVATAR, { role: window.HotelAvatarLogic.ROLES.SEEKER, seat: 0, hideHead: true, name: 'You' });
function syncLocalAvatar() {
  // The rig's forward is +Z and the camera looks down -Z, so the body carries a half turn.
  avatars.setPose(LOCAL_AVATAR, {
    x: rendering.camera.position.x,
    y: world.state.playerFeetY,
    z: rendering.camera.position.z,
    yaw: world.state.yaw + Math.PI,
    crouching: world.state.playerCrouching,
    flashlightOn: player.getState().flashlightOn,
    flashlightCharge: player.getState().flashlightCharge,
  });
}
// ?controls=drag is a QA entry point, so it skips the title screen through the menu rather than
// around it — there is only one path into a round.
if (menu && window.HotelControls.shouldAutoStartDragLook(location.search)) menu.dispatch(window.HotelMenu.ACTIONS.PLAY);

world.updateInventoryHud();
const clock = new THREE.Clock();
const adaptiveQuality = window.HotelPerformance.createAdaptiveQualityController();
// Gameplay runs on a fixed 60hz accumulator, not on the display's refresh rate: a 144hz monitor must
// simulate the same hotel a 60hz one does, and a server cannot be authoritative over anything else.
const timestep = window.HotelPerformance.createFixedTimestep({ tickRate: 60, maxTicksPerFrame: 5 });

function simulate(delta, elapsed) {
  if (!modelViewer) {
    hotel.update(delta);
    furnishings.update(delta, CONFIG);
    elevator.update(delta, elapsed);
    player.update(delta, elapsed);
    if (sanity) sanity.update(delta);
    if (round) round.update(delta);
    syncLocalAvatar();
    avatars.update(delta);
  }
  demons.update(delta, elapsed);
}

function animate() {
  requestAnimationFrame(animate);
  const frameDelta = clock.getDelta();
  // Behind a menu nothing simulates. The accumulator is not advanced at all, so the paused seconds
  // are never owed back and meters like sanity cannot tick while the player is reading the controls.
  const running = !!modelViewer || world.state.isLocked || world.state.gameOver;
  const ticks = running ? timestep.advance(frameDelta) : 0;
  for (let tick = 0; tick < ticks; tick += 1) simulate(timestep.step, timestep.getElapsed());
  if (modelViewer) modelViewer.update(frameDelta);
  rendering.renderer.render(rendering.scene, rendering.camera);
  const renderScale = adaptiveQuality.sample(frameDelta * 1000);
  if (renderScale !== null) rendering.setRenderScale(renderScale);
}
animate();

window.HotelPrototype = {
  version: '6.9', floorDefs: FLOOR_DEFS,
  getState: () => ({ locked: !!world.state.isLocked, playerFloor: world.state.playerFloor, keys: [...world.state.inventory], gameOver: !!world.state.gameOver, player: player.getState(), flashlightDrops: flashlightDrops.getState(), monster: monster.getState(), demons: demons.getStates(), sanity: sanity ? sanity.getState() : null, stamina: stamina ? stamina.getState() : null, menu: menu ? menu.getScreen() : null, round: round ? round.getState() : null, hiders: hiders ? hiders.list() : [], avatars: avatars.list().map((id) => avatars.describe(id)), tick: { rate: 1 / timestep.step, ticks: timestep.getTicks(), simulatedSeconds: Number(timestep.getElapsed().toFixed(2)) }, elevator: { currentFloor: elevator.elevator.currentFloor, targetFloor: elevator.elevator.targetFloor, state: elevator.elevator.state } }),
  getRoomDoor: (roomNumber) => world.collections.roomDoors.get(String(roomNumber)) || null,
  getSecretPanel: (id) => world.collections.secretPanels.get(id) || null,
  inspectionViews: Object.keys(inspectionViews), notify: world.notify,
  soundtrack, soundEffects, avatars, demons, flashlightDrops, sanity, stamina, menu, round, hiders, world, rendering,
  events: ['hotel:key-found', 'hotel:door-unlocked', 'hotel:secret-discovered', 'hotel:secret-opened', 'hotel:elevator-called', 'hotel:elevator-start', 'hotel:elevator-arrive', 'hotel:floor-change', 'hotel:drawer-searched', 'hotel:flashlight-change', 'hotel:flashlight-charge', 'hotel:flashlight-drop', 'hotel:flashlight-pickup', 'hotel:demon-state', 'hotel:monster-state', 'hotel:demon-catch', 'hotel:sanity-full', 'hotel:sanity-hunt', 'hotel:round-over', 'hotel:caught'],
};
