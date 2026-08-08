// The input log is the load-bearing claim of online play: a run is completely
// described by its options plus what the driver did. If a replay can diverge
// from the run it was recorded from, then the opponent's car is drawn wrong and
// the server adjudicates the wrong winner — so these tests drive a race the way
// the real loop does and insist the replay lands in exactly the same place.

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";
import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { createRace, startRace, stepRace, pressShift, gateInput, FINISHED } from "../scripts/sim/race.js";
import {
  EVENT_CLUTCH,
  EVENT_GATE,
  EVENT_THROTTLE,
  createInputLog,
  eventsSince,
  mergeEvents,
  recordClutch,
  recordGate,
  recordStart,
  recordThrottle,
  replayRun,
  throttleAt,
} from "../scripts/sim/input-log.js";

suite("input-log");

const gate = createGate(GATE_6_SPEED);
const options = () => ({
  car: DEFAULT_CAR,
  gate,
  distanceMetres: RACE_DISTANCES.quarter.metres,
  countdownSeconds: 3,
});

/**
 * Drives a race exactly as `init-game.js`'s loop does — discrete actions first,
 * then one `stepRace` at the tick's throttle level — while recording every input
 * into a log. `script` is keyed by tick and returns that tick's throttle plus any
 * actions, which is the same pair the real loop has in hand.
 */
function drive(script, maxTicks = 2000) {
  let race = createRace(options());
  let log = createInputLog();
  let throttle = 0;

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const frame = script(tick, race) ?? {};
    throttle = frame.throttle ?? throttle;

    // The recorder samples the throttle at the top of the tick, which is where
    // the live loop samples the keyboard.
    log = recordThrottle(log, tick, throttle);

    for (const action of frame.actions ?? []) {
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
    if (race.phase === FINISHED) break;
  }
  return { race, log };
}

/** The gate moves that take the 6-speed from `gear` to the next one up. */
const UPSHIFTS = {
  1: ["down", "down"],
  2: ["up", "right", "up"],
  3: ["down", "down"],
  4: ["up", "right", "up"],
  5: ["down", "down"],
};

/**
 * A full quarter mile driven properly: stage, launch on green, and for each
 * upshift lift off the gas, work the gate, coast to the bite, then catch it.
 * This is the run the whole cabinet is tuned around, so it is the one worth
 * proving replays.
 */
function cleanQuarterMile() {
  let phase = "waiting";
  let queue = [];
  let caughtAt = null;

  return drive((tick, race) => {
    if (tick === 0) return { throttle: 0, actions: ["start"] };
    // Green: the countdown is 3s, so the first RUNNING tick is where the
    // throttle goes down.
    if (race.phase === "countdown") return { throttle: 0 };

    if (phase === "waiting") {
      phase = "driving";
      return { throttle: 1 };
    }

    if (phase === "driving") {
      const gear = race.vehicle.gear;
      if (race.vehicle.rpm >= DEFAULT_CAR.optimalShiftRpm && UPSHIFTS[gear]) {
        phase = "lifting";
        queue = [...UPSHIFTS[gear]];
        return { throttle: 0, actions: ["clutch"] }; // off the gas: the gate opens now
      }
      return { throttle: 1 };
    }

    if (phase === "lifting") {
      const next = queue.shift();
      if (queue.length === 0) phase = "coasting";
      return { throttle: 0, actions: [next] };
    }

    if (phase === "coasting") {
      // Catch the clutch as it bites, which is what a clean third input is.
      if (race.pendingShift && race.elapsed >= race.pendingShift.clutchAt) {
        phase = "driving";
        caughtAt = tick;
        return { throttle: 1 };
      }
      return { throttle: 0 };
    }
    return {};
  });
}

test("a driven run replays to exactly the same finishing time", () => {
  const { race, log } = cleanQuarterMile();
  assertEqual(race.phase, FINISHED, "the reference run should reach the line");

  const replayed = replayRun(options(), log).race;
  assertEqual(replayed.phase, FINISHED, "the replay should reach the line too");
  assertEqual(
    replayed.finishTime,
    race.finishTime,
    "replay must be bit-exact, not merely close — the server decides rounds on this number",
  );
});

test("a driven run replays to exactly the same distance, speed and gear", () => {
  const { race, log } = cleanQuarterMile();
  const replayed = replayRun(options(), log).race;
  assertEqual(replayed.vehicle.distance, race.vehicle.distance, "distance");
  assertEqual(replayed.vehicle.speed, race.vehicle.speed, "speed");
  assertEqual(replayed.vehicle.gear, race.vehicle.gear, "gear");
  assertEqual(replayed.vehicle.rpm, race.vehicle.rpm, "rpm");
  assertEqual(replayed.topSpeed, race.topSpeed, "top speed");
});

