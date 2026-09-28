// Making a piece of furniture: the Carpentry skill's games. PURE — no DOM, no
// THREE, no clock (times are passed in, in seconds), no dice of its own (a
// random source is injected) — so every step's maths is tested under node.
//
// A pattern is a short run of steps (`farm-catalog/carpentry.mts`), each its
// own small game, each scored 0..1, and each asking a different thing of the
// hands so the bench does not play like the stove:
//
//   measure  a pencil sweeps along the board; press E as it crosses the
//            mark. Three marks, each perfect / good / poor. (Timing a tap.)
//   saw      the saw calls push, pull, push… on a beat; answer each stroke
//            with A (push) or D (pull) on the beat. Eight strokes; the wrong
//            key or a missed beat binds the blade. (Rhythm.)
//   nail     hold E to raise the hammer, let go with its head in the band
//            to drive the nail flush. Three nails; hold too long and you
//            overswing and bend it. (Hold and release.)
//
// The mean of the steps decides the piece's stars — rough-hewn, stained or
// varnished — and that is ALL the games decide: what a piece takes and the XP
// it pays are the pattern's, and the server makes the piece (it recomputes the
// stars from the step scores with the kitchen's rule, mirrored in
// platform-api/src/services/farm-carpentry-catalog.mts). Carpentry level
// widens every window a little — steadier hands, never a shortcut.

import { findPattern, type CraftStepKind, type PieceStars } from "./farm-catalog/carpentry.mjs";

// ---------------------------------------------------------------- scoring

/** The mean score at or above which a piece earns two stars, and three: the kitchen's scale. */
export const TWO_STAR_SCORE = 0.5;
export const THREE_STAR_SCORE = 0.8;

