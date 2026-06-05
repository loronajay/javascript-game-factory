import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, climb, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage10 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 10,
  archetype: 'final_mixed_exam',
  name: 'Pack 01 - Stage 10: Final Frame',
  width: 6800,
  timerMs: 170000,
  rulePreset: 'springFocus',
  theme: 'sunset-construction',
  goal: { x: 6420, y: 420, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('bridge_exam_a', 980, BASE_Y, 300),
    climb('exam_climb', 1540, 880, 430),
    deck('upper_exam_a', 1980, 820, 300),
    deck('spring_exam', 2820, 560, 300),
    deck('basin_entry', 3660, 980, 320),
    deck('basin_exit', 4760, 920, 340),
    deck('final_launch', 5600, 820, 320),
    deck('goal_deck', 6320, 640, 440, 80),
    lowRecovery('final_recovery_a', 720),
    lowRecovery('final_recovery_b', 3300, 1420),
    pit('exam_pit_a', 650, 300),
    pit('exam_pit_b', 2300, 420),
    { id: 'final_basin_spikes', kind: 'hazard', x: 4020, y: 1000, w: 680, h: 70 },
    pit('final_exam_pit', 5940, 320),
    block('exam_climb_block', 1500, 850, 140, 520),
    block('final_basin_block', 4020, 960, 680, 120),
  ],
});
