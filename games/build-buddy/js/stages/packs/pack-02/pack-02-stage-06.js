import { createTeamworkStage, deck, climb, spikes, spikeWall, slab, lock, spikeBall, tool } from '../../course-helpers.js';

// The dock drained: three shafts down the hull, each with a spiked floor and a
// side tunnel whose mouth sits under a spiked ceiling face. A ball rides the
// near wall of every shaft, so the Runner leaves the ledge as it passes and
// the catches all go on the far side. The Builder sees only 300px below the
// Runner, so each shaft is two catches placed in turn: one to stop the fall
// while the mouth is still out of sight, one level with the mouth. Six
// catches against five platforms means pulling the first shaft's to lay the
// last. Blue is gone, and the way out is a green elevator in a slot too
// narrow for a platform.
function shaft(i, S, Y, phase) {
  return [
    slab(`tunnel_ceiling_${i}`, S + 300, Y + 300, 700, 100),
    spikes(`ceiling_spikes_${i}`, S + 300, Y + 300, 700),
    spikeWall(`mouth_face_${i}`, S + 300, Y + 300, 100, 'left'),
    deck(`shaft_floor_${i}`, S, Y + 800, 300),
    spikes(`shaft_spikes_${i}`, S, Y + 800, 300),
    spikeBall(`shaft_ball_${i}`, S + 40, Y - 40, S + 40, Y + 600, { period: 4, phase }),
  ];
}

function catches(S, Y) {
  return { tools: [tool('platform', S + 120, Y + 240), tool('platform', S + 120, Y + 500)], low: true };
}

export const pack02Stage06 = createTeamworkStage({
  packId: 'pack_02',
  stageNumber: 6,
  name: 'Dry Dock',
  archetype: 'guarded_descent',
  kit: { platform: 2, springGreen: 3 },
  timerMs: 210000,
  route: [
    deck('start', 80, 600, 560, 800),
    deck('first_tunnel', 940, 1100, 700, 864, catches(640, 600)),
    deck('second_tunnel', 1940, 1600, 700, 864, catches(1640, 1100)),
    deck('third_tunnel', 2940, 2100, 770, 400, catches(2640, 1600)),
    climb('service_mast', 3710, 1540, 560),
    deck('roof', 3762, 1516, 428),
    deck('exit', 4190, 816, 560, 64, [
      tool('springGreen', 4090, 1460),
      tool('springGreen', 4090, 1200),
      tool('springGreen', 4090, 940),
    ]),
  ],
  extras: [
    ...shaft(1, 640, 600, 0),
    ...shaft(2, 1640, 1100, 0.5),
    ...shaft(3, 2640, 1600, 0),
    lock('roof_lock', 3762, 820, 328, 656),
    lock('exit_face_lock', 4150, 820, 40, 656),
  ],
});
