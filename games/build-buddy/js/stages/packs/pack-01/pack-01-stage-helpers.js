import { compileStageBlueprint } from '../../stage-authoring.js';

// Geometry is authored per course. Array order is traversal order, used only by
// the physics checks; no solution path or instructions are exposed in the HUD.
export function createTeamworkStage({ route, ...options }) {
  const floors = route.filter(beat => beat.kind === 'solid' || beat.kind === 'oneWay');
  const first = floors[0], last = floors.at(-1);
  const floorY = Math.max(...route.map(beat => beat.y + (beat.h ?? 0)));
  const width = Math.max(...route.map(beat => beat.x + (beat.w ?? 190))) + 240;
  const stage = compileStageBlueprint({
    ...options, width, height: floorY + 440, deathY: floorY + 340,
    start: { x: first.x + 100, y: first.y - 60 },
    goal: { x: last.x + last.w - 160, y: last.y - 160, w: 100, h: 160 },
    route: [
      ...route.map((beat, i) => ({ ...beat, id: `${i}_${beat.id}` })),
      pit('yard_floor', 0, width, floorY + 240),
    ],
  });
  Object.assign(stage.noBuildZones[0], { x: stage.start.x - 20, y: stage.start.y - 20, w: 80, h: 100 });
  return stage;
}

export function deck(id, x, y, w, h = 64) {
  return { id, kind: 'solid', x, y, w, h };
}

export function gantry(id, x, y, w) {
  return { id, kind: 'oneWay', x, y, w, h: 18 };
}

export function pit(id, x, w, y) {
  return { id, kind: 'hazard', x, y, w, h: 80 };
}

export function climb(id, x, y, h) {
  return { id, kind: 'climbable', x, y, h };
}
