import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// A low crossing feeds a tall wall, then a short roof gap and another climb.
export const pack01Stage06 = createTeamworkStage({
  stageNumber: 6,
  name: 'Greenline',
  archetype: 'no_blue_precision',
  rulePreset: 'noBlueSpring',
  timerMs: 210000,
  route: [
    deck('start', 80, 1760, 560),
    deck('workshop', 1840, 1760, 400),
    climb('green_wall', 2160, 960, 800),
    gantry('canopy', 2640, 1120, 480),
    climb('exit_wall', 3040, 560, 560),
    deck('exit', 3520, 720, 480),
  ],
});
