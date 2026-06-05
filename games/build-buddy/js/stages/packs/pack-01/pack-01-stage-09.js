import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, climb, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage09 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 9,
  archetype: 'split_level_basin',
  name: 'Pack 01 - Stage 09: Split Level',
  width: 5900,
  timerMs: 150000,
  rulePreset: 'standard',
  goal: { x: 5520, y: 460, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('lower_entry', 960, BASE_Y, 320),
    climb('split_climb', 1450, 820, 500),
    deck('upper_route_a', 1880, 780, 300),
    deck('upper_route_b', 2680, 620, 300),
    deck('lower_reset', 3520, 1140, 340),
    deck('final_upper', 4320, 680, 320),
    deck('goal_deck', 5420, 680, 440, 80),
    lowRecovery('split_recovery_a', 720),
    lowRecovery('split_recovery_b', 3180, 1440),
    pit('split_pit_a', 650, 260),
    pit('split_pit_b', 2200, 400),
    pit('split_final_pit', 4680, 620),
    block('split_climb_block', 1410, 790, 140, 580),
  ],
});
