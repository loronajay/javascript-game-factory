// Lovers Lost achievements: the definitions, the run-summary validator, and
// the detector. Registered in services/achievement-catalog; the game itself
// builds the run summary this validates (games/lovers-lost/scripts/run-telemetry.js)
// and decides nothing.
//
// The run summary is the cabinet's telemetry: per-lane Perfect/Good/Miss
// tallies by obstacle type, score, finish frame, mode and outcome, plus
// `ownedLanes` — which lanes the submitting ACCOUNT played. Lane achievements
// are evaluated on owned lanes only, so in an online reunion the partner's
// perfect lane earns the partner nothing here; they submit their own run.
//
// Trust: see the boundary note in achievement-catalog. `normalizeRun` rejects
// what cannot have happened under the game's own constants (cutoff, obstacle
// count, tallies that do not add up, an outcome the lanes contradict) and
// re-derives the outcome and lane ownership from the facts rather than
// trusting the client's word for either. It cannot tell a real run from a
// well-formed invented one; that is the platform-wide limit today.

import type { AchievementDefinition, AchievementGame } from "./achievement-catalog.mjs";

export const LOVERS_LOST_GAME_SLUG = "lovers-lost";

// ── Game constants mirrored from the cabinet (games/lovers-lost/scripts/*) ──
// Duplicated on purpose: the API deploys separately from the site and must
// not import a game folder. A cabinet test pins these against the originals.
export const LOVERS_LOST_HARD_CUTOFF_FRAMES = 90 * 60;   // game-constants HARD_CUTOFF_FRAMES
export const LOVERS_LOST_TOTAL_OBSTACLES    = 104;       // player TOTAL_OBSTACLES
export const LOVERS_LOST_WARMUP_COUNT       = 4;         // obstacles WARMUP_SEQUENCE.length
// Generous: an all-Perfect 104-obstacle lane under the cabinet's chain
// multiplier is ~95k. Anything above is a forgery, not a great run.
export const LOVERS_LOST_MAX_LANE_SCORE     = 100_000;
// The per-obstacle ceiling (Perfect at the top of a full chain is ~2,150).
const MAX_SCORE_PER_OBSTACLE = 2_200;
// No lane can cross 5400 distance units in fewer frames than this even at an
// absurd speed; it exists to refuse a "finished on frame 1" claim.
const MIN_FINISH_FRAME = 600;

export const LOVERS_LOST_SCORE_THRESHOLDS = Object.freeze({
  SPARKS_FLY: 10_000,
  BURNING_BRIGHT: 15_000,
  WRITTEN_IN_STARS: 18_000,
});

export const LOVERS_LOST_SPEED_THRESHOLDS_FRAMES = Object.freeze({
  DONT_KEEP_WAITING: 60 * 60,
  HEART_RACING: 50 * 60,
  NO_TIME_TO_LOSE: 45 * 60,
});

export const LOVERS_LOST_SYNC_FRAMES = Object.freeze({
  IN_SYNC: 120,
  MIRROR_IMAGE: 15,
});

export const LOVERS_LOST_SECONDS_TO_SPARE_MIN_FRAMES = 89 * 60;

export const LOVERS_LOST_PERFECT_COUNTS = Object.freeze({
  SHARP_TIMING: 10,
  CLOCKWORK: 25,
});

// ── Definitions ──────────────────────────────────────────────────────────────

const OBSTACLE_TYPES = ["spikes", "bird", "arrowwall", "goblin"] as const;
type ObstacleType = (typeof OBSTACLE_TYPES)[number];
type ByType = Record<ObstacleType, number>;

export interface LoversLostLane {
  active: boolean;
  finished: boolean;
  finishFrame: number | null;
  score: number;
  obstaclesFaced: number;
  perfects: number;
  goods: number;
  misses: number;
  successfulByType: ByType;
  perfectByType: ByType;
  missesByType: ByType;
  warmupFaced: number;
  warmupMisses: number;
}

export type LoversLostMode = "single" | "local" | "online";
export type LoversLostSide = "boy" | "girl";
export type LoversLostOutcome = "reunion" | "partial" | "game_over";

export interface LoversLostRun {
  gameSlug: typeof LOVERS_LOST_GAME_SLUG;
  runId: string;
  mode: LoversLostMode;
  soloSide: LoversLostSide | null;
  ownedLanes: LoversLostSide[];
  outcome: LoversLostOutcome;
  elapsedFrames: number;
  disconnected: boolean;
  lanes: { boy: LoversLostLane; girl: LoversLostLane };
}