export function pieceStars(scores: readonly number[]): PieceStars {
  if (!scores.length) return 1;
  const mean = scores.reduce((sum, score) => sum + clamp01(score), 0) / scores.length;
  return mean >= THREE_STAR_SCORE ? 3 : mean >= TWO_STAR_SCORE ? 2 : 1;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** 0 at level 1, 1 at level 99: how much steadier the carpenter's hands are. */
function mastery(level: number): number {
  const reached = Math.min(99, Math.max(1, Number.isFinite(level) ? level : 1));
  return (reached - 1) / 98;
}

function unit(random: () => number): number {
  const roll = random();
  return Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0.5;
}

function mean(scores: readonly number[]): number {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
}

export type StrokeQuality = "perfect" | "good" | "poor" | "miss";
export const QUALITY_SCORES: Readonly<Record<StrokeQuality, number>> = Object.freeze({ perfect: 1, good: 0.6, poor: 0.2, miss: 0 });

// ---------------------------------------------------------------- the steps

export const MEASURE_MARKS = 3;
export const MEASURE_SWEEP_SECONDS = 1.5;
export const MEASURE_RECOVERY_SECONDS = 0.25;

export type SawDirection = "push" | "pull";
export const SAW_STROKES = 8;
/** The silence before the first stroke is called, so the rhythm can be heard first. */
export const SAW_LEAD_SECONDS = 1.1;

export const NAIL_COUNT = 3;
/** How fast the hammer rises while E is held (of full height per second). */
export const NAIL_RISE_PER_SECOND = 0.85;
/** The pause between one nail and the next. */
export const NAIL_RECOVERY_SECONDS = 0.35;

export type MeasureStep = Readonly<{
  kind: "measure";
  startedAt: number;
  /** The mark's place on the board, 0..1, and the half-widths of its two bands. */
  mark: number;
  windows: Readonly<{ perfect: number; good: number }>;
  readyAt: number;
  marks: readonly number[];
  last: StrokeQuality | null;
}>;

export type SawStep = Readonly<{
  kind: "saw";
  startedAt: number;
  /** Seconds between strokes. */
  beat: number;
  /** Half-widths of the perfect and good bands around each beat, in seconds; poor out to `poor`. */
  windows: Readonly<{ perfect: number; good: number; poor: number }>;
  strokes: readonly number[];
  last: StrokeQuality | null;
}>;

export type NailStep = Readonly<{
  kind: "nail";
  startedAt: number;
  /** Where the band sits on the hammer's rise, and its half-width. */
  target: number;
  halfWidth: number;
  /** How high the hammer is, 0..1, and whether E is holding it up. */
  power: number;
  raising: boolean;
  lastAt: number;
  readyAt: number;
  nails: readonly number[];
  last: StrokeQuality | null;
}>;

export type CraftStep = MeasureStep | SawStep | NailStep;

export type CraftingSession = Readonly<{
  itemId: string;
  kinds: readonly CraftStepKind[];
  /** The step being played, or null once the last one is scored. */
  step: CraftStep | null;
  index: number;
  scores: readonly number[];
  level: number;
}>;

function measureMark(random: () => number, good: number): number {
  const margin = good + 0.04;
  return margin + unit(random) * (1 - margin * 2);
}

function nailTarget(random: () => number): number {
  return 0.55 + unit(random) * 0.3;
}

function startStep(kind: CraftStepKind, level: number, now: number, random: () => number): CraftStep {
  const steady = mastery(level);
  if (kind === "measure") {
    const windows = Object.freeze({ perfect: 0.04 + 0.03 * steady, good: 0.11 + 0.06 * steady });
    return Object.freeze({ kind, startedAt: now, mark: measureMark(random, windows.good), windows, readyAt: now, marks: Object.freeze([]), last: null });
  }
  if (kind === "saw") {
    const windows = Object.freeze({ perfect: 0.07 + 0.04 * steady, good: 0.15 + 0.07 * steady, poor: 0.26 + 0.06 * steady });
    return Object.freeze({ kind, startedAt: now, beat: 0.62 - 0.08 * unit(random), windows, strokes: Object.freeze([]), last: null });
  }
  return Object.freeze({
    kind, startedAt: now, target: nailTarget(random), halfWidth: 0.06 + 0.04 * steady,
    power: 0, raising: false, lastAt: now, readyAt: now, nails: Object.freeze([]), last: null,
  });
}

/** Start making `itemId` at Carpentry `level`. Null for a pattern that does not exist. */
export function startCrafting(itemId: string, level: number, now: number, random: () => number): CraftingSession | null {
  const pattern = findPattern(itemId);
  if (!pattern || !pattern.steps.length) return null;
  return Object.freeze({ itemId: pattern.id, kinds: pattern.steps, step: startStep(pattern.steps[0]!, level, now, random), index: 0, scores: Object.freeze([]), level });
}

export function craftingDone(session: CraftingSession): boolean {
  return session.step === null;
}

function finishStep(session: CraftingSession, score: number, now: number, random: () => number): CraftingSession {
  const scores = Object.freeze([...session.scores, clamp01(score)]);
  const index = session.index + 1;
  const kind = session.kinds[index];
  return Object.freeze({ ...session, scores, index, step: kind ? startStep(kind, session.level, now, random) : null });
}

// ---------------------------------------------------------------- measure

/** The pencil's place on the board at `now`: 0 → 1 → 0 over a sweep. */
export function measurePencil(step: MeasureStep, now: number): number {
  const phase = (((now - step.startedAt) / MEASURE_SWEEP_SECONDS) % 1 + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

export function markQualityAt(step: MeasureStep, pencil: number): StrokeQuality {
  const distance = Math.abs(pencil - step.mark);
  return distance <= step.windows.perfect ? "perfect" : distance <= step.windows.good ? "good" : "poor";
}

// ---------------------------------------------------------------- saw

/** Stroke `index` is a push when even, a pull when odd. */
export function sawCall(index: number): SawDirection {
  return index % 2 === 0 ? "push" : "pull";
}

/** When stroke `index` is due. */
export function sawBeatAt(step: SawStep, index: number): number {
  return step.startedAt + SAW_LEAD_SECONDS + index * step.beat;
}

/** The stroke being called now (the next unanswered one), or null once all are answered. */
export function sawNext(step: SawStep): Readonly<{ index: number; direction: SawDirection; at: number }> | null {
  const index = step.strokes.length;
  return index < SAW_STROKES ? Object.freeze({ index, direction: sawCall(index), at: sawBeatAt(step, index) }) : null;
}

export function strokeQualityAt(step: SawStep, error: number): StrokeQuality {
  const off = Math.abs(error);
  return off <= step.windows.perfect ? "perfect" : off <= step.windows.good ? "good" : off <= step.windows.poor ? "poor" : "miss";
}

function answerSaw(step: SawStep, quality: StrokeQuality): SawStep {
  return Object.freeze({ ...step, strokes: Object.freeze([...step.strokes, QUALITY_SCORES[quality]]), last: quality });
}

// ---------------------------------------------------------------- nail

/** A released hammer's nail: flush in the band, fair within twice it, bent beyond — and an overswing is always bent. */
export function nailQualityAt(step: NailStep, power: number): StrokeQuality {
  if (power >= 1) return "poor";
  const off = Math.abs(power - step.target);
  return off <= step.halfWidth ? "perfect" : off <= step.halfWidth * 2 ? "good" : "poor";
}

function driveNail(step: NailStep, now: number): Readonly<{ step: NailStep; quality: StrokeQuality }> {
  const quality = nailQualityAt(step, step.power);
  const next: NailStep = Object.freeze({
    ...step,
    nails: Object.freeze([...step.nails, QUALITY_SCORES[quality]]),
    power: 0, raising: false, lastAt: now, readyAt: now + NAIL_RECOVERY_SECONDS, last: quality,
  });
  return Object.freeze({ step: next, quality });
}

// ---------------------------------------------------------------- input

export type CraftEvent = Readonly<{
  /** Something the view should show: a pencil mark, a saw stroke, a nail driven, a step changing. */
  kind: "mark" | "stroke" | "nail" | "step" | "done" | "none";
  quality?: StrokeQuality;
}>;

export type CraftResult = Readonly<{ session: CraftingSession; event: CraftEvent }>;

const NOTHING: CraftEvent = Object.freeze({ kind: "none" });

function afterStep(session: CraftingSession, score: number, now: number, random: () => number, event: CraftEvent): CraftResult {
  const next = finishStep(session, score, now, random);
  return Object.freeze({ session: next, event: next.step ? event : Object.freeze({ ...event, kind: event.kind === "none" ? "done" : event.kind }) });
}

function withStep(session: CraftingSession, step: CraftStep): CraftingSession {
  return Object.freeze({ ...session, step });
}

/** E (or Space) down: mark the measure, or pick the hammer up. */
export function pressCraft(session: CraftingSession, now: number, random: () => number): CraftResult {
  const step = session.step;
  if (!step) return Object.freeze({ session, event: NOTHING });
  if (step.kind === "measure") {
    if (now < step.readyAt) return Object.freeze({ session, event: NOTHING });
    const quality = markQualityAt(step, measurePencil(step, now));
    const marks = Object.freeze([...step.marks, QUALITY_SCORES[quality]]);
    const event: CraftEvent = Object.freeze({ kind: "mark", quality });
    if (marks.length >= MEASURE_MARKS) return afterStep(session, mean(marks), now, random, event);
    const next: MeasureStep = Object.freeze({ ...step, marks, mark: measureMark(random, step.windows.good), readyAt: now + MEASURE_RECOVERY_SECONDS, last: quality });
    return Object.freeze({ session: withStep(session, next), event });
  }
  if (step.kind === "nail") {
    if (now < step.readyAt || step.raising) return Object.freeze({ session, event: NOTHING });
    return Object.freeze({ session: withStep(session, Object.freeze({ ...step, raising: true, power: 0, lastAt: now })), event: NOTHING });
  }
  return Object.freeze({ session, event: NOTHING });
}

/** E (or Space) up: bring the hammer down. */
export function releaseCraft(session: CraftingSession, now: number, random: () => number): CraftResult {
  const step = session.step;
  if (!step || step.kind !== "nail" || !step.raising) return Object.freeze({ session, event: NOTHING });
  const risen = advanceNail(step, now);
  const driven = driveNail(risen, now);
  const event: CraftEvent = Object.freeze({ kind: "nail", quality: driven.quality });
  if (driven.step.nails.length >= NAIL_COUNT) return afterStep(session, mean(driven.step.nails), now, random, event);
  // Each nail sits at a new height.
  return Object.freeze({ session: withStep(session, Object.freeze({ ...driven.step, target: nailTarget(random) })), event });
}

/** A saw key: A/← pushes, D/→ pulls. */
export function sawCraft(session: CraftingSession, direction: SawDirection, now: number, random: () => number): CraftResult {
  const step = session.step;
  if (!step || step.kind !== "saw") return Object.freeze({ session, event: NOTHING });
  const next = sawNext(step);
  if (!next) return Object.freeze({ session, event: NOTHING });
  const error = now - next.at;
  // Far too early for this stroke: the blade is still coming back. Ignore the key rather than punish a double-tap.
  if (error < -step.windows.poor) return Object.freeze({ session, event: NOTHING });
  const quality = direction !== next.direction ? "miss" : strokeQualityAt(step, error);
  const answered = answerSaw(step, quality);
  const event: CraftEvent = Object.freeze({ kind: "stroke", quality });
  if (answered.strokes.length >= SAW_STROKES) return afterStep(session, mean(answered.strokes), now, random, event);
  return Object.freeze({ session: withStep(session, answered), event });
}

function advanceNail(step: NailStep, now: number): NailStep {
  if (!step.raising) return Object.freeze({ ...step, lastAt: now });
  const dt = Math.max(0, Math.min(0.25, now - step.lastAt));
  return Object.freeze({ ...step, power: Math.min(1, step.power + NAIL_RISE_PER_SECOND * dt), lastAt: now });
}

/**
 * Once per fixed tick: a saw stroke nobody answered binds the blade, and a
 * hammer held past the top overswings and comes down on its own.
 */
export function tickCrafting(session: CraftingSession, now: number, random: () => number): CraftResult {
  const step = session.step;
  if (!step) return Object.freeze({ session, event: NOTHING });
  if (step.kind === "saw") {
    const next = sawNext(step);
    if (!next || now - next.at <= step.windows.poor) return Object.freeze({ session, event: NOTHING });
    const answered = answerSaw(step, "miss");
    const event: CraftEvent = Object.freeze({ kind: "stroke", quality: "miss" });
    if (answered.strokes.length >= SAW_STROKES) return afterStep(session, mean(answered.strokes), now, random, event);
    return Object.freeze({ session: withStep(session, answered), event });
  }
  if (step.kind === "nail" && step.raising) {
    const risen = advanceNail(step, now);
    if (risen.power < 1) return Object.freeze({ session: withStep(session, risen), event: NOTHING });
    return releaseCraft(withStep(session, risen), now, random);
  }
  return Object.freeze({ session, event: NOTHING });
}

/** The keys the saw answers to. */
export function sawDirectionForKey(code: string): SawDirection | null {
  if (code === "KeyA" || code === "ArrowLeft") return "push";
  if (code === "KeyD" || code === "ArrowRight") return "pull";
  return null;
}
