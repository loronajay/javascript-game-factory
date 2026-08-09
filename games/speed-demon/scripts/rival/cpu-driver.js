// A computer driver, expressed as the thing every other driver is expressed as:
// an input log.
//
// PURE. No DOM, no canvas, no wall-clock, and — importantly — no randomness that
// is not seeded, so the same seed and the same profile produce the same run
// every time and a test can assert an exact figure.
//
// ## Why this generates a log rather than driving live
//
// A rival could have been a per-tick controller wired into the game loop. It is
// a log instead, produced up front by running the real sim forward, and that
// choice buys three things that a controller does not:
//
//   - **A CPU run and a ghost run are the same kind of object.** Both are logs,
//     so everything downstream — playback, drawing, deciding who won — has one
//     path rather than two. The mode is not "race a CPU *or* a ghost", it is
//     "race a log", and where the log came from stops mattering the moment it
//     exists.
//   - **It is the car the player is driving.** The generator steps `stepRace`
//     with the same options the player's race is built from, so the rival is
//     bound by the same torque curve, the same clutch dead time and the same
//     grading. It cannot cheat, because there is no code path here that could.
//   - **It is checkable.** A log replays to a fixed time, so a difficulty tier
//     can be asserted as a range of finishing times rather than eyeballed.
//
// The cost is one forward simulation of the race at build time — about a
// thousand `stepRace` calls for a quarter mile, well under a millisecond.
//
// ## What the driver actually does
//
// The same three-part shift the player makes: lift and declutch together, work
// the gate one direction at a time, and pick the throttle back up as the clutch
// bites. Every one of those is offset by a jittered amount, which is the whole
// of the difficulty model — a weaker rival is not given a slower car, it is
// given looser hands.

import { TICK_SECONDS } from "../sim/constants.js";
import { pathBetweenGears } from "../sim/gate.js";
import { COUNTDOWN, FINISHED, RUNNING, createRace, gateInput, pressShift, startRace, stepRace, topGear } from "../sim/race.js";
import { createInputLog, recordClutch, recordGate, recordStart, recordThrottle } from "../sim/input-log.js";

/**
 * Ten minutes at 60hz, matching `MAX_REPLAY_TICKS`. A ceiling rather than a
 * duration: a profile tuned into a corner where the car never reaches the line
 * has to stop somewhere.
 */
const MAX_GENERATED_TICKS = 36000;

/**
 * The five knobs, and nothing else. Every one of them is a human failing rather
 * than a car statistic, which is what keeps a rival beatable on its own terms:
 * you are not being asked to out-drive a faster car, you are being asked to work
 * the gearbox better than somebody else did.
 */
export const DEFAULT_PROFILE = {
  /** Seconds from green to throttle. Negative jumps the light — and fouls. */
  reactionSeconds: 0.25,
  reactionJitter: 0.12,
  /** Signed offset from the car's own `optimalShiftRpm`. */
  shiftRpmOffset: -150,
  shiftRpmJitter: 250,
  /** Ticks between gate inputs. The gate's whole duration is a multiple of it. */
  gateTicks: 8,
  gateTicksJitter: 2,
  /** Seconds late onto the throttle, measured from the moment the clutch bites. */
  catchSeconds: 0.08,
  catchJitter: 0.06,
};

export function createProfile(profile = {}) {
  return { ...DEFAULT_PROFILE, ...profile };
}

/**
 * A small deterministic PRNG. `sim/` contains no randomness at all by design —
 * that is what makes a run reproducible from its log — so the one place a rival
 * needs it, it is seeded and lives out here rather than being smuggled in.
 */
function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Triangular noise on [-spread, +spread], peaked at zero.
 *
 * Deliberately not uniform. A uniform error makes a driver who is as likely to
 * be at the edge of their ability as at the middle of it, which reads as a rival
 * whose every shift is a different person. Peaking at zero gives a consistent
 * driver who occasionally slips, which is what a human is.
 */
function jitter(rng, spread) {
  return spread > 0 ? (rng() + rng() - 1) * spread : 0;
}

/**
 * Drives one race and returns the log of having done so, plus the race it
 * produced.
 *
 * `options` is exactly the object `createRace` takes, so the rival is racing the
 * player's distance over the player's countdown in the player's car.
 */
