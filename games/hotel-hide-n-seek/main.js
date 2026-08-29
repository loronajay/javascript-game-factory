import { CONFIG, FLOOR_DEFS, floorY, inspectionViews, keyIdForFloor, keyLabelForFloor } from './modules/game-config.js';
import { createRendering } from './modules/rendering.js';
import { createWorld } from './modules/world.js';
import './modules/performance.js';
import { createFurnishings } from './modules/furnishings.js';
import { createHotel } from './modules/hotel.js';
import { createElevator } from './modules/elevator.js';
import { createPlayer } from './modules/player.js';

if (!window.THREE) {
  document.getElementById('overlay').innerHTML = '<div class="panel"><h1>3D library failed to load</h1><p>This build needs Three.js. Reload with a network connection.</p></div>';
  throw new Error('Three.js failed to load');
}
if (!window.HotelLayout) throw new Error('Hotel layout helpers failed to load');
if (!window.HotelControls) throw new Error('Hotel control helpers failed to load');

const rendering = createRendering({ THREE: window.THREE, document, window, config: CONFIG });
const world = createWorld({ THREE: window.THREE, scene: rendering.scene, materials: rendering.materials, config: CONFIG, layout: window.HotelLayout, document, window });
const elevator = createElevator({
  THREE: window.THREE, scene: rendering.scene, camera: rendering.camera, materials: rendering.materials,
  config: CONFIG, floorY, world, performance: window.HotelPerformance, document, window,
});
const furnishings = createFurnishings({ THREE: window.THREE, materials: rendering.materials, world, keyLabelForFloor });
const hotel = createHotel({
  THREE: window.THREE, scene: rendering.scene, materials: rendering.materials, config: CONFIG,
  floorY, keyIdForFloor, keyLabelForFloor, floorDefs: FLOOR_DEFS, layout: window.HotelLayout,
  world, furnishings, elevator, performance: window.HotelPerformance,
});

hotel.build();
elevator.build();

const inspectionView = inspectionViews[new URLSearchParams(location.search).get('inspect')];
if (inspectionView) {
  rendering.camera.position.set(inspectionView.x, inspectionView.y, inspectionView.z);
  rendering.camera.rotation.y = inspectionView.yaw;
  rendering.camera.rotation.x = inspectionView.pitch;
  world.state.yaw = inspectionView.yaw;
  world.state.pitch = inspectionView.pitch;
  world.state.isLocked = true;
  document.getElementById('overlay').style.display = 'none';
}

const player = createPlayer({
  THREE: window.THREE, camera: rendering.camera, renderer: rendering.renderer, scene: rendering.scene,
  config: CONFIG, floorY, world, elevator, controls: window.HotelControls,
  performance: window.HotelPerformance, document, window,
});

world.updateInventoryHud();
const clock = new window.THREE.Clock();
let elapsed = 0;
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;
  hotel.update(delta);
  furnishings.update(delta, CONFIG);
  elevator.update(delta, elapsed);
  player.update(delta, elapsed);
  rendering.renderer.render(rendering.scene, rendering.camera);
}
animate();

window.HotelPrototype = {
  version: '5.2', floorDefs: FLOOR_DEFS,
  getState: () => ({ playerFloor: world.state.playerFloor, keys: [...world.state.inventory], elevator: { currentFloor: elevator.elevator.currentFloor, targetFloor: elevator.elevator.targetFloor, state: elevator.elevator.state } }),
  getRoomDoor: (roomNumber) => world.collections.roomDoors.get(String(roomNumber)) || null,
  getSecretPanel: (id) => world.collections.secretPanels.get(id) || null,
  inspectionViews: Object.keys(inspectionViews), notify: world.notify,
  events: ['hotel:key-found', 'hotel:door-unlocked', 'hotel:secret-discovered', 'hotel:secret-opened', 'hotel:elevator-called', 'hotel:elevator-start', 'hotel:elevator-arrive', 'hotel:floor-change', 'hotel:drawer-searched'],
};
