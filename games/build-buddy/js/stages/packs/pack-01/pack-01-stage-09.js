import { createTeamworkStage, deck, climb, gantry, spikes, girder, tool } from './pack-01-stage-helpers.js';

// A high start, a long drop bridge, then a corridor under a spiked ceiling
// where a held jump is lethal and the gap in the floor can only be crossed on
// a platform laid flush with it, in tap-hops. Past the ceiling the route
// launches into the sky off a floating spring into a platform, climbs the sky
// mast, and drops a long bridge to the exit.
export const pack01Stage09 = createTeamworkStage({
  stageNumber: 9,
  name: 'Skybridge',
  archetype: 'low_ceiling_corridor',
  rulePreset: 'standard',
  timerMs: 240000,
  route: [
    deck('start', 80, 720, 560),
    gantry('drop_rack', 900, 960, 300),
    deck('landing', 2300, 1500, 400, 64, [tool('platform', 1700, 1200)]),
    deck('corridor_end', 3180, 1500, 520, 64, { tools: [tool('platform', 2880, 1500)], low: true }),
    deck('sky_island', 4500, 1020, 400, 64, [tool('springBlue', 3880, 1440), tool('platform', 4300, 1160)]),
    climb('sky_mast', 4900, 300, 720),
    deck('roof', 4952, 276, 448),
    deck('exit', 6500, 576, 560, 64, [tool('platform', 5900, 440)]),
  ],
  extras: [
    ...girder('corridor_girder', 2560, 1300, 1300),
    spikes('corridor_spikes', 3400, 1500, 80),
    spikes('island_spikes', 4700, 1020, 80),
    spikes('roof_spikes', 5200, 276, 80),
  ],
});
