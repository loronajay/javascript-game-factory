// The timed round: the clock, the score, and when it is over.
//
// Two decisions here are worth stating, because both are player-facing promises:
//
// THE CLOCK STARTS ON THE FIRST REAL PULL, not when the screen opens. Nobody
// loses two seconds to reading the HUD, and an accidental tap on the ball does
// not start the round either — it takes a pull long enough to actually be a shot.
//
// THE BUZZER DOES NOT SNATCH THE BALL. A shot already in the air at zero is
// played out and counts. A pull already drawn at zero is fired, not cancelled.
// The round ends when the last shot resolves, which is why `isRunComplete` asks
// about the ball as well as the clock.
//
// Time arrives as `dt` from the fixed-timestep loop; this file reads no clock of
// its own, so pausing is simply not calling `tickClock`, and a replay lands in
// the same place.

import { POINTS_PER_BASKET } from "./constants.js";

export const RUN_READY = "ready";
export const RUN_RUNNING = "running";
export const RUN_EXPIRED = "expired";

export function createRun({ duration, modeId, locationId, ballId }) {
  return {
    modeId,
    locationId,
    ballId,
    duration,
    status: RUN_READY,
    /** Seconds left on the clock. Derived from `played`, never decremented. */
    remaining: duration,
    /**
     * Seconds counted against the round. Only advances while the clock runs, so
     * it stops for a pause and stops at the buzzer.
     */
    played: 0,
    /**
     * Seconds on the game screen, whatever the clock is doing. This drives hoop
     * motion, which deliberately keeps going before the first pull and after the
     * buzzer — the player needs to watch the rim to time their opening shot.
     */
    elapsed: 0,
    score: 0,
    shots: 0,
    made: 0,
    streak: 0,
    bestStreak: 0,
    /** Set once the result has been written to a board, so it cannot be written twice. */
    recorded: false,
  };
}

/**
 * Start the clock. Idempotent, and ignored once the round is over.
 *
 * Called when a pull first passes the shootable threshold — see `sim/pull.js`.
 */
export function startClock(run) {
  if (run.status !== RUN_READY) return false;
  run.status = RUN_RUNNING;
  return true;
}

/**
 * Advance the round by one tick.
 *
 * Always advances the motion clock; only advances the countdown while running.
 *
 * @returns `{ expired }` — true only on the tick the clock actually runs out, so
 *   the caller can fire the buzzer exactly once.
 */
export function tickClock(run, dt) {
  run.elapsed += dt;
  if (run.status !== RUN_RUNNING) return { expired: false };

  run.played += dt;
  // Derived from `played` rather than decremented, so there is one accumulator
  // rather than two drifting apart over a thousand ticks.
  run.remaining = Math.max(0, run.duration - run.played);
  if (run.remaining > 0) return { expired: false };

  run.status = RUN_EXPIRED;
  return { expired: true };
}

/**
 * The hoop's motion clock.
 *
 * Deliberately NOT the countdown: the hoop keeps moving before the first pull
 * and after the buzzer, so the player can watch it and time their opening shot.
 */
export function motionSeconds(run) {
  return run.elapsed;
}

/** Count a shot as taken. Attempts count the moment the ball leaves. */
export function recordShot(run) {
  run.shots += 1;
}

/** Count a made basket, extending the streak. Returns the new streak. */
export function recordMade(run) {
  run.score += POINTS_PER_BASKET;
  run.made += 1;
  run.streak += 1;
  run.bestStreak = Math.max(run.bestStreak, run.streak);
  return run.streak;
}

/** Count a miss, ending the streak. */
export function recordMiss(run) {
  run.streak = 0;
}

/** Shooting percentage, as a whole number. Zero shots is 0%, not NaN. */
export function accuracy(run) {
  return run.shots > 0 ? Math.round((run.made / run.shots) * 100) : 0;
}

/**
 * Is the round finished?
 *
 * The clock running out is necessary but not sufficient — a shot in the air at
 * the buzzer is played to its conclusion and counts.
 */
export function isRunComplete(run, { shotInFlight }) {
  return run.status === RUN_EXPIRED && !shotInFlight;
}

/**
 * Format the clock the way the HUD shows it.
 *
 * The epsilon is not cosmetic. `remaining` is a sum of ~1/60s steps, so at a
 * whole-second boundary it lands a hair either side of the integer; a bare
 * `ceil` then holds "0:31" for a tick before ever showing "0:30". Snapping
 * values within a microsecond of an integer down is what keeps the countdown
 * from stuttering once a second, every second.
 */
export function formatClock(run) {
  const total = Math.max(0, Math.ceil(run.remaining - 1e-6));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The summary a results screen and a leaderboard entry are both built from. */
export function runSummary(run) {
  return {
    modeId: run.modeId,
    locationId: run.locationId,
    ballId: run.ballId,
    duration: run.duration,
    score: run.score,
    shots: run.shots,
    made: run.made,
    accuracy: accuracy(run),
    bestStreak: run.bestStreak,
  };
}