function def(
  id: string,
  name: string,
  description: string,
  category: AchievementDefinition["category"],
  extra: Partial<AchievementDefinition> = {},
): AchievementDefinition {
  return Object.freeze({ id, name, description, category, parentId: null, tier: 1, points: 10, secret: false, icon: null, ...extra });
}

export const LOVERS_LOST_DEFINITIONS: readonly AchievementDefinition[] = Object.freeze([
  // Root
  def("ll_found_again", "Found Again", "Complete a reunion.", "progression", { points: 10 }),

  // Modes branch
  def("ll_his_side", "His Side of the Story", "Complete a solo run as the boy.", "progression", { parentId: "ll_found_again", tier: 1 }),
  def("ll_her_side", "Her Side of the Story", "Complete a solo run as the girl.", "progression", { parentId: "ll_his_side", tier: 2 }),
  def("ll_both_sides", "Both Sides of the Story", "Complete a solo run as both the boy and the girl.", "progression", { parentId: "ll_her_side", tier: 3, points: 20 }),

  // Co-op branch
  def("ll_side_by_side", "Side by Side", "Complete a local reunion.", "multiplayer", { parentId: "ll_found_again", tier: 1 }),
  def("ll_long_distance", "Long Distance", "Complete an online reunion.", "multiplayer", { parentId: "ll_side_by_side", tier: 2 }),
  def("ll_in_sync", "In Sync", "Finish a local or online reunion with both runners crossing within two seconds of each other.", "multiplayer", { parentId: "ll_long_distance", tier: 3, points: 20 }),

  // Mastery branch
  def("ll_clean_start", "Clean Start", "Clear the four-obstacle warmup without a Miss.", "mastery", { parentId: "ll_found_again", tier: 1 }),
  def("ll_four_moves", "Four Moves, One Heart", "Clear at least one spike, bird, arrow wall and goblin in a single completed lane.", "mastery", { parentId: "ll_clean_start", tier: 2 }),
  def("ll_sharp_timing", "Sharp Timing", "Land 10 Perfects in a single completed lane.", "mastery", { parentId: "ll_four_moves", tier: 3, points: 20 }),
  def("ll_clockwork", "Clockwork", "Land 25 Perfects in a single completed lane.", "mastery", { parentId: "ll_sharp_timing", tier: 4, points: 30 }),

  // Precision branch
  def("ll_untouchable", "Untouchable", "Complete a lane without a single Miss.", "mastery", { parentId: "ll_found_again", tier: 1, points: 20 }),
  def("ll_perfect_run", "Perfect Run", "Complete a lane with every obstacle graded Perfect.", "mastery", { parentId: "ll_untouchable", tier: 2, points: 50 }),
  def("ll_perfect_pair", "Perfect Pair", "Complete a local or online reunion where neither runner Misses.", "mastery", { parentId: "ll_perfect_run", tier: 3, points: 40 }),

  // Score branch
  def("ll_sparks_fly", "Sparks Fly", "Score 10,000 on a completed lane.", "performance", { parentId: "ll_found_again", tier: 1 }),
  def("ll_burning_bright", "Burning Bright", "Score 15,000 on a completed lane.", "performance", { parentId: "ll_sparks_fly", tier: 2, points: 20 }),
  def("ll_written_stars", "Written in the Stars", "Score 18,000 on a completed lane.", "performance", { parentId: "ll_burning_bright", tier: 3, points: 30 }),

  // Speed branch
  def("ll_dont_keep_waiting", "Don't Keep Me Waiting", "Reunite in 60 seconds or less.", "performance", { parentId: "ll_found_again", tier: 1 }),
  def("ll_heart_racing", "Heart Racing", "Reunite in 50 seconds or less.", "performance", { parentId: "ll_dont_keep_waiting", tier: 2, points: 20 }),
  def("ll_no_time_to_lose", "No Time to Lose", "Reunite in 45 seconds or less.", "performance", { parentId: "ll_heart_racing", tier: 3, points: 30 }),

  // Secrets
  def("ll_seconds_to_spare", "With Seconds to Spare", "Reunite in the final second before the 90-second cutoff.", "secret", { parentId: "ll_found_again", secret: true, points: 25 }),
  def("ll_mirror_image", "Mirror Image", "Finish a local or online reunion with both runners crossing within a quarter of a second of each other.", "secret", { parentId: "ll_in_sync", secret: true, points: 25 }),

  // Meta
  def("ll_lovers_never_die", "Lovers Never Die", "Earn every non-secret Lovers Lost achievement.", "meta", { parentId: null, points: 100 }),
]);

