import { createTeamworkStage, deck, climb, spikes, tool } from '../../course-helpers.js';

// The first shift teaches every tool in order: the Runner clears a small gap
// alone, then meets a cliff too tall to jump (a platform step), a bridge over
// the yard, a climbable service wall, a descending bridge off the roof, and a
// final lift that a yellow spring cannot make but a green one can.
export const pack01Stage01 = createTeamworkStage({
  stageNumber: 1,
  name: 'First Shift',
  archetype: 'wall_and_bridge_intro',
  kit: { platform: 3, springGreen: 1 },
  timerMs: 180000,
  route: [
    deck('start', 80, 1600, 560),
    deck('yard', 1000, 1600, 400),
    deck('cliff', 1400, 1120, 560, 544, [tool('platform', 1200, 1320)]),
    deck('bridgehead', 3260, 1120, 400, 64, [tool('platform', 2280, 1120), tool('platform', 2760, 1120)]),
    climb('service_wall', 3660, 584, 536),
    deck('roof', 3712, 560, 400),
    deck('landing', 5000, 720, 400, 64, [tool('platform', 4520, 720)]),
    deck('exit', 5720, 320, 560, 64, [tool('springGreen', 5320, 640)]),
  ],
  extras: [
    spikes('cliff_spikes', 1640, 1120, 160),
  ],
});
