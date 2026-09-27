// Cooking a dish: the Cooking skill's games. PURE — no DOM, no THREE, no
// clock (times are passed in, in seconds), no dice of its own (a random
// source is injected) — so every step's maths is tested under node.
//
// A recipe is a short run of steps (`farm-catalog/recipes.mts`), each its own
// small game, each scored 0..1:
//
//   chop    a knife marker sweeps across the board; press E as it crosses
//           the mark. Four cuts, each perfect / good / poor, like the axe.
//   stir    the pot calls for a direction; press it (WASD or the arrows)
//           before the call runs out. Six calls; a wrong key or a timeout misses.
//   simmer  hold E to feed the fire, let go to let it die back; keep the heat
//           needle inside a band that moves twice. Scored by time in the band.
//   bake    the bake browns on its own; press E to pull it at golden. Too
//           early is pale, too late is burnt, and never pulling burns it.
//
// The mean of the steps decides the dish's stars. That is ALL the games
// decide: what a cook takes and the Cooking XP it pays are the recipe's, and
// on an account farm the server takes the ingredients and hands over the dish
// (it recomputes the stars from the step scores with `dishStars`, mirrored in
// platform-api/src/services/farm-recipe-catalog.mts). Cooking level widens
// every window a little — steadier hands, never a shortcut.

import { findRecipe, type CookStepKind, type DishStars } from "./farm-catalog/recipes.mjs";

// ---------------------------------------------------------------- scoring

/** The mean score at or above which a dish earns two stars, and three. */
export const TWO_STAR_SCORE = 0.5;
export const THREE_STAR_SCORE = 0.8;

