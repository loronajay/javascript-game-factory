// The courses at Windrush Downs, and a run round one (planning-docs/FARM_RIDING_PLAN.md).
//
// A course is a start line, the things to pass in order — fences, the oval's
// quarter points — and a finish line. Ride through a course's start the way
// it runs and the clock starts; pass every fence in order (a fence is passed
// when the rider crosses its middle going the course's way) and cross the
// finish, and the run is done: its time in ticks and its faults (four for
// every rail down, show-jumping's count). A fence missed is shown and the
// finish does not count until it is gone back for. Crossing the start again
// mid-run starts afresh.
//
// A run keeps its INPUT LOG — one packed byte per tick (`packRideInput`) —
// with the horse's state at the start, so the server can ride it again on the
// same sim and pay for what really happened, never for what was claimed.
//
// Pure — no THREE, no DOM, no clock of its own: ticks are the ride sim's.

import { forwardOf } from "./farm-ride-geometry.mjs";
import {
  GALLOP_FINISH,
  GALLOP_START,
  NOVICE_FENCES,
  OPEN_FENCES,
  OVAL_CHECKPOINTS,
  OVAL_FINISH,
  OVAL_LAP_METRES,
  XC_CHAMPIONSHIP_FENCES,
  XC_FENCES,
  XC_FINISH,
  XC_START,
  DOWNS_RINGS,
  NORTH,
  SOUTH,
  type DownsFence,
  type DownsLine,
} from "./downs-scene.mjs";
import type { RideEvent, RideState } from "./farm-ride.mjs";

export const FAULTS_PER_RAIL = 4;
/** A run longer than this is abandoned (ten minutes of ticks). */
export const MAX_RUN_TICKS = 60 * 60 * 10;
export const TICKS_PER_SECOND = 60;

export type DownsCourseKind = "sprint" | "jumping" | "cross-country" | "oval";
export type DownsCourseId = "gallop" | "novice" | "open" | "xc" | "xc-championship" | "oval-1" | "oval-2";

export type CourseStep = Readonly<{ kind: "fence"; fence: DownsFence; line: DownsLine } | { kind: "checkpoint"; line: DownsLine }>;

export type DownsCourse = Readonly<{
  id: DownsCourseId;
  title: string;
  kind: DownsCourseKind;
  start: DownsLine;
  steps: readonly CourseStep[];
  finish: DownsLine;
  /** The perk a rider needs to ride it (`farm-riding-skill.mts`), if any. */
  needs: "openRing" | "championship" | null;
  /** Roughly how long a sound horse takes, for the XP it pays (seconds). */
  par: number;
  /** A course a solo rider can start by riding through its start (the oval's two-lap run is for races). */
  solo: boolean;
  metres: number;
}>;

/** The line across a fence's middle, the way the course takes it. */
export function fenceLine(fence: DownsFence): DownsLine {
  return Object.freeze({ id: fence.id, x: fence.x, z: fence.z, heading: fence.heading, width: fence.width + 1.5 });
}

const fenceSteps = (fences: readonly DownsFence[]): CourseStep[] => fences.map((fence) => Object.freeze({ kind: "fence" as const, fence, line: fenceLine(fence) }));
const ringLine = (ringId: string, heading: number): DownsLine => {
  const ring = DOWNS_RINGS.find((entry) => entry.id === ringId)!;
  return Object.freeze({ id: `${ringId}-${heading === NORTH ? "in" : "out"}`, x: ring.gate.x, z: ring.gate.z, heading, width: 7 });
};

function ovalSteps(laps: number): CourseStep[] {
  const steps: CourseStep[] = [];
  for (let lap = 0; lap < laps; lap += 1) {
    for (const line of OVAL_CHECKPOINTS) steps.push(Object.freeze({ kind: "checkpoint" as const, line: Object.freeze({ ...line, id: `${line.id}-${lap + 1}` }) }));
    if (lap < laps - 1) steps.push(Object.freeze({ kind: "checkpoint" as const, line: Object.freeze({ ...OVAL_FINISH, id: `oval-lap-${lap + 1}` }) }));
  }
  return steps;
}