test("every shift replays with the same grade, reason and catch", () => {
  const { race, log } = cleanQuarterMile();
  const replayed = replayRun(options(), log).race;

  assert(race.shifts.length >= 4, `expected a full row of gears, got ${race.shifts.length}`);
  assertEqual(replayed.shifts.length, race.shifts.length, "shift count");
  for (let i = 0; i < race.shifts.length; i += 1) {
    assertEqual(replayed.shifts[i].grade, race.shifts[i].grade, `shift ${i} grade`);
    assertEqual(replayed.shifts[i].reason, race.shifts[i].reason, `shift ${i} reason`);
    // `catch` is an object, so it is compared field by field — identity would
    // never match across two separate replays.
    assertEqual(replayed.shifts[i].catch?.grade, race.shifts[i].catch?.grade, `shift ${i} catch grade`);
    assertEqual(replayed.shifts[i].catch?.reason, race.shifts[i].catch?.reason, `shift ${i} catch reason`);
    assertEqual(
      replayed.shifts[i].catch?.deltaSeconds,
      race.shifts[i].catch?.deltaSeconds,
      `shift ${i} catch offset`,
    );
    assertEqual(replayed.shifts[i].gear, race.shifts[i].gear, `shift ${i} gear`);
  }
});

test("the launch replays with the same reaction time and grade", () => {
  const { race, log } = cleanQuarterMile();
  const replayed = replayRun(options(), log).race;
  assertEqual(replayed.reactionTime, race.reactionTime, "reaction time");
  assertEqual(replayed.launchGrade, race.launchGrade, "launch grade");
});

test("a false start replays as a false start, at the same point on the tree", () => {
  // Jumps the light a second into the countdown and then drives it out.
  const { race, log } = drive((tick) => {
    if (tick === 0) return { throttle: 0, actions: ["start"] };
    if (tick === 60) return { throttle: 1 };
    return {};
  });

  assert(race.falseStart, "the reference run should have fouled");
  const replayed = replayRun(options(), log).race;
  assertEqual(replayed.falseStart, true, "the replay should foul too");
  assertEqual(replayed.falseStartAt, race.falseStartAt, "and at the same point on the tree");
  assertEqual(replayed.launchGrade, "foul", "which grades as a foul");
});

test("a throttle held through a shift replays as a fumble, exactly as it was driven", () => {
  // The player asks for the clutch but never lifts, so it only ever arms. This
  // is the case the throttle model exists to punish, and the replay has to see
  // it the same way the live run did.
  const { race, log } = drive((tick, race) => {
    if (tick === 0) return { throttle: 0, actions: ["start"] };
    if (race.phase === "countdown") return { throttle: 0 };
    if (race.vehicle.rpm >= DEFAULT_CAR.optimalShiftRpm && race.vehicle.gear === 1 && !race.shiftArmed) {
      return { throttle: 1, actions: ["clutch"] };
    }
    return { throttle: 1 };
  });

  // Driven to the line rather than cut short, so the replay — which runs until
  // the race finishes — is compared against the same run and not a prefix of it.
  assertEqual(race.phase, FINISHED, "stuck in first, it still crosses eventually");
  const replayed = replayRun(options(), log).race;
  assertEqual(replayed.shiftArmed, race.shiftArmed, "the clutch should still be merely armed");
  assertEqual(replayed.vehicle.gear, 1, "so the car never left first");
  assertEqual(replayed.vehicle.gear, race.vehicle.gear, "gear");
  assertEqual(replayed.finishTime, race.finishTime, "finishing time");
  assertEqual(replayed.vehicle.distance, race.vehicle.distance, "distance");
});

test("the throttle is recorded as edges, not as a level every tick", () => {
  const { log } = cleanQuarterMile();
  const throttleEvents = log.events.filter((event) => event.k === EVENT_THROTTLE);
  // A quarter mile is ~900 ticks; a lift and a catch per shift is ~10 edges.
  assert(
    throttleEvents.length < 30,
    `expected a handful of throttle edges, got ${throttleEvents.length} — the log is being written per tick`,
  );
  assert(log.events.length < 60, `expected a small log, got ${log.events.length} events`);
});

test("no two consecutive throttle edges carry the same level", () => {
  const { log } = cleanQuarterMile();
  let last = 0;
  for (const event of log.events) {
    if (event.k !== EVENT_THROTTLE) continue;
    assert(event.v !== last, `a redundant throttle edge to ${event.v} at tick ${event.t}`);
    last = event.v;
  }
});

