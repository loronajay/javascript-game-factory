import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { createRace, startRace, stepRace, pressShift, gateInput } from "../scripts/sim/race.js";
import {
  COACH_STEP_COUNT,
  createCoach,
  acknowledgeCoach,
  advanceCoach,
  coachHolds,
  coachFinished,
  coachView,
} from "../scripts/ui/coach.js";

suite("coach — the guided practice run");

const car = DEFAULT_CAR;
const gate = createGate(GATE_6_SPEED);
const FLOOR = { throttle: 1 };
const LIFT = { throttle: 0 };

const newRace = () =>
  createRace({ car, gate, distanceMetres: RACE_DISTANCES.mile.metres, countdownSeconds: 0 });

/** Walks the coach forward as far as the given race lets it. */
function settle(coach, race) {
  let next = coach;
  for (let i = 0; i < COACH_STEP_COUNT; i += 1) {
    const moved = advanceCoach(next, race);
    if (moved === next) {
      return next;
    }
    next = moved;
  }
  return next;
}

const stepId = (coach, race) => coachView(coach, race)?.id ?? null;

/** Drives the coach and the race together, acknowledging every beat. */
function play(steps) {
  let race = newRace();
  let coach = createCoach();
  const seen = [];

  for (const step of steps) {
    race = step(race);
    coach = settle(coach, race);
    while (coachHolds(coach)) {
      seen.push(stepId(coach, race));
      coach = acknowledgeCoach(coach);
      coach = settle(coach, race);
    }
    seen.push(stepId(coach, race));
  }
  return { race, coach, seen };
}

// ---------------------------------------------------------------------------
// The shape of the lesson
// ---------------------------------------------------------------------------

test("the coach opens on something to read, with the world held", () => {
  const coach = createCoach();
  assert(coachHolds(coach), "the first beat explains before anything moves");
  assertEqual(stepId(coach, newRace()), "intro");
  assert(!coachFinished(coach));
});

test("a holding beat is cleared by the player and by nothing else", () => {
  const race = newRace();
  const coach = createCoach();
  assertEqual(advanceCoach(coach, race), coach, "watching the race must not skip an explanation");
  assertEqual(stepId(acknowledgeCoach(coach), race), "stage");
});

test("acknowledging does nothing on a step that is a thing to do", () => {
  const doing = acknowledgeCoach(createCoach()); // now on "stage"
  assert(!coachHolds(doing));
  assertEqual(acknowledgeCoach(doing), doing);
});

test("every step has a title and something to say", () => {
  const race = newRace();
  let coach = createCoach();
  for (let i = 0; i < COACH_STEP_COUNT; i += 1) {
    const view = coachView(coach, race);
    assert(view, `step ${i} produced no view`);
    assert(view.title && view.title.length > 0, `step ${view.id} has no title`);
    assert(view.lines.length > 0, `step ${view.id} says nothing`);
    assertEqual(view.index, i + 1);
    assertEqual(view.total, COACH_STEP_COUNT);
    coach = { ...coach, index: coach.index + 1 };
  }
  assert(coachFinished(coach), "and then it is over");
});

test("a finished coach has no view left to draw", () => {
  const coach = { index: COACH_STEP_COUNT };
  assert(coachFinished(coach));
  assertEqual(coachView(coach, newRace()), null);
});

// ---------------------------------------------------------------------------
// It tracks the race rather than scripting it
// ---------------------------------------------------------------------------

test("the lesson follows the car through a whole shift", () => {
  const { seen } = play([
    (race) => race, // intro
    (race) => startRace(race),
    (race) => stepRace(race, FLOOR, TICK_SECONDS), // launched
    (race) => {
      let next = race;
      while (next.vehicle.rpm < car.optimalShiftRpm) {
        next = stepRace(next, FLOOR, TICK_SECONDS);
      }
      return next;
    },
    (race) => pressShift(race, LIFT),
    (race) => gateInput(gateInput(race, "down"), "down"),
    (race) => {
      let next = race;
      while (next.pendingShift && next.elapsed < next.pendingShift.clutchAt) {
        next = stepRace(next, LIFT, TICK_SECONDS);
      }
      return stepRace(next, FLOOR, TICK_SECONDS);
    },
  ]);

  assertEqual(seen[0], "intro");
  assert(seen.includes("stage"), seen.join(" > "));
  assert(seen.includes("launch"), seen.join(" > "));
  assert(seen.includes("lift"), seen.join(" > "));
  assert(seen.includes("verdict"), "the shift has to be talked through afterwards");
  assert(seen.indexOf("lift") < seen.indexOf("verdict"), seen.join(" > "));
});

test("a player who gets ahead of the coach is not held back", () => {
  // Shift before being told to. Every step is a condition on the race, so the
  // coach catches up rather than waiting for an instruction it already missed.
  let race = startRace(newRace());
  race = stepRace(race, FLOOR, TICK_SECONDS);
  race = pressShift(race, LIFT);
  race = gateInput(gateInput(race, "down"), "down");

  const coach = settle(acknowledgeCoach(createCoach()), race);
  assertEqual(stepId(coach, race), "catch", "straight past stage, launch, wind, lift and gate");
});

test("the verdict speaks to the shift that was actually made", () => {
  let race = startRace(newRace());
  race = stepRace(race, FLOOR, TICK_SECONDS);
  race = pressShift(race, LIFT);
  race = gateInput(gateInput(race, "down"), "down");
  race = stepRace({ ...race, elapsed: race.pendingShift.clutchAt + 5 }, LIFT, TICK_SECONDS);

  const coach = settle(acknowledgeCoach(createCoach()), race);
  assertEqual(stepId(coach, race), "verdict");
  assert(coachHolds(coach), "a verdict is something to read");
  const view = coachView(coach, race);
  assertEqual(view.title, `${race.lastShift.grade.toUpperCase()} SHIFT`);
});

test("the lift step nags only while the clutch is actually waiting", () => {
  let race = startRace(newRace());
  race = stepRace(race, FLOOR, TICK_SECONDS);
  let coach = settle(acknowledgeCoach(createCoach()), race);
  while (coachHolds(coach)) {
    coach = settle(acknowledgeCoach(coach), race);
  }
  // Wind it out so the lesson is on the lift step.
  while (race.vehicle.rpm < car.optimalShiftRpm) {
    race = stepRace(race, FLOOR, TICK_SECONDS);
  }
  coach = settle(coach, race);
  assertEqual(stepId(coach, race), "lift");
  assertEqual(coachView(coach, race).hint, null, "nothing to correct yet");

  const armed = pressShift(race, FLOOR);
  assert(coachView(coach, armed).hint, "asking for the clutch on the gas earns a nudge");
});

finish();