// The exact ids Lovers Never Die requires. Exact ids rather than a count so a
// future achievement cannot change what the meta means; secrets excluded by
// policy (see the handoff) and, structurally, by not being listed here.
export const LOVERS_NEVER_DIE_REQUIRED_IDS: readonly string[] = Object.freeze([
  "ll_found_again",
  "ll_his_side",
  "ll_her_side",
  "ll_both_sides",
  "ll_side_by_side",
  "ll_long_distance",
  "ll_in_sync",
  "ll_clean_start",
  "ll_four_moves",
  "ll_sharp_timing",
  "ll_clockwork",
  "ll_untouchable",
  "ll_perfect_run",
  "ll_perfect_pair",
  "ll_sparks_fly",
  "ll_burning_bright",
  "ll_written_stars",
  "ll_dont_keep_waiting",
  "ll_heart_racing",
  "ll_no_time_to_lose",
]);

// ── Run normalization ────────────────────────────────────────────────────────

function count(value: unknown, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
}

function byType(value: unknown, max: number): ByType | null {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = { spikes: 0, bird: 0, arrowwall: 0, goblin: 0 };
  for (const key of OBSTACLE_TYPES) {
    const n = count(source[key], max);
    if (n === null) return null;
    out[key] = n;
  }
  return out;
}

function sumByType(map: ByType): number {
  return OBSTACLE_TYPES.reduce((total, key) => total + map[key], 0);
}

function inactiveLane(): LoversLostLane {
  const zero = { spikes: 0, bird: 0, arrowwall: 0, goblin: 0 };
  return {
    active: false, finished: false, finishFrame: null, score: 0, obstaclesFaced: 0,
    perfects: 0, goods: 0, misses: 0,
    successfulByType: { ...zero }, perfectByType: { ...zero }, missesByType: { ...zero },
    warmupFaced: 0, warmupMisses: 0,
  };
}

function normalizeLane(value: unknown, active: boolean, elapsedFrames: number): LoversLostLane | null {
  if (!active) return inactiveLane();
  const src = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!src) return null;

  const obstaclesFaced = count(src.obstaclesFaced, LOVERS_LOST_TOTAL_OBSTACLES);
  const perfects = count(src.perfects, LOVERS_LOST_TOTAL_OBSTACLES);
  const goods = count(src.goods, LOVERS_LOST_TOTAL_OBSTACLES);
  const misses = count(src.misses, LOVERS_LOST_TOTAL_OBSTACLES);
  const score = count(src.score, LOVERS_LOST_MAX_LANE_SCORE);
  const warmupFaced = count(src.warmupFaced, LOVERS_LOST_WARMUP_COUNT);
  const warmupMisses = count(src.warmupMisses, LOVERS_LOST_WARMUP_COUNT);
  const successfulByType = byType(src.successfulByType, LOVERS_LOST_TOTAL_OBSTACLES);
  const perfectByType = byType(src.perfectByType, LOVERS_LOST_TOTAL_OBSTACLES);
  const missesByType = byType(src.missesByType, LOVERS_LOST_TOTAL_OBSTACLES);
  if ([obstaclesFaced, perfects, goods, misses, score, warmupFaced, warmupMisses].some((n) => n === null)) return null;
  if (!successfulByType || !perfectByType || !missesByType) return null;

  // The tallies are one partition of the obstacles faced, twice over.
  if (perfects! + goods! + misses! !== obstaclesFaced) return null;
  if (sumByType(successfulByType) !== perfects! + goods!) return null;
  if (sumByType(perfectByType) !== perfects) return null;
  if (sumByType(missesByType) !== misses) return null;
  if (OBSTACLE_TYPES.some((key) => perfectByType[key] > successfulByType[key])) return null;
  if (warmupMisses! > warmupFaced!) return null;
  if (warmupFaced! > obstaclesFaced!) return null;
  if (score! > obstaclesFaced! * MAX_SCORE_PER_OBSTACLE) return null;

  const finished = src.finished === true;
  let finishFrame: number | null = null;
  if (finished) {
    const frame = count(src.finishFrame, LOVERS_LOST_HARD_CUTOFF_FRAMES);
    if (frame === null || frame < MIN_FINISH_FRAME || frame > elapsedFrames) return null;
    finishFrame = frame;
  } else if (src.finishFrame !== null && src.finishFrame !== undefined) {
    return null;
  }

  return {
    active: true, finished, finishFrame,
    score: score!, obstaclesFaced: obstaclesFaced!,
    perfects: perfects!, goods: goods!, misses: misses!,
    successfulByType, perfectByType, missesByType,
    warmupFaced: warmupFaced!, warmupMisses: warmupMisses!,
  };
}