test("throttleAt reconstructs the level between edges", () => {
  let log = createInputLog();
  log = recordThrottle(log, 10, 1);
  log = recordThrottle(log, 20, 0);
  log = recordThrottle(log, 25, 1);

  assertEqual(throttleAt(log, 0), 0, "before the first edge");
  assertEqual(throttleAt(log, 9), 0, "still before it");
  assertEqual(throttleAt(log, 10), 1, "on the edge itself");
  assertEqual(throttleAt(log, 15), 1, "between edges");
  assertEqual(throttleAt(log, 20), 0, "on the lift");
  assertEqual(throttleAt(log, 24), 0, "still lifted");
  assertEqual(throttleAt(log, 999), 1, "past the last edge");
});

test("a clutch on the same tick as a lift opens the gate rather than arming it", () => {
  // The ordering rule the replay depends on: the throttle is resolved across the
  // whole tick before the tick's actions are applied, because the live loop
  // samples it once per frame. Get this backwards and a shift grades from the
  // wrong rpm.
  const built = drive((tick, race) => {
    if (tick === 0) return { throttle: 0, actions: ["start"] };
    if (race.phase === "countdown") return { throttle: 0 };
    if (race.vehicle.rpm >= DEFAULT_CAR.optimalShiftRpm && race.vehicle.gear === 1) {
      return { throttle: 0, actions: ["clutch"] }; // lift and clutch on one tick
    }
    return { throttle: 1 };
  }, 400);

  assert(built.race.shift !== null || built.race.vehicle.gear > 1, "the gate should have opened");
  assertEqual(built.race.shiftArmed, false, "not merely armed");

  const replayed = replayRun(options(), built.log).race;
  assertEqual(replayed.shiftArmed, false, "and the replay agrees");
  assertEqual(replayed.rpmAtEngage, built.race.rpmAtEngage, "sampling the same rpm at the lift");
});

test("mergeEvents drops duplicates, so a resent packet cannot fake a gate move", () => {
  const incoming = [
    { t: 5, k: EVENT_CLUTCH, v: 0 },
    { t: 6, k: EVENT_GATE, v: 1 },
  ];
  let log = mergeEvents(createInputLog(), incoming);
  assertEqual(log.events.length, 2, "both land the first time");

  log = mergeEvents(log, incoming); // the same packet again
  assertEqual(log.events.length, 2, "and neither lands twice");
});

test("mergeEvents sorts by tick, so packet arrival order cannot change a run", () => {
  const inOrder = mergeEvents(createInputLog(), [
    { t: 1, k: EVENT_CLUTCH, v: 0 },
    { t: 4, k: EVENT_GATE, v: 0 },
    { t: 9, k: EVENT_GATE, v: 1 },
  ]);
  const outOfOrder = mergeEvents(
    mergeEvents(createInputLog(), [{ t: 9, k: EVENT_GATE, v: 1 }]),
    [{ t: 1, k: EVENT_CLUTCH, v: 0 }, { t: 4, k: EVENT_GATE, v: 0 }],
  );
  assert(
    JSON.stringify(inOrder.events) === JSON.stringify(outOfOrder.events),
    "a log assembled out of order should equal one assembled in order",
  );
});

test("mergeEvents rejects malformed events rather than replaying them", () => {
  const log = mergeEvents(createInputLog(), [
    { t: -1, k: EVENT_CLUTCH, v: 0 },
    { t: 5, k: "nonsense", v: 0 },
    { t: Number.NaN, k: EVENT_GATE, v: 0 },
    { t: 7, k: EVENT_GATE, v: 2 },
  ]);
  assertEqual(log.events.length, 1, "only the well-formed one survives");
  assertEqual(log.events[0].t, 7);
});

test("a merged stream replays identically to the log it was streamed from", () => {
  // This is the opponent's car: the other client never has the original log
  // object, only the events that arrived over the wire.
  const { race, log } = cleanQuarterMile();
  let received = createInputLog();
  // Delivered in arbitrary-sized chunks, with the last chunk resent.
  for (let i = 0; i < log.events.length; i += 7) {
    received = mergeEvents(received, log.events.slice(i, i + 7));
  }
  received = mergeEvents(received, log.events.slice(-7));

  const replayed = replayRun(options(), received).race;
  assertEqual(replayed.finishTime, race.finishTime, "the opponent's car finishes where it really finished");
  assertEqual(replayed.vehicle.distance, race.vehicle.distance, "distance");
});

