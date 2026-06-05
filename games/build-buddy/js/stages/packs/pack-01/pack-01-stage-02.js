import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage02 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 2,
  archetype: 'bridge_chain',
  name: 'Pack 01 - Stage 02: Bridge Chain',
  width: 5000,
  timerMs: 150000,
  rulePreset: 'standard',
  theme: 'sunset-construction',
  goal: { x: 4620, y: 800, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('gap_landing_a', 1030, BASE_Y, 300),
    deck('gap_landing_b', 1780, BASE_Y - 140, 300),
    deck('high_bridge_exit', 2500, BASE_Y - 280, 320),
    deck('drop_catch', 3150, BASE_Y - 80, 360),
    deck('goal_deck', 4520, 1020, 440, 80),
    lowRecovery('gap_recovery_a', 680),
    lowRecovery('gap_recovery_b', 1420, BASE_Y + 250),
    lowRecovery('drop_recovery', 2860, BASE_Y + 210),
    pit('gap_a_pit', 650, 320),
    pit('gap_b_pit', 1360, 340),
    pit('final_gap_pit', 3560, 760),
    block('goal_airspace_block', 4520, 780, 180, 300),
  ],
});
