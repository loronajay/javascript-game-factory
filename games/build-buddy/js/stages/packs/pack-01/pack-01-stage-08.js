import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// Spring to a wall landing, climb, descend to a second launch bay, then spring to the exit.
export const pack01Stage08 = createTeamworkStage({
  stageNumber: 8,
  name: 'Spring Exchange',
  archetype: 'no_platform_springs',
  rulePreset: 'noPlatforms',
  timerMs: 210000,
  route: [
    deck('start', 80, 1920, 480),
    deck('wall_landing', 800, 1440, 480),
    climb('exchange_wall', 1200, 800, 640),
    deck('launch_bay', 1680, 1040, 560),
    deck('exit', 2480, 560, 480),
  ],
});
