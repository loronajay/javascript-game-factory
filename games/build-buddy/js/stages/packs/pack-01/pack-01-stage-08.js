import { createTeamworkStage, deck, climb, spikes, lock, tool } from '../../course-helpers.js';

// No platforms and exactly one spring of each colour. Lock bands pin each
// spring to deck level, so a lift is decided by height alone: 400 needs the
// green, 520 needs the blue, and the third lift needs the green again after
// it is pulled from the first. The exit is 700 up off the roof, more than any
// one spring, so two are stacked: the blue on the roof and the green, pulled
// once more, floating where the Runner comes back down from the first bounce.
export const pack01Stage08 = createTeamworkStage({
  stageNumber: 8,
  name: 'Spring Exchange',
  archetype: 'no_platform_springs',
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
    spikes('green_ledge_spikes', 940, 2428, 80),
    spikes('blue_ledge_spikes', 1600, 1908, 80),
    spikes('roof_spikes', 2680, 924, 80),
  ],
});
