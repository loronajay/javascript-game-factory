import { createTeamworkStage, deck, climb, spikes, spikeBall, tool } from '../../course-helpers.js';

// A double-back along the breakwater. The ground run heads right over two
// gaps that need three platforms against a cap of two, then up the lighthouse
// base, and the route turns and comes back LEFT along the seawall pillars.
// Between each pair of pillars a swell rides a diagonal cable from the water
// up over the wall top, so the bridge cannot go level: it goes low, under the
// swell, and the Runner drops to it and climbs out as the ball turns. The exit
// sits over the start, so a hit on the upper level without a checkpoint on
// the roof means the whole breakwater again.
export const pack02Stage07 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 7,
  name: 'Breakwater',
  archetype: 'swell_double_back',
  kit: { platform: 2 },
  timerMs: 240000,
  route: [
    deck('start', 80, 1800, 480),
    deck('mole_a', 1860, 1800, 600, 64, [tool('platform', 1000, 1800), tool('platform', 1440, 1800)]),
    deck('mole_b', 3360, 1800, 600, 64, [tool('platform', 2860, 1800)]),
    climb('lighthouse_base', 3960, 1000, 800),
    deck('light_roof', 4012, 976, 348),
    deck('pillar_a', 3100, 976, 300),
    deck('pillar_b', 1900, 976, 300, 64, [tool('platform', 2500, 1240)]),
    deck('pillar_c', 700, 976, 300, 64, [tool('platform', 1300, 1240)]),
    deck('exit', 80, 1320, 480),
  ],
  extras: [
    spikeBall('mole_bob', 1280, 1450, 1280, 1750, { period: 3 }),
    spikeBall('swell_a', 2260, 1180, 3060, 876, { period: 4 }),
    spikeBall('swell_b', 1060, 1180, 1860, 876, { period: 4, phase: 0.5 }),
    spikes('mole_spikes', 2100, 1800, 120),
    spikes('pillar_a_spikes', 3200, 976, 100),
    spikes('pillar_b_spikes', 2000, 976, 100),
    spikes('roof_spikes', 4180, 976, 80),
  ],
});
