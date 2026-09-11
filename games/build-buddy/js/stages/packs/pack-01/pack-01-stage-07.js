import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// Climb to a relay roof, drop into the next work area and cross to a second tower.
export const pack01Stage07 = createTeamworkStage({
  stageNumber: 7,
  name: 'Relay Station',
  archetype: 'checkpoint_gauntlet',
  rulePreset: 'limitedPlatforms',
  timerMs: 240000,
  route: [
    deck('start', 80, 1800, 480),
    climb('relay_wall', 480, 1000, 800),
    deck('relay_roof', 1000, 1160, 640),
    gantry('lower_rack', 1920, 1440, 360),
    deck('tower_base', 3480, 1440, 480),
    climb('tower_wall', 3880, 640, 800),
    deck('exit', 4360, 800, 480),
  ],
});