export const DOWNS_COURSES: readonly DownsCourse[] = Object.freeze([
  Object.freeze({ id: "gallop", title: "The Gallop", kind: "sprint", start: GALLOP_START, steps: Object.freeze([]), finish: GALLOP_FINISH, needs: null, par: 22, solo: true, metres: 172 }),
  Object.freeze({ id: "novice", title: "Novice Ring", kind: "jumping", start: ringLine("novice", NORTH), steps: Object.freeze(fenceSteps(NOVICE_FENCES)), finish: ringLine("novice", SOUTH), needs: null, par: 45, solo: true, metres: 140 }),
  Object.freeze({ id: "open", title: "Open Ring", kind: "jumping", start: ringLine("open", NORTH), steps: Object.freeze(fenceSteps(OPEN_FENCES)), finish: ringLine("open", SOUTH), needs: "openRing", par: 45, solo: true, metres: 140 }),
  Object.freeze({ id: "xc", title: "Cross-Country", kind: "cross-country", start: XC_START, steps: Object.freeze(fenceSteps(XC_FENCES)), finish: XC_FINISH, needs: null, par: 75, solo: true, metres: 560 }),
  Object.freeze({ id: "xc-championship", title: "Cross-Country · Championship", kind: "cross-country", start: XC_START, steps: Object.freeze(fenceSteps(XC_CHAMPIONSHIP_FENCES)), finish: XC_FINISH, needs: "championship", par: 75, solo: true, metres: 560 }),
  Object.freeze({ id: "oval-1", title: "The Oval · 1 lap", kind: "oval", start: OVAL_FINISH, steps: Object.freeze(ovalSteps(1)), finish: OVAL_FINISH, needs: null, par: 40, solo: true, metres: Math.round(OVAL_LAP_METRES) }),
  Object.freeze({ id: "oval-2", title: "The Oval · 2 laps", kind: "oval", start: OVAL_FINISH, steps: Object.freeze(ovalSteps(2)), finish: OVAL_FINISH, needs: null, par: 80, solo: false, metres: Math.round(OVAL_LAP_METRES * 2) }),
]);

export function findDownsCourse(id: unknown): DownsCourse | undefined {
  return typeof id === "string" ? DOWNS_COURSES.find((course) => course.id === id) : undefined;
}

/** True when moving from `from` to `to` crosses the line the way it runs. */
export function crossesLine(line: DownsLine, from: Readonly<{ x: number; z: number }>, to: Readonly<{ x: number; z: number }>): boolean {
  const forward = forwardOf(line.heading);
  const side = (point: Readonly<{ x: number; z: number }>) => (point.x - line.x) * forward.x + (point.z - line.z) * forward.z;
  const before = side(from);
  const after = side(to);
  if (!(before < 0 && after >= 0)) return false;
  const t = before / (before - after);
  const x = from.x + (to.x - from.x) * t;
  const z = from.z + (to.z - from.z) * t;
  // Along the line (perpendicular to the heading): inside half its width.
  const across = (x - line.x) * -forward.z + (z - line.z) * forward.x;
  return Math.abs(across) <= line.width / 2;
}

/** The horse at the moment a run started: what the server replays from. */
export type RunStart = Readonly<{ x: number; z: number; y: number; vy: number; heading: number; speed: number; stamina: number; winded: boolean; airborne: boolean; stumble: number; jumpHeld: boolean }>;

export type CourseRun = Readonly<{
  courseId: DownsCourseId;
  phase: "running" | "finished" | "abandoned";
  /** Ride-sim ticks since the start. */
  ticks: number;
  /** The index of the next step to pass. */
  next: number;
  faults: number;
  /** Fence ids a rail came down at. */
  knocked: readonly string[];
  /** A fence the rider went past without taking (the finish will not count until it is taken). */
  missed: string;
  start: RunStart;
  /** One packed input byte per tick. */
  inputs: readonly number[];
}>;

export type CourseEvent = Readonly<{ kind: "started" | "passed" | "fault" | "missed" | "finished" | "abandoned" | "restarted"; courseId: DownsCourseId; id?: string }>;

export function runStartOf(state: RideState): RunStart {
  return Object.freeze({ x: state.x, z: state.z, y: state.y, vy: state.vy, heading: state.heading, speed: state.speed, stamina: state.stamina, winded: state.winded, airborne: state.airborne, stumble: state.stumble, jumpHeld: state.jumpHeld });
}

/**
 * One tick of course-keeping, after a ride step. `before`/`after` are the
 * horse either side of the step, `input` the byte that drove it, `events` the
 * sim's. `allowed` says which courses this rider may start (perks, and the
 * cross-country line chosen); a run already going carries on.
 */
