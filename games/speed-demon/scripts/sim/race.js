// Race state machine — the composition root of the pure sim.
//
// Owns the phase transitions, the clock, and the wiring between the shifter gate,
// grading, and the engine. Still pure: no DOM, no canvas, no wall-clock reads.
// Every mutation goes through a function that returns a fresh race object, which
// is what makes a race replayable from a seed plus an input log — the property
// online play will be built on.

import { createCarState, stepCar } from "./engine.js";
import { beginShift, applyShiftInput, SHIFT_IN_GATE } from "./gate.js";
import { resolveShift } from "./grading.js";
import { gradeLaunch, launchEffectsFor } from "./launch.js";

export const STAGING = "staging";
export const COUNTDOWN = "countdown";
export const RUNNING = "running";
export const FINISHED = "finished";

/** Highest gear the car's ratio table defines. */
export function topGear(car) {
  return Math.max(...Object.keys(car.gearRatios).map(Number));
}

/**
 * A race is measured against exactly one objective: a distance to cross, or a
 * clock to run out. Both, or neither, is a programming error rather than a
 * degraded race, so it throws — the objective decides when the run ends, and a
 * run with no end condition would simply never stop.
 *
 * `modes.js` produces this pair, so a new mode is a row in that catalog rather
 * than a branch in here.
 */
export function createRace({
  car,
  gate,
  distanceMetres = null,
  timeLimitSeconds = null,
  countdownSeconds = 3,
}) {
  if (!car || !gate) {
    throw new Error("A race needs both a car and a gate");
  }
  const hasDistance = distanceMetres !== null;
  const hasClock = timeLimitSeconds !== null;
  if (hasDistance === hasClock) {
    throw new Error("A race needs exactly one objective: a distance or a time limit");
  }
  if (hasDistance && !(distanceMetres > 0)) {
    throw new Error("A race needs a positive distance");
  }
  if (hasClock && !(timeLimitSeconds > 0)) {
    throw new Error("A race needs a positive time limit");
  }
  return {
    car,
    gate,
    distanceMetres,
    timeLimitSeconds,
    countdownSeconds,

    phase: STAGING,
    countdown: countdownSeconds,
    elapsed: 0,
    finishTime: null,

    vehicle: createCarState(car),
    // The fastest the car went, not the speed it happens to be doing at the end.
    // A distance race traps at the line so the two agree; a time attack does not.
    topSpeed: 0,

    // Launch. `falseStart` latches the moment the throttle is touched before the
    // green and is never cleared — a red light cannot be taken back.
    falseStart: false,
    // Seconds still on the tree when the light was jumped. Larger means the car
    // left earlier; the head-to-head rule in match.js uses it to break ties.
    falseStartAt: null,
    launched: false,
    reactionTime: null,
    launchGrade: null,

    // Live shift attempt, or null when the gate is closed.
    shift: null,
    rpmAtEngage: null,
    shiftOpenedAt: null,

    // Dead time before drive returns, and the post-shift reward window.
    clutchTimer: 0,
    boostTimer: 0,
    boostMultiplier: 1,

    lastShift: null,
    shifts: [],
  };
}

/** Leaves staging. A zero-length countdown goes straight to green. */
export function startRace(race) {
  if (race.phase !== STAGING) {
    return { ...race };
  }
  if (race.countdownSeconds <= 0) {
    return { ...race, phase: RUNNING, countdown: 0 };
  }
  return { ...race, phase: COUNTDOWN, countdown: race.countdownSeconds };
}

/**
 * True when the run ends on a clock rather than at a line. Renderers branch on
 * this rather than on a mode id, so the sim never has to carry one.
 */
export function isTimeAttack(race) {
  return race.timeLimitSeconds !== null;
}

/** How far through the objective the run is, 0..1, whichever it is measured in. */
export function raceProgress(race) {
  const fraction = isTimeAttack(race)
    ? race.elapsed / race.timeLimitSeconds
    : race.vehicle.distance / race.distanceMetres;
  return Math.max(0, Math.min(1, fraction));
}

/** True when the engine is actually driving the wheels. */
export function isClutchEngaged(race) {
  return race.shift === null && race.clutchTimer <= 0;
}

/**
 * Opens the shifter gate. Ignored unless the race is live, the gate is already
 * closed, and there is a gear above the current one to reach for.
 *
 * The rpm is sampled here and nowhere else: the grade belongs to the moment the
 * player committed, not to whatever the needle has decayed to by the time the
 * knob lands.
 */
export function pressShift(race) {
  if (race.phase !== RUNNING || race.shift !== null) {
    return { ...race };
  }
  const target = race.vehicle.gear + 1;
  if (!race.car.gearRatios[target]) {
    return { ...race };
  }
  return {
    ...race,
    shift: beginShift(race.gate, race.vehicle.gear, target),
    rpmAtEngage: race.vehicle.rpm,
    shiftOpenedAt: race.elapsed,
  };
}

