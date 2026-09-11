import { compileStageBlueprint } from '../../stage-authoring.js';

export const BASE_Y = 1300;

// Each point is a work station, in traversal order (never sorted by X).
// 480px lifts exceed held + double jump; 1200px spans exceed unassisted range.
// No recovery ledges: a misplaced catch must not become a permanent solo route.
export function createTeamworkStage({ points, ...options }) {
  const floorY = Math.max(...points.map(p => p[1]));
  const width = Math.max(1600, ...points.map(p => p[0] + 640));
  const last = points.at(-1);
  const stage = compileStageBlueprint({
    ...options,
    width,
    height: floorY + 440,
    deathY: floorY + 340,
    start: { x: points[0][0] + 100, y: points[0][1] - 60 },
    goal: { x: last[0] + 300, y: last[1] - 160, w: 100, h: 160 },
    route: [
      ...points.map(([x, y], i) => deck(i === 0 ? 'start_deck' : i === points.length - 1 ? 'goal_deck' : `station_${i}`, x, y, 480, 64)),
      pit('yard_floor', 0, width, floorY + 280),
    ],
  });
  stage.routeSigns = points.map(([x, y, text], i) => ({
    x: x + 48, y: y - 88, text,
    number: i + 1,
    direction: i === points.length - 1 ? 'EXIT' : points[i + 1][0] > x ? 'RIGHT' : 'LEFT',
  }));
  // Keep both edges available when the first launch points left.
  Object.assign(stage.noBuildZones[0], { x: stage.start.x - 20, y: stage.start.y - 20, w: 80, h: 100 });
  return stage;
}

export function deck(id, x, y, w, h = 70) {
  return { id, kind: 'solid', x, y, w, h };
}

export function lowRecovery(id, x, y = BASE_Y + 230) {
  return { id, kind: 'oneWay', x, y, w: 140, h: 18 };
}

export function pit(id, x, w, y = 1710) {
  return { id, kind: 'hazard', x, y, w, h: 80 };
}

export function block(id, x, y, w, h) {
  return { id, kind: 'blocked', x, y, w, h };
}

export function climb(id, x, y, h) {
  return { id, kind: 'climbable', x, y, h };
}
