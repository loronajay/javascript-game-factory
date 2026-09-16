import { createTeamworkStage, deck, climb, gantry, spikes, spikeBall, tool } from '../../course-helpers.js';

// The night shift left junk racked under the start, eating the platform cap,
// so the Builder clears it while the Runner drops through the gantries. The
// basin below is spikes end to end, crossed on platforms pier to pier, and
// one ball rides the whole length of it like the tide: it clears a Runner
// standing on a platform but not one in the air, so every hop is taken as it
// passes. A fall is the whole drop again unless a checkpoint went down on the
// bank first. A wall, then a blue spring into a platform past a bobbing ball.
export const pack02Stage05 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 5,
  name: 'Night Tide',
  archetype: 'tide_basin',
  kit: { platform: 2, springBlue: 1 },
  timerMs: 240000,
  preplacedTools: [
    tool('platform', 240, 1160), tool('platform', 480, 1240),
    tool('platform', 160, 1320), tool('platform', 640, 1320),
    tool('springYellow', 400, 1120), tool('springYellow', 120, 1200),
    tool('springGreen', 560, 1200),
  ],
  route: [
    deck('start', 80, 1000, 640),
    gantry('upper_rack', 900, 1240, 400),
    gantry('lower_rack', 1400, 1480, 400),
    deck('bank', 1900, 1720, 480),
    deck('first_pier', 3240, 1720, 160, 64, [tool('platform', 2720, 1720)]),
    deck('second_pier', 4260, 1720, 160, 64, [tool('platform', 3740, 1720)]),
    deck('pump_house', 5280, 1720, 480, 64, [tool('platform', 4760, 1720)]),
    climb('pump_wall', 5760, 1000, 720),
    deck('roof', 5812, 976, 468),
    deck('exit', 6980, 436, 560, 64, [tool('springBlue', 6220, 920), tool('platform', 6560, 640)]),
  ],
  extras: [
    deck('basin_floor', 2380, 1900, 2900),
    spikes('basin_spikes', 2380, 1900, 2900),
    spikes('pump_spikes', 5480, 1720, 120),
    spikeBall('tide', 2500, 1600, 5150, 1600, { period: 8 }),
    spikeBall('roof_bob', 6440, 500, 6440, 800, { period: 3 }),
  ],
});
