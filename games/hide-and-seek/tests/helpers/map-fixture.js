// Every registered map, stood up headlessly through the registry rather than through a named plan
// module.
//
// The hotel, the mall and the hospital each have their own fixture, and each of those knows which
// building it is building. This one deliberately does not: it asks `map-catalog.js` what exists and
// composes whatever comes back, so a map added to the registry is covered by the CPU tests the day
// it is registered rather than the day somebody remembers to write a fixture for it.
require('../../collision-logic.js');
const collision = require('../../collision-logic.js');
const layout = require('../../layout.js');
const sim = require('../../sim-logic.js');
const maps = require('../../map-catalog.js');
// Requiring a plan module attaches it to `globalThis` under the name the catalog rows use, which is
// exactly how the browser reaches it: classic scripts loaded ahead of the module graph.
require('../../hotel-plan.js');
require('../../mall-plan.js');
require('../../hospital-plan.js');
const base = require('./hotel-fixture.js');

function buildPlan(mapId) {
  return maps.resolveMapPlan(mapId, {
    config: base.CONFIG,
    floorDefs: maps.resolveMapFloorDefs(mapId, { floorDefs: base.FLOOR_DEFS, scope: globalThis }),
    layout,
    floorY: base.floorY,
    keyIdForFloor: base.keyIdForFloor,
    keyLabelForFloor: base.keyLabelForFloor,
    scope: globalThis,
  });
}

// The world adapter the browser's `modules/world.js` answers for, backed by the plan directly. Every
// door is open: a CPU body that cannot cross the building with the doors open cannot cross it at
// all, and a shut door is a fixtures question, not a navigation one.
function createSpace(plan) {
  const openings = Object.fromEntries([
    ...plan.swingDoors.map((door) => [door.id, door.openAngle]),
    ...(plan.hallDoors || []).map((door) => [door.id, 1]),
  ]);
  const space = sim.createPlanSpace({ plan: collision, collision, hotel: plan, config: base.CONFIG, openings });
  space.setDynamicHeight('elevator-car', 0);
  return space;
}

// The shape `modules/hiders.js` and `modules/seeker.js` are handed in the browser. They ask the
// world for the plan and for the room collections and nothing else, which is the seam that lets one
// runtime serve every map.
async function mapRuntime(mapId) {
  const plan = buildPlan(mapId);
  const space = createSpace(plan);
  const world = {
    space,
    state: { floorCount: maps.floorCountFor(mapId) },
    getPlan: () => plan,
    sightBlocked: (...args) => space.sightBlocked(...args),
    collections: {
      roomCenters: new Map(plan.roomCenters.map((room) => [room.roomNumber, room])),
      roomDoors: new Map(plan.roomDoors.map((door) => [door.roomNumber, { ...door, open: true }])),
      secretTunnels: plan.secretTunnels || [],
    },
  };
  return {
    mapId,
    plan,
    world,
    space,
    THREE: await import('../../vendor/three.module.js'),
    avatars: { spawn() {}, setPose() {}, remove() {}, setVisible() {} },
    avatarLogic: { ROLES: { HIDER: 'hider', SEEKER: 'seeker' } },
    config: base.CONFIG,
    floorY: base.floorY,
    layout,
    enemyLogic: require('../../enemy-logic.js'),
    movement: require('../../movement-logic.js'),
    sanityLogic: require('../../sanity-logic.js'),
  };
}

module.exports = { buildPlan, createSpace, mapRuntime };