export function dishStars(scores: readonly number[]): DishStars {
  if (!scores.length) return 1;
  const mean = scores.reduce((sum, score) => sum + clamp01(score), 0) / scores.length;
  return mean >= THREE_STAR_SCORE ? 3 : mean >= TWO_STAR_SCORE ? 2 : 1;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** 0 at level 1, 1 at level 99: how much steadier the cook's hands are. */
function mastery(level: number): number {
  const reached = Math.min(99, Math.max(1, Number.isFinite(level) ? level : 1));
  return (reached - 1) / 98;
}

function unit(random: () => number): number {
  const roll = random();
  return Number.isFinite(roll) ? Math.min(0.999999, Math.max(0, roll)) : 0.5;
}

// ---------------------------------------------------------------- the steps

export type CutQuality = "perfect" | "good" | "poor";
export const CUT_SCORES: Readonly<Record<CutQuality, number>> = Object.freeze({ perfect: 1, good: 0.6, poor: 0.2 });
export const CHOP_CUTS = 4;
export const CHOP_SWEEP_SECONDS = 1.3;
export const CHOP_RECOVERY_SECONDS = 0.25;

export type StirDirection = "up" | "down" | "left" | "right";
export const STIR_DIRECTIONS: readonly StirDirection[] = Object.freeze(["up", "right", "down", "left"]);
export const STIR_CALLS = 6;

export const SIMMER_SECONDS = 7;
export const SIMMER_RISE_PER_SECOND = 0.55;
export const SIMMER_FALL_PER_SECOND = 0.38;
/** The band moves at these fractions of the simmer. */
export const SIMMER_SHIFTS: readonly number[] = Object.freeze([1 / 3, 2 / 3]);

export const BAKE_GOLDEN = 0.7;
export const BAKE_BURNT = 1;

export type ChopStep = Readonly<{
  kind: "chop";
  startedAt: number;
  /** The mark's centre on the board, 0..1, and the half-widths of its two bands. */
  zone: number;
  windows: Readonly<{ perfect: number; good: number }>;
  readyAt: number;
  cuts: readonly number[];
  last: CutQuality | null;
}>;

export type StirStep = Readonly<{
  kind: "stir";
  startedAt: number;
  calls: readonly StirDirection[];
  /** Seconds each call stands before it counts as missed. */
  callSeconds: number;
  index: number;
  /** When the current call went up. */
  calledAt: number;
  hits: readonly number[];
  last: "hit" | "miss" | null;
}>;

export type SimmerStep = Readonly<{
  kind: "simmer";
  startedAt: number;
  heat: number;
  /** The band's centre now, the centres it will move to, and its half-width. */
  band: number;
  moves: readonly number[];
  halfWidth: number;
  /** Seconds of the simmer so far, and of those, the credited time in the band. */
  elapsed: number;
  credit: number;
  lastAt: number;
}>;

export type BakeStep = Readonly<{
  kind: "bake";
  startedAt: number;
  /** Doneness per second: each bake browns at its own pace. */
  rate: number;
  /** Half-width of the golden window around BAKE_GOLDEN. */
  halfWidth: number;
  pulledAt: number | null;
}>;

export type CookStep = ChopStep | StirStep | SimmerStep | BakeStep;

export type CookingSession = Readonly<{
  recipeId: string;
  kinds: readonly CookStepKind[];
  /** The step being played, or null once the last one is scored. */
  step: CookStep | null;
  index: number;
  scores: readonly number[];
  level: number;
}>;

function startStep(kind: CookStepKind, level: number, now: number, random: () => number): CookStep {
  const steady = mastery(level);
  if (kind === "chop") {
    const windows = Object.freeze({ perfect: 0.05 + 0.03 * steady, good: 0.13 + 0.06 * steady });
    return Object.freeze({ kind, startedAt: now, zone: chopZone(random, windows.good), windows, readyAt: now, cuts: Object.freeze([]), last: null });
  }
  if (kind === "stir") {
    const calls = Object.freeze(Array.from({ length: STIR_CALLS }, () => STIR_DIRECTIONS[Math.floor(unit(random) * STIR_DIRECTIONS.length)]!));
    return Object.freeze({ kind, startedAt: now, calls, callSeconds: 1.5 + 0.7 * steady, index: 0, calledAt: now, hits: Object.freeze([]), last: null });
  }
  if (kind === "simmer") {
    const centre = () => 0.3 + unit(random) * 0.45;
    return Object.freeze({ kind, startedAt: now, heat: 0.15, band: centre(), moves: Object.freeze(SIMMER_SHIFTS.map(centre)), halfWidth: 0.1 + 0.05 * steady, elapsed: 0, credit: 0, lastAt: now });
  }
  return Object.freeze({ kind, startedAt: now, rate: 0.13 + unit(random) * 0.05, halfWidth: 0.12 + 0.06 * steady, pulledAt: null });
}

function chopZone(random: () => number, good: number): number {
  const margin = good + 0.03;
  return margin + unit(random) * (1 - margin * 2);
}

/** Start cooking `recipeId` at Cooking `level`. Null for a recipe that does not exist. */
export function startCooking(recipeId: string, level: number, now: number, random: () => number): CookingSession | null {
  const recipe = findRecipe(recipeId);
  if (!recipe || !recipe.steps.length) return null;
  return Object.freeze({ recipeId: recipe.id, kinds: recipe.steps, step: startStep(recipe.steps[0]!, level, now, random), index: 0, scores: Object.freeze([]), level });
}

export function cookingDone(session: CookingSession): boolean {
  return session.step === null;
}

/** Score the step in play and move on to the next (or finish). */
function finishStep(session: CookingSession, score: number, now: number, random: () => number): CookingSession {
  const scores = Object.freeze([...session.scores, clamp01(score)]);
  const index = session.index + 1;
  const kind = session.kinds[index];
  return Object.freeze({ ...session, scores, index, step: kind ? startStep(kind, session.level, now, random) : null });
}

// ---------------------------------------------------------------- chop

/** The knife marker's place on the board at `now`: 0 → 1 → 0 over a sweep. */
export function chopMarker(step: ChopStep, now: number): number {
  const phase = (((now - step.startedAt) / CHOP_SWEEP_SECONDS) % 1 + 1) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

export function cutQualityAt(step: ChopStep, marker: number): CutQuality {
  const distance = Math.abs(marker - step.zone);
  return distance <= step.windows.perfect ? "perfect" : distance <= step.windows.good ? "good" : "poor";
}

export function chopScore(cuts: readonly number[]): number {
  return cuts.length ? cuts.reduce((sum, cut) => sum + cut, 0) / cuts.length : 0;
}

// ---------------------------------------------------------------- stir

/** The call standing now, or null once all six are answered. */
export function stirCall(step: StirStep): StirDirection | null {
  return step.calls[step.index] ?? null;
}

/** How much of the standing call's time is left, 1 → 0. */
export function stirTimeLeft(step: StirStep, now: number): number {
  return clamp01(1 - (now - step.calledAt) / step.callSeconds);
}

function answerStir(step: StirStep, hit: boolean, now: number): StirStep {
  return Object.freeze({ ...step, index: step.index + 1, calledAt: now, hits: Object.freeze([...step.hits, hit ? 1 : 0]), last: hit ? "hit" : "miss" });
}

// ---------------------------------------------------------------- simmer

/** Where the band is centred at a point in the simmer. */
function simmerBandAt(step: SimmerStep, elapsed: number): number {
  let centre = step.band;
  SIMMER_SHIFTS.forEach((at, index) => { if (elapsed >= at * SIMMER_SECONDS) centre = step.moves[index] ?? centre; });
  return centre;
}

export function simmerBand(step: SimmerStep): Readonly<{ centre: number; halfWidth: number }> {
  return Object.freeze({ centre: simmerBandAt(step, step.elapsed), halfWidth: step.halfWidth });
}

/** Full credit in the band, half credit within one more band-width of it, none beyond. */
export function simmerCredit(heat: number, centre: number, halfWidth: number): number {
  const off = Math.abs(heat - centre);
  return off <= halfWidth ? 1 : off <= halfWidth * 2 ? 0.5 : 0;
}

function advanceSimmer(step: SimmerStep, now: number, holding: boolean): SimmerStep {
  const dt = Math.max(0, Math.min(0.25, now - step.lastAt));
  const room = Math.max(0, SIMMER_SECONDS - step.elapsed);
  const used = Math.min(dt, room);
  const heat = clamp01(step.heat + (holding ? SIMMER_RISE_PER_SECOND : -SIMMER_FALL_PER_SECOND) * used);
  const centre = simmerBandAt(step, step.elapsed);
  return Object.freeze({ ...step, heat, elapsed: step.elapsed + used, credit: step.credit + simmerCredit(heat, centre, step.halfWidth) * used, lastAt: now });
}

// ---------------------------------------------------------------- bake

export function bakeDoneness(step: BakeStep, now: number): number {
  const at = step.pulledAt ?? now;
  return Math.max(0, (at - step.startedAt) * step.rate);
}

/** Full marks at golden, falling to none a window-and-a-half either side; a burnt bake is nothing. */
export function bakeScore(doneness: number, halfWidth: number): number {
  if (doneness >= BAKE_BURNT) return 0;
  return clamp01(1 - Math.max(0, Math.abs(doneness - BAKE_GOLDEN) - halfWidth * 0.35) / (halfWidth * 1.5));
}

export type BakeLook = "raw" | "pale" | "golden" | "dark" | "burnt";

export function bakeLook(doneness: number, halfWidth: number): BakeLook {
  if (doneness >= BAKE_BURNT) return "burnt";
  if (doneness < 0.3) return "raw";
  if (doneness < BAKE_GOLDEN - halfWidth) return "pale";
  if (doneness <= BAKE_GOLDEN + halfWidth) return "golden";
  return "dark";
}

// ---------------------------------------------------------------- input

export type CookEvent = Readonly<{
  /** Something the view should show: a cut, a stir, a pulled bake. */
  kind: "cut" | "stir" | "pull" | "step" | "done" | "none";
  quality?: CutQuality | "hit" | "miss" | "golden" | "pale" | "dark" | "burnt";
}>;

export type CookResult = Readonly<{ session: CookingSession; event: CookEvent }>;

const NOTHING: CookEvent = Object.freeze({ kind: "none" });

function afterStep(session: CookingSession, score: number, now: number, random: () => number, event: CookEvent): CookResult {
  const next = finishStep(session, score, now, random);
  return Object.freeze({ session: next, event: next.step ? event : Object.freeze({ ...event, kind: event.kind === "none" ? "done" : event.kind }) });
}

/** E (or Space): a cut, or pulling the bake. Holding it for a simmer is `tickCooking`'s `holding`. */
export function pressCook(session: CookingSession, now: number, random: () => number): CookResult {
  const step = session.step;
  if (!step) return Object.freeze({ session, event: NOTHING });
  if (step.kind === "chop") {
    if (now < step.readyAt) return Object.freeze({ session, event: NOTHING });
    const quality = cutQualityAt(step, chopMarker(step, now));
    const cuts = Object.freeze([...step.cuts, CUT_SCORES[quality]]);
    const event: CookEvent = Object.freeze({ kind: "cut", quality });
    if (cuts.length >= CHOP_CUTS) return afterStep(session, chopScore(cuts), now, random, event);
    const next: ChopStep = Object.freeze({ ...step, cuts, zone: chopZone(random, step.windows.good), readyAt: now + CHOP_RECOVERY_SECONDS, last: quality });
    return Object.freeze({ session: Object.freeze({ ...session, step: next }), event });
  }
  if (step.kind === "bake") {
    const doneness = bakeDoneness(step, now);
    const look = bakeLook(doneness, step.halfWidth);
    return afterStep(session, bakeScore(doneness, step.halfWidth), now, random, Object.freeze({ kind: "pull", quality: look === "raw" ? "pale" : look }));
  }
  return Object.freeze({ session, event: NOTHING });
}

/** A direction key while stirring. */
export function stirCook(session: CookingSession, direction: StirDirection, now: number, random: () => number): CookResult {
  const step = session.step;
  if (!step || step.kind !== "stir") return Object.freeze({ session, event: NOTHING });
  const call = stirCall(step);
  if (!call) return Object.freeze({ session, event: NOTHING });
  const next = answerStir(step, call === direction, now);
  const event: CookEvent = Object.freeze({ kind: "stir", quality: next.last! });
  if (next.index >= next.calls.length) return afterStep(session, chopScore(next.hits), now, random, event);
  return Object.freeze({ session: Object.freeze({ ...session, step: next }), event });
}

/**
 * Once per fixed tick: a stir call runs out, the simmer's heat follows the
 * held key and banks its credit, a forgotten bake burns. Ends the step when
 * its time is up.
 */
export function tickCooking(session: CookingSession, now: number, holding: boolean, random: () => number): CookResult {
  const step = session.step;
  if (!step) return Object.freeze({ session, event: NOTHING });
  if (step.kind === "stir") {
    if (stirTimeLeft(step, now) > 0) return Object.freeze({ session, event: NOTHING });
    const next = answerStir(step, false, now);
    const event: CookEvent = Object.freeze({ kind: "stir", quality: "miss" });
    if (next.index >= next.calls.length) return afterStep(session, chopScore(next.hits), now, random, event);
    return Object.freeze({ session: Object.freeze({ ...session, step: next }), event });
  }
  if (step.kind === "simmer") {
    const next = advanceSimmer(step, now, holding);
    if (next.elapsed >= SIMMER_SECONDS - 1e-9) return afterStep(session, next.credit / SIMMER_SECONDS, now, random, Object.freeze({ kind: "step" }));
    return Object.freeze({ session: Object.freeze({ ...session, step: next }), event: NOTHING });
  }
  if (step.kind === "bake" && bakeDoneness(step, now) >= BAKE_BURNT) {
    return afterStep(session, 0, now, random, Object.freeze({ kind: "pull", quality: "burnt" }));
  }
  return Object.freeze({ session, event: NOTHING });
}

/** The keys a stir answers to. */
export function stirDirectionForKey(code: string): StirDirection | null {
  if (code === "KeyW" || code === "ArrowUp") return "up";
  if (code === "KeyS" || code === "ArrowDown") return "down";
  if (code === "KeyA" || code === "ArrowLeft") return "left";
  if (code === "KeyD" || code === "ArrowRight") return "right";
  return null;
}

