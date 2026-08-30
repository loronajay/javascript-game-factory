const hospitalPlan = require('../../hospital-plan.js');
const base = require('./hotel-fixture.js');
const maps = require('../../map-catalog.js');
const layout = require('../../layout.js');
const MAP_ID = 'mercy-hospital';
const buildHospital = () => hospitalPlan.createHospitalPlan({ ...base, floorDefs: hospitalPlan.FLOOR_DEFS, config: base.CONFIG, layout });
function createSpace(hospital, openings = {}) {
  const space = base.createSpace(hospital, openings);
  space.setDynamicHeight('elevator-car', 0);
  return space;
}
function createFullSim({ hospital = buildHospital(), config = {}, seed = 7 } = {}) {
  const zones = hospital.roomCenters.map(room => ({ ...room, id: room.roomNumber, kind: 'room' }));
  const result = base.createFullSim({ hotel: hospital, seed, config: {
    player: { ...base.SIM_CONFIG.player, floorCount: 2 }, demons: maps.demonRosterFor(MAP_ID), ...config,
  } });
  return { ...result, hospital, zones };
}
module.exports = { ...base, MAP_ID, buildHospital, createFullSim, createSpace };
