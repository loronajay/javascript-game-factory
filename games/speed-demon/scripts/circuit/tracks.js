import { CIRCUIT_WORLD } from "./config.js";

export const JAPAN_NOIR_LINE = Object.freeze([
  { x: 622, y: 861 }, { x: 973, y: 860 }, { x: 1216, y: 807 },
  { x: 1324, y: 723 }, { x: 1381, y: 574 }, { x: 1354, y: 417 },
  { x: 1273, y: 311 }, { x: 1104, y: 232 }, { x: 879, y: 179 },
  { x: 662, y: 139 }, { x: 337, y: 153 }, { x: 194, y: 258 },
  { x: 171, y: 319 }, { x: 185, y: 387 }, { x: 274, y: 477 },
  { x: 503, y: 472 }, { x: 647, y: 431 }, { x: 763, y: 461 },
  { x: 806, y: 489 }, { x: 841, y: 554 }, { x: 826, y: 601 },
  { x: 781, y: 661 }, { x: 558, y: 705 }, { x: 377, y: 705 },
  { x: 227, y: 723 }, { x: 183, y: 785 }, { x: 365, y: 861 },
]);

const CHECKPOINT_INDICES = [0, 3, 6, 9, 12, 15, 18, 21, 24];
const checkpoints = CHECKPOINT_INDICES.map((index) => Object.freeze({
  ...JAPAN_NOIR_LINE[index],
  radius: index === 0 ? 62 : 72,
}));

export const CIRCUIT_TRACKS = Object.freeze([
  Object.freeze({
    id: "japan-noir",
    label: "Japan Noir",
    blurb: "A neon city loop with a technical infield.",
    circuit: true,
    src: "assets/circuit-tracks/japan-noir.png",
    image: "assets/circuit-tracks/japan-noir.png",
    roadMask: "assets/circuit-tracks/japan-noir-road-mask.png",
    world: CIRCUIT_WORLD,
    spawns: Object.freeze([
      Object.freeze({ x: 610, y: 850, angle: Math.PI / 2 }),
      Object.freeze({ x: 650, y: 825, angle: Math.PI / 2 }),
    ]),
    checkpoints: Object.freeze(checkpoints),
    racingLine: JAPAN_NOIR_LINE,
  }),
]);

export const DEFAULT_CIRCUIT_TRACK_ID = "japan-noir";
export const circuitTrackById = (id) => CIRCUIT_TRACKS.find((track) => track.id === id) ?? null;