/**
 * Feeds one directional input to an open gate. Resolving the attempt engages the
 * gear the knob actually landed in — including the wrong one — and applies the
 * grade's clutch dead time and force bonus.
 */
export function gateInput(race, direction) {
  if (race.phase !== RUNNING || race.shift === null) {
    return { ...race };
  }

  const attempt = applyShiftInput(race.gate, race.shift, direction);
  if (attempt.status === SHIFT_IN_GATE) {
    return { ...race, shift: attempt };
  }

  const result = resolveShift({
    car: race.car,
    rpmAtEngage: race.rpmAtEngage,
    attempt,
    durationSeconds: race.elapsed - race.shiftOpenedAt,
  });
  return {
    ...race,
    shift: null,
    rpmAtEngage: null,
    shiftOpenedAt: null,
    vehicle: { ...race.vehicle, gear: result.gear },
    clutchTimer: result.effects.clutchSeconds,
    boostTimer: result.effects.boostSeconds,
    boostMultiplier: result.effects.forceMultiplier,
    lastShift: result,
    shifts: [...race.shifts, result],
  };
}

/**
 * Advances the race by `dt` seconds. Staging and finished races are inert, so a
 * caller can keep ticking a completed race without special-casing it.
 */
export function stepRace(race, controls, dt) {
  if (race.phase === STAGING || race.phase === FINISHED) {
    return { ...race };
  }

  const throttle = controls?.throttle ?? 0;

  if (race.phase === COUNTDOWN) {
    // Throttle before the green is a foul, but the tree still runs its full
    // length — jumping the light must not also grant an early start.
    const jumpingNow = throttle > 0 && !race.falseStart;
    const falseStart = race.falseStart || throttle > 0;
    const falseStartAt = jumpingNow ? race.countdown : race.falseStartAt;
    const countdown = race.countdown - dt;
    return countdown <= 1e-9
      ? { ...race, phase: RUNNING, countdown: 0, falseStart, falseStartAt }
      : { ...race, countdown, falseStart, falseStartAt };
  }

  // Launch is detected before any timer burns down, so the boost it grants runs
  // for its full duration starting this tick.
  let { launched, reactionTime, launchGrade, boostTimer, boostMultiplier } = race;
  if (!launched && throttle > 0) {
    launched = true;
    reactionTime = race.elapsed; // the clock started on green, so this is the RT
    launchGrade = gradeLaunch(reactionTime, { falseStart: race.falseStart });
    const launchEffects = launchEffectsFor(launchGrade);
    boostTimer = launchEffects.boostSeconds;
    boostMultiplier = launchEffects.forceMultiplier;
  }

  const clutchTimer = Math.max(0, race.clutchTimer - dt);
  const clutchEngaged = race.shift === null && clutchTimer <= 0;

  // The reward window only burns down while the car is actually driving, so a
  // good shift's bonus is never eaten by its own clutch dead time.
  boostTimer = clutchEngaged ? Math.max(0, boostTimer - dt) : boostTimer;
  const forceMultiplier = boostTimer > 0 ? boostMultiplier : 1;

  const vehicle = stepCar(race.car, race.vehicle, { throttle, clutchEngaged, forceMultiplier }, dt);

  const elapsed = race.elapsed + dt;
  const next = {
    ...race,
    vehicle,
    topSpeed: Math.max(race.topSpeed, vehicle.speed),
    clutchTimer,
    boostTimer,
    boostMultiplier,
    elapsed,
    launched,
    reactionTime,
    launchGrade,
  };

  // Both objectives finish the same way: find where inside this tick the run
  // ended, and report the other quantity at that instant rather than at the tick
  // boundary. At 60hz an un-interpolated finish visibly quantises the result.
  if (isTimeAttack(race)) {
    if (elapsed >= race.timeLimitSeconds) {
      const fraction = dt > 0 ? (race.timeLimitSeconds - race.elapsed) / dt : 0;
      const travelled = vehicle.distance - race.vehicle.distance;
      return {
        ...next,
        vehicle: { ...vehicle, distance: race.vehicle.distance + travelled * fraction },
        elapsed: race.timeLimitSeconds,
        phase: FINISHED,
        finishTime: race.timeLimitSeconds,
      };
    }
    return next;
  }

  if (vehicle.distance >= race.distanceMetres) {
    const travelled = vehicle.distance - race.vehicle.distance;
    const fraction = travelled > 0 ? (race.distanceMetres - race.vehicle.distance) / travelled : 0;
    return { ...next, phase: FINISHED, finishTime: race.elapsed + dt * fraction };
  }

  return next;
}