const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function normalizeLoversLostRun(payload: unknown): { ok: true; run: LoversLostRun } | { ok: false; error: string } {
  const src = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, any>) : null;
  if (!src) return { ok: false, error: "invalid_run" };
  if (src.gameSlug !== LOVERS_LOST_GAME_SLUG) return { ok: false, error: "invalid_run" };

  const runId = typeof src.runId === "string" && RUN_ID_PATTERN.test(src.runId) ? src.runId : "";
  if (!runId) return { ok: false, error: "invalid_run_id" };

  const mode: LoversLostMode | null = src.mode === "single" || src.mode === "local" || src.mode === "online" ? src.mode : null;
  if (!mode) return { ok: false, error: "invalid_run" };

  const soloSide: LoversLostSide | null = mode === "single"
    ? (src.soloSide === "boy" || src.soloSide === "girl" ? src.soloSide : null)
    : null;
  if (mode === "single" && !soloSide) return { ok: false, error: "invalid_run" };

  // Ownership is derived from the mode, not read from the body. The one
  // client-supplied fact is which online chair the account sat in, which the
  // server cannot know; it must name exactly one lane.
  let ownedLanes: LoversLostSide[];
  if (mode === "single") ownedLanes = [soloSide!];
  else if (mode === "local") ownedLanes = ["boy", "girl"];
  else {
    const claimed = Array.isArray(src.ownedLanes) ? src.ownedLanes : [];
    if (claimed.length !== 1 || (claimed[0] !== "boy" && claimed[0] !== "girl")) return { ok: false, error: "invalid_run" };
    ownedLanes = [claimed[0]];
  }

  const elapsedFrames = count(src.elapsedFrames, LOVERS_LOST_HARD_CUTOFF_FRAMES);
  if (elapsedFrames === null) return { ok: false, error: "invalid_run" };
  const disconnected = src.disconnected === true;

  const lanesSrc = src.lanes && typeof src.lanes === "object" ? src.lanes : {};
  const boy = normalizeLane(lanesSrc.boy, mode !== "single" || soloSide === "boy", elapsedFrames);
  const girl = normalizeLane(lanesSrc.girl, mode !== "single" || soloSide === "girl", elapsedFrames);
  if (!boy || !girl) return { ok: false, error: "invalid_lane" };

  // Outcome re-derived from the lanes: an inactive (solo partner) lane counts
  // as done, which is exactly what the cabinet's own state machine does.
  const activeLanes = [boy, girl].filter((lane) => lane.active);
  const finishedCount = activeLanes.filter((lane) => lane.finished).length;
  const outcome: LoversLostOutcome = finishedCount === activeLanes.length ? "reunion"
    : finishedCount > 0 ? "partial" : "game_over";
  if (typeof src.outcome === "string" && src.outcome !== outcome) return { ok: false, error: "invalid_outcome" };

  if (outcome === "reunion") {
    // The reunion is declared on the tick the last runner finishes.
    const lastFinish = Math.max(...activeLanes.map((lane) => lane.finishFrame ?? 0));
    if (elapsedFrames !== lastFinish) return { ok: false, error: "invalid_outcome" };
  } else if (!disconnected && elapsedFrames !== LOVERS_LOST_HARD_CUTOFF_FRAMES) {
    // Anything short of a reunion only ends at the cutoff, unless the partner left.
    return { ok: false, error: "invalid_outcome" };
  }

  return {
    ok: true,
    run: { gameSlug: LOVERS_LOST_GAME_SLUG, runId, mode, soloSide, ownedLanes, outcome, elapsedFrames, disconnected, lanes: { boy, girl } },
  };
}

// ── Detection ────────────────────────────────────────────────────────────────

function ownedLaneList(run: LoversLostRun): LoversLostLane[] {
  return run.ownedLanes.map((side) => run.lanes[side]).filter((lane) => lane.active);
}

function completedOwnedLanes(run: LoversLostRun): LoversLostLane[] {
  return ownedLaneList(run).filter((lane) => lane.finished && lane.obstaclesFaced > 0);
}

function isCoopReunion(run: LoversLostRun): boolean {
  return run.outcome === "reunion" && (run.mode === "local" || run.mode === "online");
}

