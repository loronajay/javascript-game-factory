import { createTeamworkStage, deck, climb, spikes, tool } from '../../course-helpers.js';

// A double-back. The ground run heads right over two gaps that need three
// platforms between them against a cap of two, then a wall up to the relay
// roof, then the route turns and comes back LEFT along spiked pillars, each
// gap bridged by a platform pulled up from the ground below. The exit sits
// directly above the start, so a fall on the upper level without a checkpoint
// on the roof means the whole yard again.
export const pack01Stage07 = createTeamworkStage({
  stageNumber: 7,
  name: 'Relay Station',
  archetype: 'checkpoint_gauntlet',
  kit: { platform: 2 },
  timerMs: 240000,
  route: [
    deck('start', 80, 1800, 480),
    deck('yard_a', 1860, 1800, 600, 64, [tool('platform', 1000, 1800), tool('platform', 1440, 1800)]),
    deck('yard_b', 3360, 1800, 600, 64, [tool('platform', 2860, 1800)]),
    climb('relay_mast', 3960, 1000, 800),
    deck('relay_roof', 4012, 976, 348),
    deck('pillar_a', 3100, 976, 300),
    deck('pillar_b', 1900, 976, 300, 64, [tool('platform', 2500, 976)]),
    deck('pillar_c', 700, 976, 300, 64, [tool('platform', 1300, 976)]),
    deck('exit', 80, 1320, 480),
  ],
  extras: [
    spikes('yard_spikes', 2100, 1800, 120),
    spikes('pillar_a_spikes', 3200, 976, 100),
    spikes('pillar_b_spikes', 2000, 976, 100),
    spikes('roof_spikes', 4180, 976, 80),
  ],
});
