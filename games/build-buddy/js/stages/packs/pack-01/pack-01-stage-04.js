import { createTeamworkStage, deck, climb, spikes, slab, lock, tool } from '../../course-helpers.js';

// A vertical well. Lock zones fill the shaft except one narrow column, too
// thin for a platform but exactly wide enough for a spring, so the way up is a
// spring elevator: a blue on the floor, then floating blues the Runner comes
// down onto and rebounds off, placed rung by rung as the Runner climbs (a blue
// bounce is a little under 400px, so four rungs sit 370 apart). The
// well opens onto a gallery, a spring-and-platform side launch, a wall, and a
// drop bridge to the exit.
export const pack01Stage04 = createTeamworkStage({
  stageNumber: 4,
  name: 'Springwell',
  archetype: 'spring_tower',
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
    lock('well_lock_east', 960, 1212, 240, 1148),
    spikes('gallery_spikes', 2500, 1148, 80),
    spikes('roof_spikes', 4240, 256, 80),
  ],
});
