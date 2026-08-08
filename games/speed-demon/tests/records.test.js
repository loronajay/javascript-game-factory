import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  BETTER_HIGHER,
  BETTER_LOWER,
  UNIT_CM,
  UNIT_MS,
  applyRun,
  boardDirection,
  boardIdFor,
  boardUnit,
  createRecord,
  createRecords,
  formatDelta,
  formatValue,
  isBetter,
  recordFor,
  runValue,
} from "../scripts/records/records.js";
import { MODE_DISTANCE, MODE_TIME_ATTACK, MODE_ONLINE } from "../scripts/sim/modes.js";

suite("records — what a personal best is");

// ---------------------------------------------------------------------------
// Boards

test("a board is a mode and an objective", () => {
  assertEqual(boardIdFor(MODE_DISTANCE, "quarter"), "distance:quarter");
  assertEqual(boardIdFor(MODE_TIME_ATTACK, "sprint"), "time-attack:sprint");
});

test("a stale objective falls back to the mode's default rather than inventing a board", () => {
  // "quarter" means nothing to a mode measured on a clock. Carrying it through
  // would mint `time-attack:quarter`, a board the server has never heard of, and
  // every run on it would be rejected with nothing on screen to explain why.
  assertEqual(boardIdFor(MODE_TIME_ATTACK, "quarter"), "time-attack:standard");
  assertEqual(boardIdFor(MODE_DISTANCE, "not-a-distance"), "distance:quarter");
});

test("online keeps no board, and that is a normal answer rather than an error", () => {
  // An online race belongs to the room: its distance and its strip are the
  // host's choice and its result is a match, not a time. The composition root
  // asks this on every finished run, so null has to be answerable.
  assertEqual(boardIdFor(MODE_ONLINE, "quarter"), null);
  assertEqual(boardIdFor("not-a-mode", "quarter"), null);
});

test("a mode's direction and unit follow its objective", () => {
  // The two are opposite, which is the whole reason direction is data.
  assertEqual(boardDirection(MODE_DISTANCE), BETTER_LOWER);
  assertEqual(boardDirection(MODE_TIME_ATTACK), BETTER_HIGHER);
  assertEqual(boardUnit(MODE_DISTANCE), UNIT_MS);
  assertEqual(boardUnit(MODE_TIME_ATTACK), UNIT_CM);
});

// ---------------------------------------------------------------------------
// Scoring a finished run

test("a distance race scores its finish time to the millisecond", () => {
  const race = { timeLimitSeconds: null, finishTime: 12.0403, vehicle: { distance: 402.3 } };
  // `finishTime` is interpolated across the tick that crossed the line rather
  // than snapped to a tick boundary, so rounding to ms keeps that precision.
  assertEqual(runValue(race), 12040);
});

test("a time attack scores the distance covered, to the centimetre", () => {
  const race = { timeLimitSeconds: 60, finishTime: null, vehicle: { distance: 2500.06 } };
  assertEqual(runValue(race), 250006);
});

test("a run that never reached the line scores nothing", () => {
  assertEqual(runValue({ timeLimitSeconds: null, finishTime: null, vehicle: { distance: 100 } }), null);
  assertEqual(runValue(null), null);
});

test("a fouled run still scores", () => {
  // A red light bogs the launch, and the bog is the whole penalty. The time it
  // produced is a real time — slow, but real — so voiding it as well would
  // punish the same mistake twice.
  const race = { timeLimitSeconds: null, finishTime: 13.35, falseStart: true, vehicle: { distance: 402.3 } };
  assertEqual(runValue(race), 13350);
});

// ---------------------------------------------------------------------------
// What beats what

test("lower wins on a time board and higher wins on a distance board", () => {
  assert(isBetter(BETTER_LOWER, 12040, 12380), "a faster time is better");
  assert(!isBetter(BETTER_LOWER, 12960, 12380), "a slower time is not");
  assert(isBetter(BETTER_HIGHER, 260000, 250000), "a longer distance is better");
  assert(!isBetter(BETTER_HIGHER, 240000, 250000), "a shorter distance is not");
});

test("anything beats nothing", () => {
  assert(isBetter(BETTER_LOWER, 12040, NaN));
  assert(isBetter(BETTER_HIGHER, 1, NaN));
});

