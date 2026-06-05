import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, climb, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage03 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 3,
  archetype: 'limited_platform_climb',
  name: 'Pack 01 - Stage 03: Scaffold Squeeze',
  width: 5400,
  timerMs: 145000,
  rulePreset: 'limitedPlatforms',
  goal: { x: 5020, y: 540, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('climb_approach', 960, BASE_Y, 340),
    climb('main_climb_wall', 1520, 880, 430),
    deck('upper_ledge_a', 1900, 840, 300),
    deck('upper_ledge_b', 2650, 700, 300),
    deck('drop_platform', 3380, 980, 340),
    deck('final_launch', 4200, 940, 320),
    deck('goal_deck', 4920, 760, 440, 80),
    lowRecovery('climb_recovery', 1360, 1510),
    lowRecovery('upper_recovery', 3020, 1280),
    pit('approach_pit', 640, 280),
    pit('upper_pit', 2220, 370),
    pit('final_pit', 3740, 430),
    block('climb_wall_block', 1480, 850, 140, 520),
  ],
});