export function driveRace(options, profile = {}, seed = 1) {
  const settings = createProfile(profile);
  const rng = mulberry32(seed);
  const gate = options.gate;
  const highest = topGear(options.car);
  const optimalRpm = options.car.optimalShiftRpm;

  // Rolled once for the run: a driver's reaction is a property of the driver on
  // the day, not of each individual light.
  const reaction = settings.reactionSeconds + jitter(rng, settings.reactionJitter);

  let race = startRace(createRace(options));
  let log = recordStart(createInputLog(), 0);

  // What the driver is doing right now. `drive` is flat out waiting for the
  // needle; `gate` is off the gas with the knob moving; `catch` is off the gas
  // waiting for the bite.
  let phase = "drive";
  let pending = []; // gate directions still to make, and the tick each fires on
  let targetRpm = rollShiftRpm();
  let catchOffset = 0;

  function rollShiftRpm() {
    return optimalRpm + settings.shiftRpmOffset + jitter(rng, settings.shiftRpmJitter);
  }

  for (let tick = 0; tick < MAX_GENERATED_TICKS; tick += 1) {
    const actions = [];
    let throttle = 0;

    if (race.phase === COUNTDOWN) {
      // A negative reaction is a driver who left early. The tree still runs its
      // full length — `stepRace` sees to that — so this is a foul rather than a
      // head start, exactly as it is for a player.
      throttle = reaction < 0 && race.countdown <= -reaction ? 1 : 0;
    } else if (race.phase === RUNNING) {
      if (phase === "drive") {
        throttle = race.launched || race.elapsed >= reaction ? 1 : 0;
        // The needle is read *before* the tick is stepped, which is the same
        // value `openGate` will sample — so the driver commits at the rpm they
        // were aiming for, to within one tick.
        if (throttle > 0 && race.vehicle.gear < highest && race.vehicle.rpm >= targetRpm) {
          // Lift and declutch on the same tick. The throttle for the tick is
          // already zero by the time the clutch is asked for, so the gate opens
          // now rather than arming — which is what a driver who lifts cleanly
          // gets, and the only way to reach the good grades.
          throttle = 0;
          actions.push({ kind: "clutch" });
          const spacing = Math.max(1, Math.round(settings.gateTicks + jitter(rng, settings.gateTicksJitter)));
          pending = pathBetweenGears(gate, race.vehicle.gear, race.vehicle.gear + 1).map(
            (direction, index) => ({ direction, at: tick + (index + 1) * spacing }),
          );
          catchOffset = settings.catchSeconds + jitter(rng, settings.catchJitter);
          phase = "gate";
        }
      } else if (phase === "gate") {
        while (pending.length > 0 && pending[0].at <= tick) {
          actions.push({ kind: "gate", direction: pending.shift().direction });
        }
        // The gate resolves on the last of those, which parks a shift waiting
        // for its catch. Nothing else ends this phase: a knob that has not
        // arrived yet is a driver still moving their hand.
        //
        // The catch is deliberately *not* considered on this tick. The gate
        // input that resolves the shift has not been applied to the race yet —
        // it is in `actions` — so `pendingShift` is still null, and reading it
        // here would look like a settled shift and put the driver back on the
        // gas on the same tick the knob landed. That is a negative catch offset,
        // which grades as a fumble on every single shift.
        if (pending.length === 0) phase = "catch";
      } else if (phase === "catch") {
        const bite = race.pendingShift ? race.pendingShift.clutchAt + catchOffset : null;
        if (bite === null) {
          // Settled — either caught last tick, or the gate never left a shift to
          // catch. Either way the driver is back on the gas and reading for the
          // next one.
          phase = "drive";
          targetRpm = rollShiftRpm();
          throttle = 1;
        } else {
          throttle = race.elapsed >= bite ? 1 : 0;
        }
      }
    }

    log = recordThrottle(log, tick, throttle);
    for (const action of actions) {
      if (action.kind === "clutch") {
        log = recordClutch(log, tick);
        race = pressShift(race, { throttle });
      } else {
        log = recordGate(log, tick, action.direction);
        race = gateInput(race, action.direction);
      }
    }

    race = stepRace(race, { throttle }, TICK_SECONDS);
    if (race.phase === FINISHED) {
      return { log, race, ticks: tick + 1, complete: true };
    }
  }

  return { log, race, ticks: MAX_GENERATED_TICKS, complete: false };
}
