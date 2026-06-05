import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage04 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 4,
  archetype: 'spring_tower',
  name: 'Pack 01 - Stage 04: Spring Tower',
  width: 4700,
  timerMs: 140000,
  rulePreset: 'springFocus',
  theme: 'sunset-construction',
  goal: { x: 4320, y: 360, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('spring_test_low', 980, BASE_Y, 300),
    deck('spring_test_mid', 1650, 1040, 280),
    deck('spring_test_high', 2300, 760, 280),
    deck('tower_exit', 2960, 540, 320),
    deck('goal_deck', 4220, 580, 440, 80),
    lowRecovery('low_recovery_a', 700),
    lowRecovery('low_recovery_b', 1400, 1530),
    lowRecovery('low_recovery_c', 2650, 1320),
    pit('spring_gap_a', 650, 300),
    pit('spring_gap_b', 1280, 320),
    pit('tower_miss_pit', 3320, 760),
    block('tower_core_block', 2080, 620, 180, 760),
  ],
});
