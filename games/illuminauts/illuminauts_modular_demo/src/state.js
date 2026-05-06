import { HEARTS_MAX, STAMINA_MAX } from './config.js';
import { createWorldMap } from './map.js';

export function createGameState() {
  const map = createWorldMap();

  return {
    map,
    player: {
      x: map.start.x,
      y: map.start.y,
      spawnX: map.start.x,
      spawnY: map.start.y,
      dir: 'down',
      hearts: HEARTS_MAX,
      chips: 0,
      stamina: STAMINA_MAX,
      lastMoveAt: 0,
      invulnerableUntil: 0,
      powerUntil: 0,
      won: false
    },
    hazards: {
      aliens: [
        {
          id: 'alien-upper-route',
          route: [
            { x: 8, y: 5 },
            { x: 9, y: 5 },
            { x: 10, y: 5 },
            { x: 11, y: 5 },
            { x: 10, y: 5 },
            { x: 9, y: 5 }
          ],
          index: 0,
          lastStepAt: 0,
          stepMs: 620
        },
        {
          id: 'alien-right-route',
          route: [
            { x: 21, y: 9 },
            { x: 22, y: 9 },
            { x: 23, y: 9 },
            { x: 24, y: 9 },
            { x: 23, y: 9 },
            { x: 22, y: 9 }
          ],
          index: 0,
          lastStepAt: 0,
          stepMs: 540
        },
        {
          id: 'alien-lower-route',
          route: [
            { x: 13, y: 21 },
            { x: 14, y: 21 },
            { x: 15, y: 21 },
            { x: 16, y: 21 },
            { x: 15, y: 21 },
            { x: 14, y: 21 }
          ],
          index: 0,
          lastStepAt: 0,
          stepMs: 700
        }
      ],
      laserGates: [
        {
          id: 'gate-lower-left',
          // Short timed barrier in the lower-left route. It creates waiting pressure without forming an impossible hallway.
          tiles: [
            { x: 6, y: 21 },
            { x: 7, y: 21 },
            { x: 8, y: 21 }
          ],
          cycleMs: 3100,
          warningMs: 760,
          activeMs: 820,
          offsetMs: 0
        },
        {
          id: 'gate-final-approach',
          // Timed beam directly before the final Laser Door approach. This should be waited out, not brute-forced.
          tiles: [
            { x: 13, y: 15 },
            { x: 14, y: 15 },
            { x: 15, y: 15 }
          ],
          cycleMs: 3400,
          warningMs: 780,
          activeMs: 860,
          offsetMs: 1100
        }
      ],
      turrets: [
        {
          id: 'turret-key-route',
          // Short beam near the right-side Access Chip route. It is intentionally not a full hallway-length beam.
          x: 21,
          y: 7,
          dx: 1,
          dy: 0,
          range: 2,
          cycleMs: 3000,
          warningMs: 820,
          activeMs: 520,
          offsetMs: 350
        },
        {
          id: 'turret-bottom-route',
          // Short beam across the bottom route. Players can wait for the cooldown or sprint after the warning phase ends.
          x: 13,
          y: 21,
          dx: 1,
          dy: 0,
          range: 5,
          cycleMs: 3600,
          warningMs: 850,
          activeMs: 560,
          offsetMs: 1650
        }
      ]
    },
    input: {
      held: new Set(),
      justPressed: new Set()
    },
    message: 'Find an Access Chip, then reach the Beacon Core.',
    lastTime: performance.now()
  };
}
