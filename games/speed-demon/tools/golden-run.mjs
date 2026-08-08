// Builds the golden run: one properly driven quarter mile, recorded as an input
// log, together with exactly what replaying it produces.
//
// This is the fixture that keeps the cabinet and `factory-network-server` from
// drifting apart. Both repos commit the same JSON and both replay it through
// their own copy of the sim, asserting the same finishing time to the last
// decimal place. Retune the torque curve, the ratios, the grading windows or the
// catch windows and *both* suites fail until the mirror is refreshed — which is
// the point, because a server adjudicating on last week's physics would hand
// rounds to the wrong driver.
//
// Regenerating is deliberate (`node tools/mirror-sim.mjs --golden`) precisely so
// that a retune cannot quietly rewrite its own expectations.

import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { createRace, startRace, stepRace, pressShift, gateInput, FINISHED } from "../scripts/sim/race.js";
import {
  createInputLog,
  recordClutch,
  recordGate,
  recordStart,
  recordThrottle,
} from "../scripts/sim/input-log.js";

/**
 * The fixture names its car and gate by id rather than embedding them. That is
 * deliberate: the point is to pin the *physics*, so both sides must rebuild the
 * car from their own constants. Embedding `DEFAULT_CAR` would mean a retune on
 * one side still replayed against the fixture's frozen copy and passed.
 */
export const GOLDEN_CAR_ID = "demon";
export const GOLDEN_GATE_ID = "6-speed";
export const GOLDEN_DISTANCE_ID = "quarter";

/** The gate moves that take the 6-speed up a gear. */
const UPSHIFTS = {
  1: ["down", "down"],
  2: ["up", "right", "up"],
  3: ["down", "down"],
  4: ["up", "right", "up"],
  5: ["down", "down"],
};

/**
 * Drives a clean quarter mile: launch on green, then for every gear lift off the
 * gas, work the gate, coast to the bite and catch it. Exercises the launch, all
 * three shift-grading axes and the catch window — the run the cabinet is tuned
 * around, and so the one worth pinning.
 */
export function buildGoldenRun() {
  const gate = createGate(GATE_6_SPEED);
  const options = {
    car: DEFAULT_CAR,
    gate,
    distanceMetres: RACE_DISTANCES[GOLDEN_DISTANCE_ID].metres,
    countdownSeconds: 3,
  };

  let race = createRace(options);
  let log = createInputLog();
  let throttle = 0;
  let phase = "staging";
  let queue = [];

  for (let tick = 0; tick < 4000 && race.phase !== FINISHED; tick += 1) {
    const actions = [];

    if (phase === "staging") {
      actions.push("start");
      phase = "waiting";
    } else if (phase === "waiting") {
      if (race.phase === "running") {
        throttle = 1;
        phase = "driving";
      }
    } else if (phase === "driving") {
      const gear = race.vehicle.gear;
      if (race.vehicle.rpm >= DEFAULT_CAR.optimalShiftRpm && UPSHIFTS[gear]) {
        throttle = 0; // the lift is the commit: off the gas, so the gate opens now
        actions.push("clutch");
        queue = [...UPSHIFTS[gear]];
        phase = "gate";
      }
    } else if (phase === "gate") {
      actions.push(queue.shift());
      if (queue.length === 0) phase = "coasting";
    } else if (phase === "coasting") {
      if (race.pendingShift && race.elapsed >= race.pendingShift.clutchAt) {
        throttle = 1; // catch it as it bites
        phase = "driving";
      }
    }

    log = recordThrottle(log, tick, throttle);
    for (const action of actions) {
      if (action === "start") {
        race = startRace(race);
        log = recordStart(log, tick);
      } else if (action === "clutch") {
        race = pressShift(race, { throttle });
        log = recordClutch(log, tick);
      } else {
        race = gateInput(race, action);
        log = recordGate(log, tick, action);
      }
    }
    race = stepRace(race, { throttle }, TICK_SECONDS);
  }

  return {
    // Bumped by hand when the fixture's *shape* changes, so an old fixture read
    // by new test code fails loudly rather than being misinterpreted.
    version: 1,
    carId: GOLDEN_CAR_ID,
    gateId: GOLDEN_GATE_ID,
    distanceId: GOLDEN_DISTANCE_ID,
    countdownSeconds: 3,
    events: log.events,
    expected: {
      finishTime: race.finishTime,
      distance: race.vehicle.distance,
      topSpeed: race.topSpeed,
      reactionTime: race.reactionTime,
      launchGrade: race.launchGrade,
      gear: race.vehicle.gear,
      shifts: race.shifts.map((shift) => ({
        grade: shift.grade,
        reason: shift.reason,
        gear: shift.gear,
        rpmAtEngage: shift.rpmAtEngage,
        catchGrade: shift.catch?.grade ?? null,
        catchDelta: shift.catch?.deltaSeconds ?? null,
      })),
    },
  };
}
