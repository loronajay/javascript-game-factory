import { createTeamworkStage, deck, climb, gantry } from './pack-01-stage-helpers.js';

// A spring lift enters the well; a long wall gives breathing room before the roof launch.
export const pack01Stage04 = createTeamworkStage({
  stageNumber: 4,
  name: 'Springwell',
  archetype: 'spring_tower',
  rulePreset: 'springFocus',
  timerMs: 180000,
  route: [
    deck('start', 80, 2000, 480),
    deck('well', 800, 1520, 480),
    climb('well_wall', 1200, 800, 720),
    deck('roof', 1680, 960, 480),
    deck('exit', 2400, 480, 480),
  ],
});
