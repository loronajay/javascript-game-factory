import fs from 'node:fs';
const game = 'scripts/horse-game.js';
fs.writeFileSync(game, fs.readFileSync(game, 'utf8').replaceAll('normalizeSandboxPieces(', 'normalizeHorsePieces('));
const file = 'scripts/sim/hoop-placement.js';
let source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('// THE VOLUME IS');
const end = source.indexOf('// Pure.', start);
source = source.slice(0, start) + `// Placement spans the player's horizontal aim and the wall down toward the
// floor, rather than borrowing the classic run's narrow motion band. The top
// keeps the existing ceiling clearance; the bottom leaves room below the rim
// for the ball to drop through. Each motion's entire sweep must fit this box.
// Classic runs still use hoopAt without a placed base, so their paths do not move.
//
` + source.slice(end);
source = source.replace('import { AIM_MAX_X, AIM_MIN_X, HOOP_BASE_RIM_Y, HOOP_BASE_X }', 'import { AIM_MAX_X, AIM_MIN_X, BALL_RADIUS_WORLD, HOOP_BASE_RIM_Y, HOOP_BASE_X, RIM_CENTER_Z, RIM_RADIUS_WORLD }');
source = source.replace('const clamp =', 'import { projectPoint } from "./projection.js";\n\nconst clamp =');
const comment = source.indexOf('/**\n * The screen box');
const stop = source.indexOf('/**', comment + 3);
source = source.slice(0, comment) + `/** Reachable wall area for the rim centre, including its whole motion path. */
export const HOOP_PLACEMENT_BOUNDS = Object.freeze({
  minX: AIM_MIN_X,
  maxX: AIM_MAX_X,
  minY: HOOP_TRAVEL_BOUNDS.minY,
  maxY: projectPoint({ x: 0, y: RIM_RADIUS_WORLD + BALL_RADIUS_WORLD, z: RIM_CENTER_Z }).y,
});

` + source.slice(stop);
fs.writeFileSync(file, source);
