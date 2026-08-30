// The hotel, built headlessly, plus the `space` a mover needs.
//
// The browser hands `movement-logic.js` a space backed by the built world; this hands it one backed
// by the plan directly. Nothing here loads Three.js, which is the whole point: the tick a server
// would run has to be runnable by `node --test`.
const plan = require('../../hotel-plan.js');
const collision = require('../../collision-logic.js');
const layout = require('../../layout.js');
const sim = require('../../sim-logic.js');
const movement = require('../../movement-logic.js');
const roundLogic = require('../../round-logic.js');
const stamina = require('../../stamina-logic.js');
const flashlight = require('../../flashlight-logic.js');
const heat = require('../../heat-logic.js');
const fixtures = require('../../fixtures-logic.js');
const demon = require('../../demon-logic.js');
const enemy = require('../../enemy-logic.js');

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

// A deterministic stand-in for Math.random, so a round that spawns demons and picks patrol targets
// replays identically. The authority has to be reproducible before it can be trusted.
function seededRandom(seed = 1) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13; value >>>= 0;
    value ^= value >> 17;
    value ^= value << 5; value >>>= 0;
    return value / 4294967296;
  };
}

const SIM_CONFIG = {
  player: { ...CONFIG, walkSpeed: 3.1, sprintSpeed: 5.4, crouchSpeed: 1.9, eyeHeight: 1.62, crouchEyeHeight: 1.02 },
  round: { durationSeconds: null, hideSeconds: 45, tagDistance: 1.8, tagHeightTolerance: 1.4 },
  stamina: undefined,
  heat: undefined,
  flashlight: { drainSeconds: 120 },
};

function heatZones(hotel) {
  return [
    ...hotel.roomCenters.map((room) => ({ id: room.roomNumber, kind: heat.ZONE_KINDS.ROOM, floor: room.floor, x: room.x, z: room.z })),
    ...hotel.secretTunnels,
  ];
}

// The whole authority, assembled exactly the way `factory-network-server` assembles it. A test that
// uses this is testing the shipped composition, not a convenient approximation of it.
function createFullSim({ hotel = buildHotel(), seed = 7, config } = {}) {
  const space = createSpace(hotel);
  const engine = sim.createSimulation({
    movement, round: roundLogic, stamina, flashlight, heat, fixtures, demon, enemy, layout,
    space, plan: hotel, zones: heatZones(hotel), random: seededRandom(seed),
    config: { ...SIM_CONFIG, ...(config || {}) },
  });
  return { hotel, space, engine };
}

module.exports = {
  CONFIG, FLOOR_DEFS, SIM_CONFIG, floorY, keyIdForFloor, keyLabelForFloor,
  buildHotel, createSpace, createFullSim, heatZones, seededRandom,
};