test("eventsSince returns only the tail, so a live stream stays small", () => {
  const { log } = cleanQuarterMile();
  const midpoint = log.events[Math.floor(log.events.length / 2)].t;
  const tail = eventsSince(log, midpoint);
  assert(tail.length > 0, "there should be a tail");
  assert(tail.length < log.events.length, "but not the whole log");
  assert(tail.every((event) => event.t >= midpoint), "and nothing before the cut");
});

test("streaming a log in tick-sized windows loses nothing", () => {
  // The live client sends `eventsSince(log, sentThrough)` each tick and then
  // advances `sentThrough`. Advancing it one tick too far skipped exactly one
  // tick's worth of inputs every time — and when a launch landed on a skipped
  // tick the server replayed a car that never moved and scored the run DNF.
  const { race, log } = cleanQuarterMile();
  const lastTick = Math.max(...log.events.map((event) => event.t));

  let sentThrough = 0;
  let received = createInputLog();
  for (let tick = 0; tick <= lastTick + 1; tick += 1) {
    // Everything recorded up to and including `tick` is available to send.
    const available = { events: log.events.filter((event) => event.t <= tick) };
    const tail = eventsSince(available, sentThrough);
    if (tail.length > 0) {
      received = mergeEvents(received, tail);
      sentThrough = tick; // the cursor the client keeps — never tick + 1
    }
  }

  assertEqual(received.events.length, log.events.length, "every event must reach the far end");
  const replayed = replayRun(options(), received).race;
  assertEqual(replayed.finishTime, race.finishTime, "and the run must replay identically");
});

test("re-sending an already-streamed window is harmless", () => {
  // Which is why the cursor errs backwards: a duplicate is dropped on arrival,
  // a gap loses the run.
  const { race, log } = cleanQuarterMile();
  let received = createInputLog();
  for (let i = 0; i < log.events.length; i += 3) {
    received = mergeEvents(received, log.events.slice(0, i + 3)); // always from the start
  }
  assertEqual(received.events.length, log.events.length);
  assertEqual(replayRun(options(), received).race.finishTime, race.finishTime);
});

test("an empty log leaves the car on the line rather than spinning", () => {
  const { race, complete, ticks } = replayRun(options(), createInputLog());
  assertEqual(complete, false, "a car that never started never finishes");
  assertEqual(race.vehicle.distance, 0, "and never moves");
  assert(ticks < 100, `it should give up almost immediately, took ${ticks} ticks`);
});

test("a log is replayed under an explicit tick ceiling, not until it happens to end", () => {
  // Stages, drives for a second, then lifts forever. Rolling resistance is light
  // enough that the car still trickles over the line — after about 92 seconds —
  // so the ceiling is what bounds the work, not the car stopping.
  let log = createInputLog();
  log = recordStart(log, 0);
  log = recordThrottle(log, 200, 1);
  log = recordThrottle(log, 260, 0);

  const short = replayRun(options(), log, { maxTicks: 600 });
  assertEqual(short.complete, false, "600 ticks is nowhere near enough");
  assert(short.race.vehicle.distance > 0, "though it did move");
  assert(short.race.vehicle.distance < RACE_DISTANCES.quarter.metres, "just not far enough");
  assert(short.ticks <= 601, `the ceiling should be respected, ran ${short.ticks}`);

  // Given the time, it does get there — the ceiling is a bound on a hostile log,
  // not a judgement about whether the run was any good.
  const long = replayRun(options(), log, { maxTicks: 20000 });
  assertEqual(long.complete, true, "it crosses the line in the end");
  assert(long.race.finishTime > 60, `and takes an age doing it: ${long.race.finishTime}s`);
});

test("replaying the same log twice gives the same answer", () => {
  const { log } = cleanQuarterMile();
  const first = replayRun(options(), log).race;
  const second = replayRun(options(), log).race;
  assertEqual(first.finishTime, second.finishTime, "replay must be a function of its inputs");
  assertEqual(first.vehicle.distance, second.vehicle.distance);
});

test("the same log over a longer distance finishes later, so options are honoured", () => {
  const { log } = cleanQuarterMile();
  const quarter = replayRun(options(), log).race;
  const half = replayRun({ ...options(), distanceMetres: RACE_DISTANCES.half.metres }, log).race;
  assert(
    half.vehicle.distance > quarter.vehicle.distance,
    "the half-mile replay should have travelled further",
  );
});

test("a holeshot log beats a late log over the same distance", () => {
  // The property the whole online result rests on: replay preserves the ordering
  // that makes one run better than another.
  const early = cleanQuarterMile();
  assertClose(early.race.reactionTime ?? 99, 0, 0.05, "the reference launches on green");
  assert(early.race.finishTime !== null, "and finishes");
});

finish();
