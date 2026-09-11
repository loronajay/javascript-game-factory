import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// Descend through open gantries into a basin, cross it, then climb out.
export const pack01Stage05 = createTeamworkStage({
  stageNumber: 5,
  name: 'Overtime Crossing',
  archetype: 'hazard_basin',
  rulePreset: 'standard',
  timerMs: 240000,
  route: [
    deck('start', 80, 1000, 640),
    gantry('loading_rack', 1040, 1200, 400),
    deck('basin_bank', 1640, 1520, 480),
    deck('pump_house', 3320, 1520, 480),
    climb('pump_wall', 3720, 800, 720),
    deck('exit', 4200, 1080, 560),
  ],
});
