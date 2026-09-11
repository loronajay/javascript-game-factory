import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// A broad horizontal crossing, a far-side climb, then a descending roof run.
export const pack01Stage02 = createTeamworkStage({
  stageNumber: 2,
  name: 'Across the Yard',
  archetype: 'bridge_chain',
  rulePreset: 'standard',
  timerMs: 210000,
  route: [
    deck('start', 80, 1400, 640),
    deck('far_bank', 1920, 1400, 480),
    climb('warehouse', 2320, 800, 600),
    gantry('awning', 2800, 1000, 360),
    deck('exit', 3560, 1240, 600),
  ],
});
