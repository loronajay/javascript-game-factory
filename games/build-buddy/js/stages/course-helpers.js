import { compileStageBlueprint } from './stage-authoring.js';

// Geometry is authored per course. `route` is the ordered list of standing
// surfaces the Runner crosses (decks, gantries, wall tops); `extras` is the
// terrain that shapes the problems between them (spikes, ceilings, lock zones).
// Each route beat may carry `via`: the Builder placements that solve the leg
// arriving at that beat. `via` never reaches the runtime stage or the HUD; it
// is recorded in `courseNotes` so the physics tests can prove every intended
// solution is legal and playable.
export const courseNotes = new Map();

export function createTeamworkStage({ route, extras = [], preplacedTools = [], ...options }) {
  const first = route.find(beat => beat.id === 'start');
  const last = route.find(beat => beat.id === 'exit');
  const all = [...route, ...extras].map(beat => beat.kind === 'spikeBall' ? ballBounds(beat) : beat);
  const floorY = Math.max(...all.map(beat => beat.y + (beat.h ?? 0)));
  const width = Math.max(...all.map(beat => beat.x + (beat.w ?? 190))) + 240;
  const stage = compileStageBlueprint({
    ...options, width, height: floorY + 440, deathY: floorY + 340,
    start: { x: first.x + 100, y: first.y - 60 },
    goal: { x: last.x + last.w - 160, y: last.y - 160, w: 100, h: 160 },
    preplacedTools,
    route: [
      ...route.map(({ via, ...beat }, i) => ({ ...beat, id: `${i}_${beat.id}` })),
      ...extras.map((beat, i) => ({ ...beat, id: `x${i}_${beat.id}` })),
      pit('yard_floor', 0, width, floorY + 240),
    ],
  });
  Object.assign(stage.noBuildZones[0], { x: stage.start.x - 20, y: stage.start.y - 20, w: 80, h: 100 });

  const suffix = String(options.stageNumber).padStart(2, '0');
  const standId = (beat, i) => beat.kind === 'climbable'
    ? `stage_${suffix}_${i}_${beat.id}_top`
    : `stage_${suffix}_${i}_${beat.id}`;
  courseNotes.set(stage.id, {
    route: route.map((beat, i) => standId(beat, i)),
    builds: Object.fromEntries(route.map((beat, i) => [standId(beat, i), normalizeVia(beat.via)])),
  });
  return stage;
}

function normalizeVia(via) {
  if (!via) return null;
  if (Array.isArray(via)) return { tools: via, low: false };
  return { tools: via.tools ?? [], low: Boolean(via.low) };
}

export function deck(id, x, y, w, h = 64, via) {
  return { id, kind: 'solid', x, y, w, h, via };
}

export function gantry(id, x, y, w, via) {
  return { id, kind: 'oneWay', x, y, w, h: 18, via };
}

export function pit(id, x, w, y) {
  return { id, kind: 'hazard', x, y, w, h: 80 };
}

export function climb(id, x, y, h, via) {
  return { id, kind: 'climbable', x, y, h, via };
}

// A spike strip sitting on a deck whose top edge is `y`.
export function spikes(id, x, y, w) {
  return { id, kind: 'hazard', x, y: y - 24, w, h: 24 };
}

// A spike strip hanging from a ceiling whose underside is `y`.
export function spikeCeiling(id, x, y, w) {
  return { id, kind: 'hazard', x, y: y - 24, w, h: 24, facing: 'down' };
}

// A steel girder whose underside is `y`, spiked above and below, so a low
// ceiling has something to hang from and nobody walks along the top of it.
export function girder(id, x, y, w) {
  return [
    slab(`${id}_beam`, x, y - 64, w, 40),
    spikes(`${id}_top`, x, y - 64, w),
    spikeCeiling(`${id}_underside`, x, y, w),
  ];
}

// A spike strip on a wall face at `x`; `facing` is the side the points reach.
export function spikeWall(id, x, y, h, facing = 'left') {
  return { id, kind: 'hazard', x: facing === 'left' ? x - 24 : x, y, w: 24, h, facing };
}

// Solid mass that is not part of the route: ceilings, pillars, cliff faces.
export function slab(id, x, y, w, h) {
  return { id, kind: 'solid', x, y, w, h };
}

// A zone where nothing may be placed. Used to close off the obvious build.
export function lock(id, x, y, w, h) {
  return { id, kind: 'blocked', x, y, w, h };
}

// A floating spike ball riding a cable from (x1, y1) to (x2, y2) and back, one
// round trip every `period` seconds, easing at each end. `phase` (0..1) offsets
// where along the trip it starts, so two balls can be set out of step. The
// lane it sweeps blocks placement, so a Builder builds around it, never over it.
export function spikeBall(id, x1, y1, x2, y2, { r = 28, period = 3, phase = 0 } = {}) {
  return { id, kind: 'spikeBall', from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, r, period, phase };
}

function ballBounds(ball) {
  const x = Math.min(ball.from.x, ball.to.x) - ball.r;
  const y = Math.min(ball.from.y, ball.to.y) - ball.r;
  return { x, y, w: Math.max(ball.from.x, ball.to.x) + ball.r - x, h: Math.max(ball.from.y, ball.to.y) + ball.r - y };
}

export function tool(toolType, x, y) {
  return { toolType, x, y };
}
