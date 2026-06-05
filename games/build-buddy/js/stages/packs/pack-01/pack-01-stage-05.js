import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, climb, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage05 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 5,
  archetype: 'hazard_basin',
  name: 'Pack 01 - Stage 05: Basin Walk',
  width: 5700,
  timerMs: 155000,
  rulePreset: 'standard',
  goal: { x: 5320, y: 820, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('basin_entry', 930, 1120, 340),
    deck('basin_mid_safe', 2000, 1020, 260),
    deck('basin_exit', 3120, 1120, 340),
    climb('exit_climb_wall', 3650, 780, 360),
    deck('high_exit', 4000, 760, 320),
    deck('goal_deck', 5220, 1040, 440, 80),
    lowRecovery('basin_low_a', 1480, 1380),
    lowRecovery('basin_low_b', 2620, 1380),
    pit('entry_pit', 650, 260),
    { id: 'spike_basin', kind: 'hazard', x: 1280, y: 1160, w: 1700, h: 70 },
    pit('final_pit', 4380, 700),
    block('basin_core_block', 1280, 1120, 1700, 120),
    block('exit_climb_block', 3610, 750, 140, 450),
  ],
});