export function stepCourse(
  run: CourseRun | null,
  before: RideState,
  after: RideState,
  input: number,
  events: readonly RideEvent[],
  allowed: (course: DownsCourse) => boolean,
): Readonly<{ run: CourseRun | null; events: readonly CourseEvent[] }> {
  const out: CourseEvent[] = [];
  // A new start: any allowed solo course whose start line this step crossed (the one already running restarts).
  const starting = DOWNS_COURSES.find((course) => course.solo && allowed(course) && crossesLine(course.start, before, after));
  // The oval starts and finishes on one line: crossing it with every quarter passed is the finish, not a fresh start.
  const finishing = Boolean(starting && run?.phase === "running" && run.courseId === starting.id && run.next >= starting.steps.length && crossesLine(starting.finish, before, after));
  if (starting && !finishing) {
    const restarted = run?.phase === "running" && run.courseId === starting.id;
    out.push({ kind: restarted ? "restarted" : "started", courseId: starting.id });
    return Object.freeze({
      run: Object.freeze({ courseId: starting.id, phase: "running", ticks: 0, next: 0, faults: 0, knocked: Object.freeze([]), missed: "", start: runStartOf(after), inputs: Object.freeze([]) }),
      events: Object.freeze(out),
    });
  }
  if (!run || run.phase !== "running") return Object.freeze({ run, events: Object.freeze(out) });
  const course = findDownsCourse(run.courseId)!;
  const ticks = run.ticks + 1;
  const inputs = Object.freeze([...run.inputs, input & 63]);
  let { next, faults, missed } = run;
  let knocked = run.knocked;
  const courseFences = new Set(course.steps.filter((step) => step.kind === "fence").map((step) => (step as { fence: DownsFence }).fence.id));
  for (const event of events) {
    if (event.kind === "fault" && event.id && courseFences.has(event.id) && !knocked.includes(event.id)) {
      faults += FAULTS_PER_RAIL;
      knocked = Object.freeze([...knocked, event.id]);
      out.push({ kind: "fault", courseId: course.id, id: event.id });
    }
  }
  const step = course.steps[next];
  if (step && crossesLine(step.line, before, after)) {
    next += 1;
    missed = "";
    out.push({ kind: "passed", courseId: course.id, id: step.line.id });
  } else {
    // Past a later fence without the one due: say which one was missed.
    for (let index = next + 1; index < course.steps.length; index += 1) {
      const later = course.steps[index]!;
      if (later.kind === "fence" && crossesLine(later.line, before, after) && step) {
        missed = step.kind === "fence" ? step.fence.id : step.line.id;
        out.push({ kind: "missed", courseId: course.id, id: missed });
        break;
      }
    }
  }
  if (next >= course.steps.length && crossesLine(course.finish, before, after)) {
    out.push({ kind: "finished", courseId: course.id });
    return Object.freeze({ run: Object.freeze({ ...run, phase: "finished", ticks, next, faults, knocked, missed: "", inputs }), events: Object.freeze(out) });
  }
  if (next < course.steps.length && crossesLine(course.finish, before, after) && course.kind !== "oval") {
    const due = course.steps[next]!;
    missed = due.kind === "fence" ? due.fence.id : due.line.id;
    out.push({ kind: "missed", courseId: course.id, id: missed });
  }
  if (ticks >= MAX_RUN_TICKS) {
    out.push({ kind: "abandoned", courseId: course.id });
    return Object.freeze({ run: Object.freeze({ ...run, phase: "abandoned", ticks, next, faults, knocked, missed, inputs }), events: Object.freeze(out) });
  }
  return Object.freeze({ run: Object.freeze({ ...run, ticks, next, faults, knocked, missed, inputs }), events: Object.freeze(out) });
}

/** A run's time in seconds. */
export function runSeconds(run: Pick<CourseRun, "ticks">): number {
  return run.ticks / TICKS_PER_SECOND;
}

export function formatRunTime(ticks: number): string {
  const seconds = ticks / TICKS_PER_SECOND;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${rest.toFixed(2).padStart(5, "0")}` : `${rest.toFixed(2)}s`;
}

/** Which is better: fewer faults first, then the faster time (show-jumping's order). */
export function betterRun(a: Readonly<{ ticks: number; faults: number }>, b: Readonly<{ ticks: number; faults: number }> | null): boolean {
  if (!b) return true;
  return a.faults < b.faults || (a.faults === b.faults && a.ticks < b.ticks);
}

// ---------------------------------------------------------------- personal bests (local)

export type RunBest = Readonly<{ ticks: number; faults: number; horse: string; at: number }>;
export type RunBests = Readonly<Partial<Record<DownsCourseId, RunBest>>>;
export const BESTS_STORAGE_KEY = "jgf.downs.bests.v1";

export function loadRunBests(storage: Pick<Storage, "getItem"> | null): RunBests {
  try {
    const parsed = JSON.parse(storage?.getItem(BESTS_STORAGE_KEY) ?? "{}");
    const bests: Partial<Record<DownsCourseId, RunBest>> = {};
    for (const course of DOWNS_COURSES) {
      const entry = parsed?.[course.id];
      if (entry && Number.isFinite(entry.ticks) && Number.isFinite(entry.faults)) {
        bests[course.id] = Object.freeze({ ticks: Math.max(1, Math.floor(entry.ticks)), faults: Math.max(0, Math.floor(entry.faults)), horse: String(entry.horse ?? "").slice(0, 24), at: Number(entry.at) || 0 });
      }
    }
    return Object.freeze(bests);
  } catch {
    return Object.freeze({});
  }
}

/** Record a finished run if it beats the best; the bests either way. */
export function recordRunBest(bests: RunBests, run: CourseRun, horse: string, at: number, storage: Pick<Storage, "setItem"> | null): Readonly<{ bests: RunBests; improved: boolean }> {
  if (run.phase !== "finished") return { bests, improved: false };
  const current = bests[run.courseId] ?? null;
  if (!betterRun(run, current)) return { bests, improved: false };
  const next = Object.freeze({ ...bests, [run.courseId]: Object.freeze({ ticks: run.ticks, faults: run.faults, horse, at }) });
  try {
    storage?.setItem(BESTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A private window keeps it for the visit.
  }
  return { bests: next, improved: true };
}
