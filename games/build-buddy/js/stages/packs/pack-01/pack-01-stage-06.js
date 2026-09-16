import { createTeamworkStage, deck, climb, spikes, spikeWall, slab, lock, tool } from '../../course-helpers.js';

// The only course that goes down. Three shafts with spiked floors; each has a
// side tunnel whose mouth sits under a ledge spiked on top and on its face, so
// neither running the tunnel roofs nor hugging the wall on the way down works. The Builder sees only 300px below the
// Runner, so every shaft is two catches placed in turn: one to stop the fall
// while the mouth is still out of sight, one level with the mouth. Six catches against five platforms means pulling
// the first shaft's catches to lay the last. Blue is gone, and the way out is
// a three-rung green elevator in a slot too narrow for a platform.
function shaft(i, y, s, tunnelW, tunnelH) {
  return [
    slab(`ledge_${i}`, s + 260, y + 340, 100, 60),
    spikes(`ledge_spikes_${i}`, s + 260, y + 340, 100),
    spikeWall(`ledge_face_${i}`, s + 260, y + 340, 60, 'left'),
    slab(`tunnel_ceiling_${i}`, s + 360, y + 300, tunnelW, 100),
    spikes(`ceiling_spikes_${i}`, s + 360, y + 300, tunnelW),
    deck(`shaft_floor_${i}`, s, y + 800, 360),
    spikes(`shaft_spikes_${i}`, s, y + 800, 360),
  ];
}

function catches(y, s) {
  return { tools: [tool('platform', s + 40, y + 240), tool('platform', s + 100, y + 460)], low: true };
}

export const pack01Stage06 = createTeamworkStage({
  stageNumber: 6,
  name: 'Greenline',
  archetype: 'no_blue_descent',
  kit: { platform: 2, springGreen: 3 },
  timerMs: 210000,
  route: [
    deck('start', 80, 600, 560, 800),
    deck('first_tunnel', 1000, 1100, 700, 864, catches(600, 640)),
    deck('second_tunnel', 2060, 1600, 700, 864, catches(1100, 1700)),
    deck('third_tunnel', 3120, 2100, 770, 400, catches(1600, 2760)),
    climb('service_mast', 3890, 1540, 560),
    deck('roof', 3942, 1516, 428),
    deck('exit', 4370, 816, 560, 64, [tool('springGreen', 4270, 1460), tool('springGreen', 4270, 1200), tool('springGreen', 4270, 940)]),
  ],
  extras: [
    ...shaft(1, 600, 640, 700),
    ...shaft(2, 1100, 1700, 700),
    ...shaft(3, 1600, 2760, 700),
    lock('roof_lock', 3942, 820, 328, 656),
    lock('exit_face_lock', 4330, 820, 40, 656),
  ],
});
