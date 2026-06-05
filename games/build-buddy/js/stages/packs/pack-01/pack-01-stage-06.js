import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage06 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 6,
  archetype: 'no_blue_precision',
  name: 'Pack 01 - Stage 06: Greenline',
  width: 5200,
  timerMs: 135000,
  rulePreset: 'noBlueSpring',
  theme: 'sunset-construction',
  goal: { x: 4820, y: 600, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('green_hop_a', 1000, 1220, 300),
    deck('green_hop_b', 1700, 1060, 300),
    deck('green_hop_c', 2420, 900, 300),
    deck('reset_ledge', 3200, 1100, 340),
    deck('final_ledge', 3980, 820, 330),
    deck('goal_deck', 4720, 820, 440, 80),
    lowRecovery('precision_recovery_a', 740),
    lowRecovery('precision_recovery_b', 2100, 1460),
    pit('hop_pit_a', 650, 320),
    pit('hop_pit_b', 1320, 340),
    pit('final_pit', 3420, 500),
    block('blue_shortcut_block', 3880, 620, 260, 420),
  ],
});
