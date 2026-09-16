import { createTeamworkStage, deck, climb, spikes, slab, lock, spikeBall, tool } from '../../course-helpers.js';

// A ballast well. The shaft is locked except one column too narrow for a
// platform, so the way up is a blue spring elevator placed rung by rung, and
// two balls swing into the column at different heights, half a swing apart,
// each lingering in it at the end of its cable. Once the
// Runner leaves the floor the rhythm is fixed, so the whole climb is decided
// by when they first drop onto the bottom spring. Out of the well: a gallery
// bridge, a spring-and-platform launch past a bobbing ball, a mast, and a
// drop bridge to the exit.
export const pack02Stage04 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 4,
  name: 'Ballast Well',
  archetype: 'timed_spring_tower',
  kit: { platform: 2, springBlue: 5 },
  timerMs: 180000,
  route: [
    deck('start', 80, 2400, 1120),
    deck('well_top', 1000, 1148, 400, 64, [
      tool('springBlue', 880, 2360),
      tool('springBlue', 880, 1990),
      tool('springBlue', 880, 1620),
      tool('springBlue', 880, 1250),
    ]),
    deck('gallery', 2300, 1148, 400, 64, [tool('platform', 1800, 1120)]),
    deck('launch', 3600, 840, 400, 64, [tool('springBlue', 2640, 1120), tool('platform', 3160, 840)]),
    climb('well_mast', 4000, 280, 560),
    deck('roof', 4052, 256, 348),
    deck('exit', 5500, 556, 500, 64, [tool('platform', 4880, 400)]),
  ],
  extras: [
    slab('well_west', 600, 1100, 40, 1200),
    slab('well_east', 1200, 1212, 40, 1188),
    lock('well_lock_west', 640, 1200, 240, 1160),
    lock('well_lock_east', 1000, 1212, 200, 1148),
    spikeBall('well_low', 700, 2100, 900, 2100, { period: 4 }),
    spikeBall('well_high', 1140, 1750, 900, 1750, { period: 4, phase: 0.5 }),
    spikeBall('launch_bob', 2980, 600, 2980, 900, { period: 3 }),
    spikes('gallery_spikes', 2500, 1148, 80),
    spikes('roof_spikes', 4240, 256, 80),
  ],
});
