// The anti-drift guard for the mirrored sim.
//
// `factory-network-server` adjudicates online rounds by replaying each driver's
// input log through its own *copy* of this cabinet's physics. The two repos are
// independent, so the copy is a copy — and the failure mode of any mirror is
// silent drift: the torque curve is retuned here, the server keeps deciding
// rounds on the old one, and it hands the win to the wrong car while both test
// suites stay green.
//
// So both repos commit the same fixture and both replay it. This file is the
// cabinet's half; `games/speed-demon/speed-demon-replay.test.mjs` over there is
// the other, and it asserts the same numbers. Retune anything the replay
// touches and both fail until `node tools/mirror-sim.mjs --golden` is run and
// the mirrored files are refreshed together.
//
// The fixture stores ids rather than the car itself, deliberately: each side
// rebuilds `DEFAULT_CAR` from its own constants, so a retune on one side alone
// shows up as a different finishing time rather than being replayed against a
// frozen copy that agrees with nobody.

import { readFileSync } from "node:fs";
import { suite, test, assert, assertEqual, finish } from "./harness.js";
import { DEFAULT_CAR, RACE_DISTANCES } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { FINISHED } from "../scripts/sim/race.js";
import { replayRun } from "../scripts/sim/input-log.js";

suite("golden run — the cabinet and the server must agree");

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/golden-run.json", import.meta.url), "utf8"),
);

test("the fixture is the shape this test was written for", () => {
  assertEqual(fixture.version, 1, "fixture shape changed — update this test with it");
  assertEqual(fixture.carId, "demon");
  assertEqual(fixture.gateId, "6-speed");
  assert(fixture.events.length > 0, "a fixture with no inputs proves nothing");
});

const replayFixture = () =>
  replayRun(
    {
      car: DEFAULT_CAR,
      gate: createGate(GATE_6_SPEED),
      distanceMetres: RACE_DISTANCES[fixture.distanceId].metres,
      countdownSeconds: fixture.countdownSeconds,
    },
    { events: fixture.events },
  ).race;

test("the golden run still finishes in exactly the recorded time", () => {
  const race = replayFixture();
  assertEqual(race.phase, FINISHED, "the golden run must reach the line");
  assertEqual(
    race.finishTime,
    fixture.expected.finishTime,
    "the physics moved. Re-run `node tools/mirror-sim.mjs --golden` and copy the mirror across, "
      + "or the server will decide online rounds on different physics from the client",
  );
});

test("distance, top speed and final gear are unchanged", () => {
  const race = replayFixture();
  assertEqual(race.vehicle.distance, fixture.expected.distance, "distance");
  assertEqual(race.topSpeed, fixture.expected.topSpeed, "top speed");
  assertEqual(race.vehicle.gear, fixture.expected.gear, "final gear");
});

test("the launch still grades the same way", () => {
  const race = replayFixture();
  assertEqual(race.reactionTime, fixture.expected.reactionTime, "reaction time");
  assertEqual(race.launchGrade, fixture.expected.launchGrade, "launch grade");
});

test("every shift still grades the same way, on all three axes", () => {
  const race = replayFixture();
  assertEqual(race.shifts.length, fixture.expected.shifts.length, "shift count");
  race.shifts.forEach((shift, i) => {
    const expected = fixture.expected.shifts[i];
    assertEqual(shift.grade, expected.grade, `shift ${i} grade`);
    assertEqual(shift.reason, expected.reason, `shift ${i} reason`);
    assertEqual(shift.gear, expected.gear, `shift ${i} gear`);
    assertEqual(shift.rpmAtEngage, expected.rpmAtEngage, `shift ${i} rpm at engage`);
    assertEqual(shift.catch?.grade ?? null, expected.catchGrade, `shift ${i} catch grade`);
    assertEqual(shift.catch?.deltaSeconds ?? null, expected.catchDelta, `shift ${i} catch offset`);
  });
});

test("the golden run is a properly driven one, so it actually exercises the grading", () => {
  // A fixture of a car sitting on the line would pin nothing. This one launches
  // on green and rows the whole gearbox.
  assertEqual(fixture.expected.launchGrade, "holeshot");
  assert(fixture.expected.shifts.length >= 4, "it should row through the gears");
  assert(
    fixture.expected.shifts.every((shift) => shift.catchGrade !== null),
    "and catch every one of them, so the third axis is covered",
  );
});

finish();
