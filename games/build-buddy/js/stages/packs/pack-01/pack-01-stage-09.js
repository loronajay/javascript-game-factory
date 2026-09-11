import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// A high start drops onto the crossing; the far mast returns the route above its entry height.
export const pack01Stage09 = createTeamworkStage({
  stageNumber: 9,
  name: 'Skybridge',
  archetype: 'split_level_basin',
  rulePreset: 'standard',
  timerMs: 240000,
  route: [
    deck('start', 80, 720, 560),
    gantry('drop_rack', 1040, 1040, 400),
    deck('bridgehead', 1760, 1280, 480),
    deck('east_bank', 3440, 1280, 480),
    climb('sky_mast', 3840, 480, 800),
    deck('exit', 4400, 640, 560),
  ],
});
