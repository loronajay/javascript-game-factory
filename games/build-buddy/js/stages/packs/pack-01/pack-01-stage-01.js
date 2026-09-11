import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// A low yard leads up a wall, down onto a bridgehead, then across open water.
export const pack01Stage01 = createTeamworkStage({
  stageNumber: 1,
  name: 'First Shift',
  archetype: 'wall_and_bridge_intro',
  rulePreset: 'standard',
  timerMs: 180000,
  route: [
    deck('start', 80, 1600, 560),
    climb('service_wall', 560, 1000, 600),
    deck('bridgehead', 1000, 1080, 400),
    deck('exit', 2600, 1080, 560),
  ],
});
