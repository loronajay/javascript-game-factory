import { createTeamworkStage, deck, climb, spikes, lock, spikeBall, tool } from '../../course-helpers.js';

// A long run of piers where the cables decide the height of every bridge. The
// first lane sits exactly on the deck line, so both platforms go a step down
// and the Runner crosses under the ball; bobbing balls hang in the flight
// paths between the next piers so each landing is timed; and the last bridge
// is built freely but a ball sweeps just above it, so the Runner waits for
// the ball to turn, then sprints. Seven platforms against a cap of five means
// the Builder is always pulling from behind. Blue only reaches the exit.
export const pack02Stage02 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 2,
  name: 'Cargo Lines',
  archetype: 'lane_bridge_chain',
  kit: { platform: 3, springBlue: 1 },
  timerMs: 210000,
  route: [
    deck('start', 80, 1400, 560),
    deck('pier_a', 1940, 1400, 360, 64, [tool('platform', 1000, 1520), tool('platform', 1480, 1520)]),
    deck('pier_b', 3340, 1160, 360, 64, [tool('platform', 2760, 1240)]),
    deck('far_bank', 4940, 1520, 360, 64, [tool('platform', 3900, 1300), tool('platform', 4400, 1420)]),
    climb('warehouse', 5300, 800, 720),
    deck('roof', 5352, 776, 488),
    deck('awning', 7140, 748, 360, 64, [tool('platform', 6240, 776), tool('platform', 6700, 776)]),
    deck('exit', 7880, 280, 560, 64, [tool('springBlue', 7440, 720)]),
  ],
  extras: [
    spikeBall('deck_line_patrol', 800, 1380, 1780, 1380, { period: 5 }),
    spikeBall('pier_bob', 2560, 900, 2560, 1300, { period: 3, phase: 0.5 }),
    spikeBall('bank_bob', 4260, 900, 4260, 1380, { period: 3 }),
    spikeBall('roof_patrol', 6100, 700, 7000, 700, { period: 6 }),
    spikes('pier_b_spikes', 3580, 1160, 120),
    spikes('roof_spikes', 5560, 776, 120),
    lock('no_stairs', 7140, 300, 740, 420),
  ],
});
