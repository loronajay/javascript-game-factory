import { createTeamworkStage, deck, climb, spikes, spikeBall, tool } from '../../course-helpers.js';

// Two crane masts that stop short of the dock. The west mast is caught off a
// blue spring; the drop from its top crosses a patrolling ball. The east mast
// hangs above a patrolling ball, so the Runner steps up onto a platform under
// the lane and jumps for the mast the moment the ball turns away. Then the
// crane row: three spans with two platforms, each landing timed past a ball
// bobbing in the gap, the two balls set half a swing apart.
export const pack02Stage03 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 3,
  name: 'Crane Row',
  archetype: 'timed_mast_catch',
  kit: { platform: 2, springBlue: 1 },
  timerMs: 210000,
  route: [
    deck('start', 80, 2000, 480),
    climb('west_mast', 700, 1000, 580, [tool('springBlue', 600, 1960)]),
    deck('transfer', 1000, 1520, 320),
    climb('east_mast', 1800, 500, 560, [tool('platform', 1660, 1280)]),
    deck('bridgehead', 1952, 476, 448),
    deck('first_span', 3340, 476, 400, 64, [tool('platform', 2820, 476)]),
    deck('second_span', 4680, 476, 400, 64, [tool('platform', 4160, 476)]),
    deck('exit', 6020, 276, 480, 64, [tool('platform', 5500, 376)]),
  ],
  extras: [
    spikeBall('drop_patrol', 880, 1200, 1300, 1200, { period: 5 }),
    spikeBall('mast_patrol', 1400, 1180, 1740, 1180, { period: 4 }),
    spikeBall('span_bob_a', 3160, 200, 3160, 420, { period: 3 }),
    spikeBall('span_bob_b', 4030, 200, 4030, 420, { period: 3, phase: 0.5 }),
    spikes('span_spikes', 3460, 476, 160),
    spikes('bridgehead_spikes', 2200, 476, 80),
  ],
});
