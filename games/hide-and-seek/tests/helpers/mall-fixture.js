// Cinder Mall, built headlessly, with the same seams the hotel fixture gives the hotel.
//
// It exists so the second map is tested as a *building a round happens in* rather than as a bag of
// records that happens to have the right field names. A plan can satisfy every shape in
// MAP_AUTHORING.md and still be unplayable: spawns inside walls, a level nothing can reach, a graph
// that does not connect. Standing a real tick up in it is the only check that catches those.
const mallPlan = require('../../mall-plan.js');
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
const maps = require('../../map-catalog.js');
const hotelFixture = require('./hotel-fixture.js');

const MAP_ID = 'cinder-mall';
const CONFIG = { ...hotelFixture.CONFIG };
const FLOOR_DEFS = mallPlan.FLOOR_DEFS;
const floorY = (id) => (id - 1) * CONFIG.floorHeight;
const keyIdForFloor = (id) => `level-${id}-master`;
const keyLabelForFloor = (id) => `Level ${id} Master Key`;

function buildMall() {
  return mallPlan.createMallPlan({ config: CONFIG, floorDefs: FLOOR_DEFS, layout, floorY, keyIdForFloor, keyLabelForFloor });
}

function createSpace(mall, openings = {}) {
  return sim.createPlanSpace({ plan: mallPlan, collision, mall: null, hotel: mall, config: CONFIG, openings });
}

function heatZones(mall) {
  return [
    ...mall.roomCenters.map((room) => ({ id: room.roomNumber, kind: heat.ZONE_KINDS.ROOM, floor: room.floor, x: room.x, z: room.z })),
    ...mall.secretTunnels,
  ];
}

// The composition `factory-network-server` runs for this map: the mall's plan, the mall's floor
// count, and the three demons the catalog names for it.
function createFullSim({ mall = buildMall(), seed = 7, config } = {}) {
  const space = createSpace(mall);
  const engine = sim.createSimulation({
    movement, round: roundLogic, stamina, flashlight, heat, fixtures, demon, enemy, layout,
    space, plan: mall, zones: heatZones(mall), random: hotelFixture.seededRandom(seed),
    config: {
      ...hotelFixture.SIM_CONFIG,
      player: { ...hotelFixture.SIM_CONFIG.player, floorCount: maps.floorCountFor(MAP_ID) },
      demons: maps.demonRosterFor(MAP_ID),
      ...(config || {}),
    },
  });
  return { mall, space, engine };
}

module.exports = { CONFIG, FLOOR_DEFS, MAP_ID, buildMall, createFullSim, createSpace, floorY, keyIdForFloor, keyLabelForFloor, heatZones };
