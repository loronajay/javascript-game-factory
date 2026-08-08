// The driving coach — pure.
//
// A guided practice run. The player drives a real race with a real car on a real
// track; the coach watches the race state and says what to do next, stopping the
// world at the beats that are worth reading rather than at every step.
//
// **It teaches by observation, not by scripting.** Every step names a condition
// on the race and waits for it, so the player can get ahead of the coach, do it
// out of order, or fumble it, and the sequence still tracks what actually
// happened. Nothing here drives the car and nothing here is allowed to: the
// coach is a reader of race state, which is why it is pure and testable and why
// the tutorial cannot drift away from the game it is teaching.
//
// Steps that `hold` freeze the world until the player acknowledges them. Those
// are the explanations; the rest are things to go and do.

import { STAGING } from "../sim/race.js";

/** How far below the shift point the "wind it out" step lets go. */
const WIND_LEAD_RPM = 700;

/**
 * True once the gate has resolved, whether or not the catch has landed.
 *
 * Every step's condition is "this, or anything after it, has happened" — that is
 * what lets a player run ahead of the lesson without stranding it on a step
 * whose moment has already gone by.
 */
const pastTheGate = (race) => race.pendingShift !== null || race.shifts.length > 0;

const CATCH_VERDICTS = {
  clean: "Caught it clean — that shift kept everything the gate earned.",
  loose: "A little off the bite. A loose catch costs you a grade.",
  fumbled: "The gas never landed in the window, which costs two grades.",
};

const STEPS = [
  {
    id: "intro",
    hold: true,
    title: "THIS CAR IS A MANUAL",
    lines: [
      "A shift is three inputs, not one.",
      "Come off the gas, work the gate, then get back on the gas",
      "as the clutch bites. Every one of them is timed.",
    ],
  },
  {
    id: "stage",
    title: "STAGE THE CAR",
    lines: ["Press ENTER to roll up to the line."],
    done: (race) => race.phase !== STAGING,
  },
  {
    id: "launch",
    title: "WAIT FOR GREEN",
    lines: [
      "Three ambers, then green.",
      "Hold SPACE the instant it lights — not before, or you red-light.",
    ],
    done: (race) => race.launched,
  },
  {
    id: "wind",
    title: "WIND IT OUT",
    lines: [
      "Hold SPACE. Watch the tachometer.",
      "The shift light comes on as the engine reaches its shift point.",
    ],
    done: (race, { shiftPoint }) =>
      race.vehicle.rpm >= shiftPoint - WIND_LEAD_RPM ||
      race.shift !== null ||
      race.shiftArmed ||
      pastTheGate(race),
  },
  {
    id: "lift",
    title: "LIFT, THEN CLUTCH",
    // Each line stands on its own, because the hint replaces the last one and a
    // sentence cut off halfway through reads as a bug.
    lines: [
      "Release SPACE, then press SHIFT.",
      "You cannot declutch with your foot on the gas.",
      "Ask for it anyway and the clutch waits until you lift.",
    ],
    hint: (race) => (race.shiftArmed ? "Still on the gas — the clutch is waiting for you." : null),
    done: (race) => race.shift !== null || pastTheGate(race),
  },
  {
    id: "gate",
    title: "WORK THE GATE",
    lines: [
      "First to second is DOWN, then DOWN.",
      "The knob has to travel the H-pattern like a real stick.",
    ],
    done: pastTheGate,
  },
  {
    id: "catch",
    title: "CATCH THE GAS",
    lines: [
      "Press SPACE again as the clutch bites.",
      "The bar shows the window — land the marker in the green.",
    ],
    done: (race) => race.shifts.length > 0,
  },
  {
    id: "verdict",
    hold: true,
    title: (race) => `${(race.lastShift?.grade ?? "no").toUpperCase()} SHIFT`,
    lines: (race) => [
      CATCH_VERDICTS[race.lastShift?.catch?.grade] ?? "That one got away.",
      "The rpm you shifted at sets the ceiling; the gate and the catch",
      "can only take grades off it. Timing first, hands second.",
    ],
  },
  {
    id: "repeat",
    title: "NOW THE REST OF THE BOX",
    lines: [
      "Lift · clutch · gate · catch, all the way up.",
      "Second to third is UP, RIGHT, UP.",
    ],
    done: (race) => race.shifts.length >= 3,
  },
  {
    id: "done",
    hold: true,
    title: "THAT IS THE WHOLE SKILL",
    lines: [
      "Shift on the light, keep your feet honest, and the car does the rest.",
      "Take this one to the line.",
    ],
  },
];

export const COACH_STEP_COUNT = STEPS.length;

export function createCoach() {
  return { index: 0 };
}

/** True while the world must stop: the current step is something to read. */
export function coachHolds(coach) {
  return Boolean(coach && STEPS[coach.index]?.hold);
}

export function coachFinished(coach) {
  return !coach || coach.index >= STEPS.length;
}

/** ENTER on a holding step. Anything else leaves the coach alone. */
export function acknowledgeCoach(coach) {
  return coachHolds(coach) ? { ...coach, index: coach.index + 1 } : coach;
}

/**
 * Looks at the race and moves on if this step's condition has been met. Holding
 * steps are never advanced from here — only the player clears those.
 */
export function advanceCoach(coach, race) {
  const step = coach && STEPS[coach.index];
  if (!step || step.hold) {
    return coach;
  }
  return step.done(race, { shiftPoint: race.car.optimalShiftRpm })
    ? { ...coach, index: coach.index + 1 }
    : coach;
}

const resolve = (value, race) => (typeof value === "function" ? value(race) : value);

/** Everything the renderer needs, already shaped. Null once the coach is done. */
export function coachView(coach, race) {
  const step = coach && STEPS[coach.index];
  if (!step) {
    return null;
  }
  return {
    id: step.id,
    title: resolve(step.title, race),
    lines: resolve(step.lines, race),
    hint: step.hint ? step.hint(race) : null,
    holding: Boolean(step.hold),
    index: coach.index + 1,
    total: STEPS.length,
  };
}
