// The hotel, built headlessly, plus the `space` a mover needs.
//
// The browser hands `movement-logic.js` a space backed by the built world; this hands it one backed
// by the plan directly. Nothing here loads Three.js, which is the whole point: the tick a server
// would run has to be runnable by `node --test`.
const plan = require('../../hotel-plan.js');
const collision = require('../../collision-logic.js');
const layout = require('../../layout.js');
const sim = require('../../sim-logic.js');

// The tuning the browser passes in, restated because game-config.js is an ES module and the pure
// layer stays loadable with no build step.
const CONFIG = {
  floorHeight: 4.6,
  playerRadius: 0.34,
  bodyHeight: 1.78,
  groundSnap: 0.62,
  doorOpenAngle: Math.PI / 2,
  elevatorCenterX: 2.5,
  elevatorCenterZ: 57.45,
  elevatorFrontZ: 55.88,
};
const floorY = (id) => (id - 1) * CONFIG.floorHeight;
const keyIdForFloor = (id) => `floor-${id}-master`;
const keyLabelForFloor = (id) => `Floor ${id} Master Key`;
const FLOOR_DEFS = [
  { id: 1, name: 'Lobby Floor', openRooms: ['105', '111'], lockedRooms: ['107', '113'], roomVariants: { 111: 'suite', 113: 'maintenance' }, keyPlacements: { 105: keyIdForFloor(1) }, secretRooms: ['105', '107'], secretLinks: [['105', '107']] },
  { id: 2, name: 'Lounge Floor', openRooms: ['202', '208', '213'], lockedRooms: ['204', '210'], roomVariants: { 202: 'suite', 204: 'maintenance', 213: 'suite' }, keyPlacements: { 204: keyIdForFloor(2) }, secretRooms: ['202', '204'], secretLinks: [['202', '204']] },
  { id: 3, name: 'Quiet Floor', openRooms: ['305', '312'], lockedRooms: ['302', '307', '308', '314'], roomVariants: { 305: 'suite', 314: 'maintenance' }, keyPlacements: { 305: keyIdForFloor(3) }, secretRooms: ['305', '307'], secretLinks: [['305', '307']] },
  { id: 4, name: 'Renovation Floor', openRooms: ['405', '412'], lockedRooms: ['402', '407', '408', '414'], roomVariants: { 407: 'maintenance', 414: 'maintenance' }, keyPlacements: { 407: keyIdForFloor(4) }, secretRooms: ['405', '407'], secretLinks: [['405', '407']] },
];

function buildHotel() {
  return plan.createHotelPlan({ config: CONFIG, floorDefs: FLOOR_DEFS, layout, floorY, keyIdForFloor, keyLabelForFloor });
}

// `openings` is the same door-id map the browser keeps; an empty one means every door shut. The
// adapter itself is `sim-logic.js`'s, so a test, the server and the browser all walk one world.
function createSpace(hotel, openings = {}) {
  return sim.createPlanSpace({ plan, collision, hotel, config: CONFIG, openings });
}

module.exports = { CONFIG, FLOOR_DEFS, floorY, keyIdForFloor, keyLabelForFloor, buildHotel, createSpace };
