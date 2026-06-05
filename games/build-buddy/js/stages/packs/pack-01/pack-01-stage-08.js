import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage08 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 8,
  archetype: 'no_platform_springs',
  name: 'Pack 01 - Stage 08: Spring Only',
  width: 5000,
  timerMs: 125000,
  rulePreset: 'noPlatforms',
  theme: 'sunset-construction',
  goal: { x: 4620, y: 500, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('yellow_target', 1000, 1180, 280),
    deck('green_target', 1700, 960, 280),
    deck('blue_target', 2380, 680, 280),
    deck('spring_reset', 3060, 980, 320),
    deck('final_pop', 3780, 760, 320),
    deck('goal_deck', 4520, 720, 440, 80),
    lowRecovery('spring_only_recovery_a', 720),
    lowRecovery('spring_only_recovery_b', 2800, 1420),
    pit('spring_only_pit_a', 650, 300),
    pit('spring_only_pit_b', 1300, 360),
    pit('spring_only_final_pit', 3380, 360),
    block('platform_shortcut_block', 880, 980, 3000, 140),
  ],
});
