import { createTeamworkStage, deck, climb, gantry, spikes, girder, spikeBall, tool } from '../../course-helpers.js';

// A high start on the pier and a long drop bridge past a ball drifting down
// its slanted cable, then the fog bank: a corridor under the pier deck's
// spiked girder where a held jump is lethal and the gap in the floor can only
// be crossed on a platform laid flush with it, in tap-hops. Past the girder
// the route launches off a floating spring into a platform with a ball
// bobbing in the flight path, climbs the sky mast, and drops a bridge to the
// exit under a ball patrolling over the landing.
export const pack02Stage09 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 9,
  name: 'Fog Bank',
  archetype: 'fog_corridor',
  kit: { platform: 2, springBlue: 1 },
  timerMs: 240000,
  route: [
    deck('start', 80, 720, 560),
    gantry('drop_rack', 900, 960, 300),
    deck('landing', 2300, 1500, 400, 64, [tool('platform', 1700, 1200)]),
    deck('corridor_end', 3180, 1500, 800, 64, { tools: [tool('platform', 2880, 1500)], low: true }),
    deck('sky_island', 4500, 1020, 400, 64, [tool('springBlue', 4080, 1440), tool('platform', 4300, 1160)]),
    climb('sky_mast', 4900, 300, 720),
    deck('roof', 4952, 276, 448),
    deck('exit', 6500, 576, 560, 64, [tool('platform', 5900, 440)]),
  ],
  extras: [
    ...girder('pier_girder', 2560, 1300, 1300),
    spikeBall('fog_drift', 2000, 850, 2120, 1440, { period: 4 }),
    spikeBall('launch_bob', 4200, 900, 4200, 1300, { period: 3 }),
    spikeBall('landing_patrol', 5880, 240, 6080, 240, { period: 3 }),
    spikes('corridor_spikes', 3400, 1500, 80),
    spikes('island_spikes', 4700, 1020, 80),
    spikes('roof_spikes', 5200, 276, 80),
  ],
});
