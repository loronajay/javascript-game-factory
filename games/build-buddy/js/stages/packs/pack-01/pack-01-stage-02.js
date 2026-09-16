import { createTeamworkStage, deck, climb, spikes, slab, lock, tool } from '../../course-helpers.js';

// A long bridge run that needs six platforms against a cap of five, so the
// Builder must pull a platform from behind the Runner to lay the next one. A
// spiked pylon sits in the descent, and the final lift is locked against
// stairs, and too tall for green: only a blue spring gets the Runner onto the exit.
export const pack01Stage02 = createTeamworkStage({
  stageNumber: 2,
  name: 'Across the Yard',
  archetype: 'bridge_chain',
  kit: { platform: 3, springBlue: 1 },
  timerMs: 210000,
  route: [
    deck('start', 80, 1400, 560),
    deck('first_pier', 1940, 1400, 360, 64, [tool('platform', 1000, 1400), tool('platform', 1480, 1400)]),
    deck('second_pier', 3340, 1160, 360, 64, [tool('platform', 2760, 1240)]),
    deck('far_bank', 4940, 1520, 360, 64, [tool('platform', 4400, 1400)]),
    climb('warehouse', 5300, 800, 720),
    deck('roof', 5352, 776, 488),
    deck('awning', 7140, 748, 360, 64, [tool('platform', 6240, 776), tool('platform', 6700, 776)]),
    deck('exit', 7880, 280, 560, 64, [tool('springBlue', 7440, 720)]),
  ],
  extras: [
    spikes('pier_spikes', 3440, 1160, 160),
    slab('pylon', 4160, 1300, 160, 284),
    spikes('pylon_spikes', 4160, 1300, 160),
    spikes('roof_spikes', 5560, 776, 120),
    lock('no_stairs', 7140, 300, 740, 420),
  ],
});
