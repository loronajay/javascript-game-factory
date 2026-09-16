import { createTeamworkStage, deck, climb, spikes, spikeBall, tool } from '../../course-helpers.js';

// First tide on the docks introduces the spike ball twice. A ball bobs up and
// down beside the first bridge, so the platform goes past its cable and the
// Runner crosses while the ball is low. Then a ball patrols the cliff-top
// line where a level bridge would go: its lane blocks that build, so the
// bridge is laid a step below and the ball passes overhead. A wall, a drop
// bridge and a green lift finish the shift.
export const pack02Stage01 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 1,
  name: 'Harbor Call',
  archetype: 'spike_ball_intro',
  kit: { platform: 3, springGreen: 1 },
  timerMs: 180000,
  route: [
    deck('start', 80, 1600, 560),
    deck('pier', 1000, 1600, 400),
    deck('quay', 2300, 1600, 400, 64, [tool('platform', 1780, 1600)]),
    deck('cliff', 2700, 1120, 500, 544, [tool('platform', 2500, 1320)]),
    deck('bridgehead', 4200, 1120, 400, 64, [tool('platform', 3400, 1240), tool('platform', 3840, 1240)]),
    climb('service_wall', 4600, 584, 536),
    deck('roof', 4652, 560, 400),
    deck('landing', 5960, 720, 400, 64, [tool('platform', 5460, 720)]),
    deck('exit', 6680, 320, 560, 64, [tool('springGreen', 6280, 640)]),
  ],
  extras: [
    spikeBall('gap_bob', 1600, 1300, 1600, 1560, { period: 3 }),
    spikeBall('cliff_patrol', 3300, 1100, 4020, 1100, { period: 5 }),
    spikes('pier_spikes', 1280, 1600, 120),
    spikes('roof_spikes', 4840, 560, 80),
  ],
});