function finishGap(run: LoversLostRun): number | null {
  const a = run.lanes.boy.finishFrame;
  const b = run.lanes.girl.finishFrame;
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

export function detectLoversLostAchievements({ run, ownedIds }: { run: LoversLostRun; ownedIds: ReadonlySet<string> }): string[] {
  const earned: string[] = [];
  const has = (id: string) => ownedIds.has(id) || earned.includes(id);
  const completed = completedOwnedLanes(run);
  const reunion = run.outcome === "reunion";
  const coop = isCoopReunion(run);
  const gap = finishGap(run);

  if (reunion) earned.push("ll_found_again");
  if (run.mode === "single" && run.soloSide === "boy" && run.lanes.boy.finished) earned.push("ll_his_side");
  if (run.mode === "single" && run.soloSide === "girl" && run.lanes.girl.finished) earned.push("ll_her_side");
  if (has("ll_his_side") && has("ll_her_side")) earned.push("ll_both_sides");

  if (coop && run.mode === "local") earned.push("ll_side_by_side");
  if (coop && run.mode === "online") earned.push("ll_long_distance");
  if (coop && gap !== null && gap <= LOVERS_LOST_SYNC_FRAMES.IN_SYNC) earned.push("ll_in_sync");

  if (ownedLaneList(run).some((lane) => lane.warmupFaced === LOVERS_LOST_WARMUP_COUNT && lane.warmupMisses === 0)) earned.push("ll_clean_start");
  if (completed.some((lane) => OBSTACLE_TYPES.every((key) => lane.successfulByType[key] >= 1))) earned.push("ll_four_moves");
  if (completed.some((lane) => lane.perfects >= LOVERS_LOST_PERFECT_COUNTS.SHARP_TIMING)) earned.push("ll_sharp_timing");
  if (completed.some((lane) => lane.perfects >= LOVERS_LOST_PERFECT_COUNTS.CLOCKWORK)) earned.push("ll_clockwork");

  if (completed.some((lane) => lane.misses === 0)) earned.push("ll_untouchable");
  if (completed.some((lane) => lane.misses === 0 && lane.goods === 0 && lane.perfects === lane.obstaclesFaced)) earned.push("ll_perfect_run");
  if (coop && [run.lanes.boy, run.lanes.girl].every((lane) => lane.finished && lane.obstaclesFaced > 0 && lane.misses === 0)) earned.push("ll_perfect_pair");

  const bestScore = completed.reduce((best, lane) => Math.max(best, lane.score), 0);
  if (bestScore >= LOVERS_LOST_SCORE_THRESHOLDS.SPARKS_FLY) earned.push("ll_sparks_fly");
  if (bestScore >= LOVERS_LOST_SCORE_THRESHOLDS.BURNING_BRIGHT) earned.push("ll_burning_bright");
  if (bestScore >= LOVERS_LOST_SCORE_THRESHOLDS.WRITTEN_IN_STARS) earned.push("ll_written_stars");

  if (reunion && run.elapsedFrames <= LOVERS_LOST_SPEED_THRESHOLDS_FRAMES.DONT_KEEP_WAITING) earned.push("ll_dont_keep_waiting");
  if (reunion && run.elapsedFrames <= LOVERS_LOST_SPEED_THRESHOLDS_FRAMES.HEART_RACING) earned.push("ll_heart_racing");
  if (reunion && run.elapsedFrames <= LOVERS_LOST_SPEED_THRESHOLDS_FRAMES.NO_TIME_TO_LOSE) earned.push("ll_no_time_to_lose");

  if (reunion && run.elapsedFrames >= LOVERS_LOST_SECONDS_TO_SPARE_MIN_FRAMES && run.elapsedFrames < LOVERS_LOST_HARD_CUTOFF_FRAMES) earned.push("ll_seconds_to_spare");
  if (coop && gap !== null && gap <= LOVERS_LOST_SYNC_FRAMES.MIRROR_IMAGE) earned.push("ll_mirror_image");

  if (LOVERS_NEVER_DIE_REQUIRED_IDS.every((id) => has(id))) earned.push("ll_lovers_never_die");

  return earned;
}

export const LOVERS_LOST_ACHIEVEMENTS: AchievementGame<LoversLostRun> = Object.freeze({
  gameSlug: LOVERS_LOST_GAME_SLUG,
  title: "Lovers Lost",
  definitions: LOVERS_LOST_DEFINITIONS,
  normalizeRun: normalizeLoversLostRun,
  detect: detectLoversLostAchievements,
});
