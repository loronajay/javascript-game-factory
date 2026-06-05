import { compileStageBlueprint } from '../../stage-authoring.js';
import { BASE_Y, block, deck, lowRecovery, pit } from './pack-01-stage-helpers.js';

export const pack01Stage07 = compileStageBlueprint({
  packId: 'pack_01',
  stageNumber: 7,
  archetype: 'checkpoint_gauntlet',
  name: 'Pack 01 - Stage 07: Checkpoint Alley',
  width: 6100,
  timerMs: 160000,
  rulePreset: 'limitedPlatforms',
  goal: { x: 5720, y: 760, w: 140, h: 200 },
  route: [
    deck('start_deck', 80, BASE_Y, 540, 80),
    deck('gauntlet_a', 940, BASE_Y, 300),
    deck('gauntlet_b', 1700, BASE_Y - 170, 300),
    deck('checkpoint_shelf', 2520, BASE_Y - 50, 420),
    deck('gauntlet_c', 3400, BASE_Y - 260, 300),
    deck('final_stair', 4300, BASE_Y - 120, 320),
    deck('goal_deck', 5620, 980, 440, 80),
    lowRecovery('gauntlet_recovery_a', 660),
    lowRecovery('gauntlet_recovery_b', 3000, 1500),
    pit('gauntlet_pit_a', 650, 260),
    pit('gauntlet_pit_b', 1260, 390),
    pit('gauntlet_final_pit', 4640, 720),
    block('checkpoint_shelf_block', 2500, 1130, 460, 90),
  ],
});
