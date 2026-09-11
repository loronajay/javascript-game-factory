import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// The finale combines a broad span, two wall transfers, a descent and a final roof lift.
export const pack01Stage10 = createTeamworkStage({
  stageNumber: 10,
  name: 'Topping Out',
  archetype: 'finale',
  rulePreset: 'limitedPlatforms',
  timerMs: 270000,
  route: [
    deck('start', 80, 2160, 560),
    deck('west_tower', 1840, 2160, 480),
    climb('west_wall', 2240, 1360, 800),
    gantry('transfer', 2800, 1520, 400),
    climb('east_wall', 3120, 880, 640),
    deck('launch_roof', 3680, 1120, 480),
    deck('exit', 4400, 640, 560),
  ],
});
