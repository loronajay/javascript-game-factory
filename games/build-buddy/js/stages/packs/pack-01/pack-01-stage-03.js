import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// Two scaffold masts separated by a lower transfer; the kit is needed again at the far gap.
export const pack01Stage03 = createTeamworkStage({
  stageNumber: 3,
  name: 'Scaffold Shuffle',
  archetype: 'limited_platform_climb',
  rulePreset: 'limitedPlatforms',
  timerMs: 210000,
  route: [
    deck('start', 80, 2000, 480),
    climb('west_mast', 480, 1400, 600),
    deck('transfer', 1000, 1520, 320),
    climb('east_mast', 1240, 800, 720),
    deck('bridgehead', 1760, 960, 400),
    deck('exit', 3360, 960, 480),
  ],
});
