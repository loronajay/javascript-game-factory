import { createTeamworkStage, deck, climb, spikes, lock, spikeBall, tool } from '../../course-helpers.js';

// No platforms and exactly one spring of each colour. Lock bands pin each
// spring to deck level, so a lift is decided by height alone: 400 needs the
// green, 520 needs the blue, and the third lift needs the green again after
// it is pulled from the first. The buoys make the lifts a matter of timing as
// well: a ball bobs beside the first ledge where the Runner rises past it, a
// ball patrols head-high over the deck the blue sits on so the Runner must
// jump for the spring as it turns, and one crosses the exit column between
// the two stacked springs.
export const pack02Stage08 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 8,
  name: 'Buoy Exchange',
  archetype: 'timed_spring_exchange',
  kit: { springYellow: 1, springGreen: 1, springBlue: 1 },
  timerMs: 210000,
  route: [
    deck('start', 80, 2828, 480),
    deck('green_ledge', 800, 2428, 400, 64, [tool('springGreen', 460, 2760)]),
    deck('blue_ledge', 1440, 1908, 400, 64, [tool('springBlue', 1100, 2360)]),
    deck('green_again', 2080, 1508, 400, 64, [tool('springGreen', 1740, 1840)]),
    climb('exchange_mast', 2480, 948, 560),
    deck('roof', 2532, 924, 368),
    deck('exit', 3000, 224, 560, 64, [tool('springBlue', 2800, 880), tool('springGreen', 2800, 520)]),
  ],
  extras: [
    lock('first_lift_lock', 80, 1980, 720, 768),
    lock('second_lift_lock', 800, 1480, 640, 868),
    lock('third_lift_lock', 1440, 1080, 640, 748),
    spikeBall('buoy_a', 700, 2450, 700, 2700, { period: 3 }),
    spikeBall('buoy_b', 860, 2318, 1180, 2318, { period: 3 }),
    spikeBall('buoy_c', 2700, 700, 2950, 700, { period: 3 }),
    spikes('green_ledge_spikes', 940, 2428, 80),
    spikes('blue_ledge_spikes', 1600, 1908, 80),
    spikes('roof_spikes', 2680, 924, 80),
  ],
});