test("a tie is not an improvement", () => {
  // Keeping the earlier run is what makes the date on a record mean "when this
  // was achieved" rather than "when it was last re-driven".
  assert(!isBetter(BETTER_LOWER, 12040, 12040));
  assert(!isBetter(BETTER_HIGHER, 12040, 12040));
});

// ---------------------------------------------------------------------------
// The set

test("a run only replaces a record it beats, and reports what it beat", () => {
  const first = applyRun({}, { boardId: "distance:quarter", direction: BETTER_LOWER, value: 12380 });
  assert(first.improved);
  assertEqual(first.previous, null);
  assertEqual(recordFor(first.records, "distance:quarter").value, 12380);

  const slower = applyRun(first.records, { boardId: "distance:quarter", direction: BETTER_LOWER, value: 12960 });
  assert(!slower.improved);
  // Same object identity, so a caller can skip a save without comparing contents.
  assertEqual(slower.records, first.records);
  assertEqual(slower.previous.value, 12380);

  const faster = applyRun(first.records, { boardId: "distance:quarter", direction: BETTER_LOWER, value: 12040 });
  assert(faster.improved);
  assertEqual(faster.records["distance:quarter"].value, 12040);
  // The beaten record travels back, because after the write there is no way to
  // ask what it was — and the results screen wants to say.
  assertEqual(faster.previous.value, 12380);
});

test("boards do not interfere with each other", () => {
  let records = {};
  records = applyRun(records, { boardId: "distance:quarter", direction: BETTER_LOWER, value: 12040 }).records;
  records = applyRun(records, { boardId: "time-attack:sprint", direction: BETTER_HIGHER, value: 250000 }).records;
  assertEqual(records["distance:quarter"].value, 12040);
  assertEqual(records["time-attack:sprint"].value, 250000);
});

test("a run with no board or no value changes nothing", () => {
  const records = { "distance:quarter": createRecord({ boardId: "distance:quarter", value: 12040 }) };
  assertEqual(applyRun(records, { boardId: "", direction: BETTER_LOWER, value: 1 }).records, records);
  assertEqual(applyRun(records, { boardId: "distance:quarter", direction: BETTER_LOWER, value: NaN }).records, records);
});

test("a locally-set record is never verified", () => {
  // It has not been anywhere that could check it. Only the server's replay pass
  // can set this, so a client claiming it would be claiming its own evidence.
  const { records } = applyRun({}, { boardId: "distance:quarter", direction: BETTER_LOWER, value: 12040 });
  assertEqual(records["distance:quarter"].verified, false);
});

test("malformed saved data is dropped rather than trusted", () => {
  const records = createRecords({
    "distance:quarter": { value: 12040 },
    "distance:half": { value: "fast" },
    "distance:mile": { value: null },
  });
  assertEqual(Object.keys(records).length, 1);
  assertEqual(records["distance:quarter"].boardId, "distance:quarter", "the key is the id");
  assertEqual(Object.keys(createRecords(null)).length, 0);
  assertEqual(Object.keys(createRecords("nonsense")).length, 0);
});

// ---------------------------------------------------------------------------
// Reading it back

test("a value formats in its board's own unit", () => {
  assertEqual(formatValue(UNIT_MS, 11924), "11.924s");
  assertEqual(formatValue(UNIT_CM, 250006), "2500.1 m");
  assertEqual(formatValue(UNIT_MS, null), "—");
});

test("a delta reads negative when it is an improvement, whichever way the board runs", () => {
  // "-0.34s" and "-12.0 m" both have to mean "better than before", or the sign
  // means one thing in Distance Race and the opposite in Time Attack.
  assertEqual(formatDelta(UNIT_MS, BETTER_LOWER, 12040, 12380), "-0.340s");
  assertEqual(formatDelta(UNIT_MS, BETTER_LOWER, 12960, 12380), "+0.580s");
  assertEqual(formatDelta(UNIT_CM, BETTER_HIGHER, 260000, 250000), "-100.0 m");
  assertEqual(formatDelta(UNIT_CM, BETTER_HIGHER, 240000, 250000), "+100.0 m");
});

test("a delta against nothing is null rather than a made-up zero", () => {
  assertEqual(formatDelta(UNIT_MS, BETTER_LOWER, 12040, NaN), null);
});

finish();
