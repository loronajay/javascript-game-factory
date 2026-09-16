import { createTeamworkStage, deck, climb, spikes, girder, spikeBall, tool } from '../../course-helpers.js';

// The finale chains the pack's problems with two platforms. A lane on the
// deck line forces the first bridge under it, the tide rides the whole yard
// so every pier hop is taken as it passes, a hanging wall is caught off a
// blue spring while a ball guards its face, the upper level doubles back
// LEFT through a spiked low corridor whose gap takes a flush platform and
// tap-hops, the east wall is climbed from its right side, and the exit is a
// blue spring into a platform 560 above the roof with a ball crossing the
// top of the arc.
export const pack02Stage10 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 10,
  name: 'Lighthouse',
  archetype: 'harbor_finale',
  kit: { platform: 2, springBlue: 1 },
  timerMs: 270000,
  route: [
    deck('start', 80, 2560, 560),
    deck('pier_a', 1540, 2560, 400, 64, [tool('platform', 1000, 2680)]),
    deck('pier_b', 2880, 2560, 400, 64, [tool('platform', 2320, 2560)]),
    deck('yard_end', 4180, 2560, 520, 64, [tool('platform', 3640, 2560)]),
    climb('west_wall', 4560, 1560, 540, [tool('springBlue', 4500, 2520)]),
    deck('corridor_a', 4200, 1536, 320),
    deck('corridor_b', 3400, 1536, 400, 64, { tools: [tool('platform', 3920, 1536)], low: true }),
    climb('east_wall', 3348, 936, 600),
    deck('launch_roof', 3500, 912, 600),
    deck('exit', 4700, 352, 540, 64, [tool('springBlue', 4000, 880), tool('platform', 4400, 560)]),
  ],
  extras: [
    spikeBall('deck_line_patrol', 760, 2540, 1500, 2540, { period: 4 }),
    spikeBall('tide', 1700, 2440, 4100, 2440, { period: 8 }),
    spikeBall('wall_guard', 4490, 2150, 4490, 2450, { period: 3 }),
    spikeBall('arc_patrol', 4100, 560, 4340, 560, { period: 3 }),
    spikes('pier_spikes', 1660, 2560, 120),
    spikes('yard_spikes', 3000, 2560, 120),
    ...girder('corridor_girder', 3480, 1336, 1040),
    spikes('roof_spikes', 3700, 912, 100),
  ],
});
