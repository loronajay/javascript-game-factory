// The opponent's car is simulated, not approximated. These tests hold that
// claim: fed the same inputs, the reconstruction lands on exactly the state the
// driver's own machine is in — not close to it, on it.

import { readFileSync } from "node:fs";
import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";
import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { replayRun } from "../scripts/sim/input-log.js";
import {
  advanceTo,
  createOpponent,
  extrapolatedSeconds,
  gapMetres,
  receiveInputs,
} from "../scripts/online/opponent.js";

suite("online opponent reconstruction");

const golden = JSON.parse(readFileSync(new URL("./fixtures/golden-run.json", import.meta.url), "utf8"));

const options = () => ({
  car: DEFAULT_CAR,
  gate: createGate(GATE_6_SPEED),
  distanceMetres: RACE_DISTANCES.quarter.metres,
  countdownSeconds: 3,
});

const allEvents = () => golden.events.map((event) => ({ ...event }));

/** The state the opponent's own machine is in at `tick`. */
const truthAt = (tick) => replayRun(options(), { events: allEvents() }, { maxTicks: tick }).race;

test("a fresh opponent is a car on the line, not a blank", () => {
  const opponent = createOpponent(options());
  assertEqual(opponent.race.vehicle.distance, 0);
  assertEqual(opponent.tick, 0);
});

test("with the whole stream in hand, the reconstruction is exact", () => {
  let opponent = createOpponent(options());
  opponent = receiveInputs(opponent, allEvents());
  opponent = advanceTo(opponent, 600);

  const truth = truthAt(600);
  assertEqual(opponent.race.vehicle.distance, truth.vehicle.distance, "distance must be identical");
  assertEqual(opponent.race.vehicle.speed, truth.vehicle.speed, "speed");
  assertEqual(opponent.race.vehicle.gear, truth.vehicle.gear, "gear");
  assertEqual(opponent.race.vehicle.rpm, truth.vehicle.rpm, "rpm");
});

test("the reconstruction stays exact all the way to the line", () => {
  let opponent = createOpponent(options());
  opponent = receiveInputs(opponent, allEvents());
  opponent = advanceTo(opponent, 2000);

  assertEqual(opponent.race.phase, "finished");
  assertEqual(
    opponent.race.finishTime,
    golden.expected.finishTime,
    "the other car crosses when it really crossed",
  );
});

test("a stream arriving in chunks converges on the same car", () => {
  let opponent = createOpponent(options());
  const events = allEvents();
  // Delivered a few at a time, with the reconstruction advanced between packets
  // the way the game loop would.
  for (let i = 0; i < events.length; i += 5) {
    opponent = receiveInputs(opponent, events.slice(i, i + 5));
    opponent = advanceTo(opponent, Math.min(2000, (i + 5) * 40));
  }
  opponent = advanceTo(opponent, 2000);
  assertEqual(opponent.race.finishTime, golden.expected.finishTime);
});

test("a duplicated packet does not put a phantom gate move in the other car", () => {
  let opponent = createOpponent(options());
  const events = allEvents();
  opponent = receiveInputs(opponent, events);
  opponent = receiveInputs(opponent, events); // the same packet again
  opponent = receiveInputs(opponent, events.slice(0, 8)); // and an overlapping resend
  opponent = advanceTo(opponent, 2000);
  assertEqual(opponent.race.finishTime, golden.expected.finishTime, "a resend must cost nothing");
});

test("out-of-order packets arrive at the same car as in-order ones", () => {
  const events = allEvents();
  let shuffled = createOpponent(options());
  shuffled = receiveInputs(shuffled, events.slice(10));
  shuffled = receiveInputs(shuffled, events.slice(0, 10));
  shuffled = advanceTo(shuffled, 2000);
  assertEqual(shuffled.race.finishTime, golden.expected.finishTime);
});

// ---------------------------------------------------------------------------
// The gap, and the guess
// ---------------------------------------------------------------------------

test("past the last input the throttle is held, and nothing else is invented", () => {
  // Only the launch has arrived. The car should keep accelerating rather than
  // freezing on the line — but it must not shift, because a shift is an event
  // and no event has been received.
  const launchOnly = allEvents().filter((event) => event.t <= 190);
  let opponent = createOpponent(options());
  opponent = receiveInputs(opponent, launchOnly);
  opponent = advanceTo(opponent, 400);

  assert(opponent.race.vehicle.distance > 0, "the other car should still be moving");
  assertEqual(opponent.race.vehicle.gear, 1, "but must not be given a gear it was never sent");
});

test("the guess is short-lived: real inputs rebuild the run exactly", () => {
  const events = allEvents();
  let opponent = createOpponent(options());

  // Run ahead on a stale stream, so the car is drawn on extrapolation...
  opponent = receiveInputs(opponent, events.filter((event) => event.t <= 200));
  opponent = advanceTo(opponent, 600);
  const guessed = opponent.race.vehicle.distance;

  // ...then the rest lands, and the run is rebuilt from the start of the round.
  opponent = receiveInputs(opponent, events);
  opponent = advanceTo(opponent, 600);

  assertEqual(opponent.race.vehicle.distance, truthAt(600).vehicle.distance, "exact after the rebuild");
  assert(guessed !== opponent.race.vehicle.distance, "the guess really was a guess");
});

test("how far the drawing is running ahead of the inputs is reported", () => {
  const partial = allEvents().filter((event) => event.t <= 200);
  // The last event in the slice, not the cut itself — the fixture has no input
  // on tick 200, and the extrapolation is measured from real inputs.
  const lastReceived = Math.max(...partial.map((event) => event.t));

  let opponent = createOpponent(options());
  opponent = receiveInputs(opponent, partial);
  assertEqual(opponent.confirmedTick, lastReceived);

  opponent = advanceTo(opponent, lastReceived + 60);
  assertClose(extrapolatedSeconds(opponent), 1.0, 1e-9, "60 ticks past the last input is one second");

  opponent = receiveInputs(opponent, allEvents());
  assert(extrapolatedSeconds(opponent) < 1.0, "and it shrinks when the stream catches up");
});

test("the gap between the cars is reported in metres, signed toward the leader", () => {
  let ahead = createOpponent(options());
  ahead = receiveInputs(ahead, allEvents());
  ahead = advanceTo(ahead, 600);

  const behind = replayRun(options(), { events: allEvents().map((e) => ({ ...e, t: e.t + 60 })) }, {
    maxTicks: 600,
  }).race;

  assert(gapMetres(ahead, behind) > 0, "an opponent further down the strip reads positive");
  assert(gapMetres(ahead, ahead.race) === 0, "and level reads zero");
});

test("advancing to a tick already reached does not move the car", () => {
  let opponent = createOpponent(options());
  opponent = receiveInputs(opponent, allEvents());
  opponent = advanceTo(opponent, 500);
  const distance = opponent.race.vehicle.distance;
  opponent = advanceTo(opponent, 500);
  assertEqual(opponent.race.vehicle.distance, distance, "advancing is idempotent at the same tick");
});

test("a silent opponent sits on the line rather than drifting off it", () => {
  let opponent = createOpponent(options());
  opponent = advanceTo(opponent, 1200);
  assertEqual(opponent.race.vehicle.distance, 0, "no inputs means no launch, not a runaway car");
});

test("reconstruction never mutates the opponent it is given", () => {
  const opponent = createOpponent(options());
  const next = receiveInputs(opponent, allEvents());
  assertEqual(opponent.log.events.length, 0, "the input must be untouched");
  assert(next !== opponent);
});

finish();
