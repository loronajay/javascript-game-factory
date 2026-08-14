import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, finish } from "./harness.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

import { DEFAULT_CAR, RACE_DISTANCES, TICK_SECONDS } from "../scripts/sim/constants.js";
import { GATE_6_SPEED, createGate } from "../scripts/sim/gate.js";
import { FINISHED, STAGING, createRace, startRace, stepRace, topGear } from "../scripts/sim/race.js";
import {
  EVENT_START,
  createPlayhead,
  rebaseToStart,
  replayRun,
  stepPlayhead,
} from "../scripts/sim/input-log.js";
import { driveRace, createProfile, DEFAULT_PROFILE } from "../scripts/rival/cpu-driver.js";
import { RIVALS, DEFAULT_RIVAL_ID, rivalById, rivalPortraitSrc, rivalThumbSrc, rivalCardSrc, rivalFullName } from "../scripts/rival/rivals.js";
import { modelById } from "../scripts/assets/car-atlas.js";
import { createGhost, GHOST_EVENT_CEILING } from "../scripts/rival/ghost.js";
import {
  GHOST_ID,
  KIND_CPU,
  KIND_GHOST,
  TONE_LOSS,
  TONE_WIN,
  buildRival,
  lineupEntry,
  lineupFor,
  rivalOutcome,
  rivalSummary,
} from "../scripts/rival/lineup.js";
import { boardIdFor } from "../scripts/records/records.js";
import { MODE_DISTANCE, MODE_RIVAL, boardModeId } from "../scripts/sim/modes.js";

suite("rival — CPU drivers, ghosts, and the car in the other lane");

const gate = createGate(GATE_6_SPEED);
const quarterMile = {
  car: DEFAULT_CAR,
  gate,
  distanceMetres: RACE_DISTANCES.quarter.metres,
  timeLimitSeconds: null,
  countdownSeconds: 3,
};

/** Drives a whole tier and reports what it achieved, over enough seeds to mean something. */
function sweep(profile, seeds = 40) {
  const times = [];
  const grades = { perfect: 0, good: 0, poor: 0, missed: 0 };
  for (let seed = 1; seed <= seeds; seed += 1) {
    const { race, complete } = driveRace(quarterMile, profile, seed);
    assert(complete, `seed ${seed} never reached the line`);
    times.push(race.finishTime);
    for (const shift of race.shifts) grades[shift.grade] += 1;
  }
  return { times, grades, mean: times.reduce((a, b) => a + b, 0) / times.length };
}

// ---------------------------------------------------------------------------
// The playhead — one definition of a tick, shared by replay and by a rival
// ---------------------------------------------------------------------------

test("stepping a playhead to the end matches replaying the log in one go", () => {
  // The whole reason the playhead exists: a rival is stepped one tick per frame
  // alongside the player's race, and if that disagreed with the batch replay by
  // so much as a tick, the server would adjudicate a different run from the one
  // the player watched.
  const { log } = driveRace(quarterMile, RIVALS[2].profile, 9);
  const batch = replayRun(quarterMile, log);

  let head = createPlayhead(quarterMile, log);
  let ticks = 0;
  while (head.race.phase !== FINISHED && ticks < 5000) {
    head = stepPlayhead(head);
    ticks += 1;
  }
  assertEqual(head.race.phase, FINISHED);
  assertEqual(head.race.finishTime, batch.race.finishTime);
  assertEqual(ticks, batch.ticks);
  assertEqual(head.tick, batch.ticks);
});

test("a playhead counts exactly one tick per step", () => {
  // The invariant the log format rests on. `init-game.js` increments `raceTick`
  // beside its own `stepRace`, and a playhead that counted differently would put
  // the two cars on different clocks.
  let head = createPlayhead(quarterMile, { events: [] });
  for (let i = 1; i <= 20; i += 1) {
    head = stepPlayhead(head);
    assertEqual(head.tick, i);
  }
});

test("rebasing moves the start to tick zero and drops what came before it", () => {
  // A recorded log carries the tick the driver happened to stage on, which is
  // however long they sat reading the screen. Raw, a ghost would idle on the
  // line for that long after the tree went green.
  const raw = { events: [{ t: 4, k: "t", v: 1 }, { t: 90, k: EVENT_START, v: 0 }, { t: 96, k: "t", v: 1 }] };
  const rebased = rebaseToStart(raw);
  assertEqual(rebased.events[0].t, 0);
  assertEqual(rebased.events[0].k, EVENT_START);
  assertEqual(rebased.events[1].t, 6);
  assertEqual(rebased.events.length, 2, "inputs made before staging are not part of the run");
});

test("a log that already starts at zero is left exactly as it is", () => {
  const raw = { events: [{ t: 0, k: EVENT_START, v: 0 }, { t: 12, k: "t", v: 1 }] };
  assertEqual(JSON.stringify(rebaseToStart(raw).events), JSON.stringify(raw.events));
});

test("a rebased ghost runs the same race it originally ran", () => {
  // The ghost has to be the run it claims to be. Shifting every tick by the same
  // amount cannot change what the inputs achieved, and this is what proves the
  // rebase did not quietly reorder or drop one.
  const { log, race } = driveRace(quarterMile, RIVALS[3].profile, 21);
  const delayed = { events: log.events.map((event) => ({ ...event, t: event.t + 137 })) };
  const replayed = replayRun(quarterMile, rebaseToStart(delayed));
  assertEqual(replayed.race.finishTime, race.finishTime);
});

// ---------------------------------------------------------------------------
// The CPU driver
// ---------------------------------------------------------------------------

test("the same seed drives the same run, every time", () => {
  // A rival has to be reproducible or a difficulty tier cannot be asserted at
  // all — and `sim/` has no randomness in it precisely so a log means one run.
  const a = driveRace(quarterMile, RIVALS[1].profile, 5);
  const b = driveRace(quarterMile, RIVALS[1].profile, 5);
  assertEqual(a.race.finishTime, b.race.finishTime);
  assertEqual(JSON.stringify(a.log.events), JSON.stringify(b.log.events));
});

test("a different seed is a different run by the same driver", () => {
  // RUN IT AGAIN has to produce a fresh attempt. A rival who makes identical
  // mistakes every time stops being a driver and becomes a stopwatch.
  const times = new Set();
  for (let seed = 1; seed <= 8; seed += 1) {
    times.add(driveRace(quarterMile, RIVALS[1].profile, seed).race.finishTime);
  }
  assert(times.size > 1, "every seed produced the same run");
});

test("a generated log replays to the run that generated it", () => {
  // The log is the only thing handed downstream, so if it did not reproduce the
  // race the generator watched, the car drawn on screen would be a different one
  // from the car whose time is reported.
  for (const rival of RIVALS) {
    const { log, race } = driveRace(quarterMile, rival.profile, 3);
    assertEqual(replayRun(quarterMile, log).race.finishTime, race.finishTime, `${rival.id} does not replay`);
  }
});

test("the roster runs strictly faster as it gets harder", () => {
  // The tiers have to be a ladder rather than five variations. Measured on the
  // mean over forty seeds, because one seed is a run and the tier is a driver.
  const means = RIVALS.map((rival) => sweep(rival.profile).mean);
  for (let i = 1; i < means.length; i += 1) {
    assert(
      means[i] < means[i - 1],
      `${RIVALS[i].id} (${means[i].toFixed(3)}s) is not faster than ${RIVALS[i - 1].id} (${means[i - 1].toFixed(3)}s)`,
    );
  }
});

test("even the hardest rival is beatable by a perfect human run", () => {
  // A perfect quarter mile is 12.04s. A rival nobody can beat is not a
  // difficulty setting, it is a wall — and the whole point of racing one is that
  // the gap is made of things the player can name and then do better.
  const hardest = sweep(RIVALS[RIVALS.length - 1].profile);
  assert(Math.min(...hardest.times) > 12.04, "the top rival drives better than a flawless run");
  assert(hardest.mean < 13.0, "…but it should still be genuinely hard");
});

test("the easiest rival shifts badly rather than driving a slower car", () => {
  // Difficulty is looser hands, never a worse spec. That is what keeps a loss
  // legible: you were out-driven at something you can see yourself doing.
  const rookie = sweep(RIVALS[0].profile);
  assert(rookie.grades.poor > rookie.grades.perfect, "the rookie is not making the mistakes it is meant to");
  const demon = sweep(RIVALS[RIVALS.length - 1].profile);
  assertEqual(demon.grades.poor, 0);
  assert(demon.grades.perfect > 0);
});

test("a rival never lands in the wrong gear", () => {
  // The driver walks the gate's own shortest path, so a missed shift would mean
  // the traversal disagrees with the graph — a real bug rather than a mistake
  // the difficulty model is entitled to make.
  for (const rival of RIVALS) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const { race } = driveRace(quarterMile, rival.profile, seed);
      assertEqual(race.shifts.filter((shift) => shift.grade === "missed").length, 0, `${rival.id} money-shifted`);
    }
  }
});

test("a rival reaches top gear on a long enough run", () => {
  const mile = { ...quarterMile, distanceMetres: RACE_DISTANCES.mile.metres };
  const { race } = driveRace(mile, RIVALS[4].profile, 4);
  assertEqual(race.vehicle.gear, topGear(DEFAULT_CAR));
});

test("a rival never touches the throttle before the green", () => {
  // The tiers are deliberately tuned clear of a foul: a red light bogs the car
  // to 13.35s, which would make a rookie whose mean is 15.3s *faster* for having
  // made a mistake. The capability stays in the driver; the roster does not use it.
  for (const rival of RIVALS) {
    for (let seed = 1; seed <= 15; seed += 1) {
      assertEqual(driveRace(quarterMile, rival.profile, seed).race.falseStart, false, `${rival.id} red-lit`);
    }
  }
});

test("a driver who is told to jump the light does", () => {
  const jumpy = createProfile({ reactionSeconds: -0.4, reactionJitter: 0 });
  const { race } = driveRace(quarterMile, jumpy, 1);
  assertEqual(race.falseStart, true);
  assertEqual(race.launchGrade, "foul");
});

test("a profile is the default with the given fields laid over it", () => {
  const profile = createProfile({ gateTicks: 3 });
  assertEqual(profile.gateTicks, 3);
  assertEqual(profile.reactionSeconds, DEFAULT_PROFILE.reactionSeconds);
});

test("a rival races the options it is given and cannot be handed better ones", () => {
  // The generator steps the same `stepRace` the player's race does, with the
  // player's own options object. There is no path by which a rival could be
  // given a different car, so it is bound by the same physics by construction.
  const shortRun = { ...quarterMile, distanceMetres: RACE_DISTANCES.eighth.metres };
  const { race } = driveRace(shortRun, RIVALS[2].profile, 1);
  assert(race.vehicle.distance >= RACE_DISTANCES.eighth.metres);
  assert(race.finishTime < driveRace(quarterMile, RIVALS[2].profile, 1).race.finishTime);
});

// ---------------------------------------------------------------------------
// Ghosts
// ---------------------------------------------------------------------------

test("a ghost needs a board, a value and at least one input", () => {
  const events = [{ t: 0, k: EVENT_START, v: 0 }];
  assert(createGhost({ boardId: "distance:quarter", value: 12000, events }));
  assertEqual(createGhost({ value: 12000, events }), null);
  assertEqual(createGhost({ boardId: "distance:quarter", events }), null);
  assertEqual(createGhost({ boardId: "distance:quarter", value: 12000, events: [] }), null);
});

test("a malformed ghost is no ghost rather than an exception mid-setup", () => {
  // It comes off disk, written by some older build. Nothing that arrives from
  // there may be able to break the setup screen.
  assertEqual(createGhost(null), null);
  assertEqual(createGhost({ boardId: "distance:quarter", value: "fast", events: [{ t: 0, k: "s" }] }), null);
  const partial = createGhost({
    boardId: "distance:quarter",
    value: 12000,
    events: [{ t: -1, k: "s" }, { t: 3, k: "nonsense" }, { t: 5, k: "t", v: 1 }],
  });
  assertEqual(partial.events.length, 1, "bad events are dropped, good ones survive");
  assertEqual(partial.modelId, "", "a ghost with no car still races, on a fallback");
});

test("a ghost carries the car that set the time", () => {
  const ghost = createGhost({
    boardId: "distance:quarter",
    value: 12000,
    modelId: "toro-sv",
    livery: { paint: { hue: 200, saturation: 0.6 } },
    events: [{ t: 0, k: EVENT_START, v: 0 }],
  });
  assertEqual(ghost.modelId, "toro-sv");
  assert(ghost.livery, "a ghost wearing the player's current paint reads as a second copy of them");
});

test("the event ceiling is far past any real run", () => {
  const { log } = driveRace({ ...quarterMile, distanceMetres: RACE_DISTANCES.mile.metres }, RIVALS[0].profile, 1);
  assert(log.events.length < GHOST_EVENT_CEILING / 100, "the ceiling is a guard, not a budget");
});

// ---------------------------------------------------------------------------
// The lineup
// ---------------------------------------------------------------------------

test("with no ghost the lineup is the roster", () => {
  const lineup = lineupFor("distance:quarter", null);
  assertEqual(lineup.length, RIVALS.length);
  assert(lineup.every((entry) => entry.kind === KIND_CPU));
});

test("a ghost for this board heads the lineup", () => {
  // The run a player most wants to beat is their own last one, so it costs no
  // cursor movement to get to.
  const ghost = createGhost({ boardId: "distance:quarter", value: 12345, events: [{ t: 0, k: "s" }] });
  const lineup = lineupFor("distance:quarter", ghost);
  assertEqual(lineup[0].id, GHOST_ID);
  assertEqual(lineup[0].kind, KIND_GHOST);
  assert(lineup[0].blurb.includes("12.345s"), "the ghost should say what time it is defending");
});

test("a ghost belonging to another board is not offered", () => {
  const ghost = createGhost({ boardId: "distance:quarter", value: 12345, events: [{ t: 0, k: "s" }] });
  assertEqual(lineupFor("distance:mile", ghost).length, RIVALS.length);
  assertEqual(lineupFor(null, ghost).length, RIVALS.length);
});

test("a stale rival id falls back to somebody real", () => {
  const lineup = lineupFor("distance:quarter", null);
  assertEqual(lineupEntry(lineup, GHOST_ID).id, DEFAULT_RIVAL_ID);
  assertEqual(lineupEntry(lineup, "nobody").id, DEFAULT_RIVAL_ID);
  assertEqual(lineupEntry([], "anything"), null);
});

test("building a CPU rival and building a ghost produce the same kind of thing", () => {
  // The point of the seam. Nothing downstream asks which it got.
  const cpu = buildRival(lineupFor("distance:quarter", null)[0], quarterMile, 1);
  const { log } = driveRace(quarterMile, RIVALS[0].profile, 7);
  const ghost = createGhost({ boardId: "distance:quarter", value: 12345, events: log.events });
  const built = buildRival(lineupFor("distance:quarter", ghost)[0], quarterMile, 1);

  for (const rival of [cpu, built]) {
    assert(Array.isArray(rival.log.events), "both must come out as a log");
    assert(replayRun(quarterMile, rival.log).race.phase === FINISHED, "both must be raceable");
  }
});

test("a built ghost replays to the time it is defending", () => {
  const { log, race } = driveRace(quarterMile, RIVALS[2].profile, 11);
  const ghost = createGhost({
    boardId: "distance:quarter",
    value: Math.round(race.finishTime * 1000),
    events: log.events,
  });
  const built = buildRival(lineupFor("distance:quarter", ghost)[0], quarterMile, 1);
  assertEqual(Math.round(replayRun(quarterMile, built.log).race.finishTime * 1000), ghost.value);
});

test("every rival names a car that exists and a portrait file that is really there", () => {
  // The portrait slug is `firstname-lastname-nickname`, and it is carried on the
  // row rather than rebuilt from the name fields — a nickname that happens to
  // match a surname (Kuroda) would otherwise produce the wrong path.
  for (const rival of RIVALS) {
    assert(rivalById(rival.id), `${rival.id} cannot be looked up`);
    assert(modelById(rival.modelId), `${rival.id} drives a car that is not in the atlas`);
    const src = rivalPortraitSrc(rival);
    assertEqual(src, `assets/characters/${rival.portrait}`);
    assert(fs.existsSync(path.join(gameRoot, src)), `${rival.id}'s portrait is missing: ${src}`);
    // …and the two sizes the game actually loads, which are named for the **id**
    // rather than the slug so a path can be built without consulting the roster.
    // The `rival-` prefix keeps them from colliding with an avatar in a cache
    // keyed by path.
    for (const derived of [rivalThumbSrc(rival), rivalCardSrc(rival)]) {
      assert(derived.includes(`rival-${rival.id}.jpg`), `${rival.id}'s derived face is misnamed: ${derived}`);
      assert(fs.existsSync(path.join(gameRoot, derived)), `${rival.id} is missing ${derived}`);
    }
    assertEqual(rivalFullName(rival), `${rival.first} "${rival.name}" ${rival.last}`);
  }
  assertEqual(new Set(RIVALS.map((r) => r.id)).size, RIVALS.length, "duplicate rival ids");
  assertEqual(new Set(RIVALS.map((r) => r.portrait)).size, RIVALS.length, "two rivals share a portrait");
  assertEqual(new Set(RIVALS.map((r) => r.modelId)).size, RIVALS.length, "two rivals share a car");
});

// ---------------------------------------------------------------------------
// Who won
// ---------------------------------------------------------------------------

const finishedAt = (seconds) => ({ timeLimitSeconds: null, finishTime: seconds, vehicle: { distance: 0 } });

test("a distance race is decided on the clock, in the right direction", () => {
  const win = rivalOutcome(finishedAt(12.0), finishedAt(12.5));
  assertEqual(win.won, true);
  assertEqual(Number(win.margin.toFixed(3)), 0.5);
  assertEqual(rivalOutcome(finishedAt(12.9), finishedAt(12.5)).won, false);
  assertEqual(rivalOutcome(finishedAt(12.5), finishedAt(12.5)).drew, true);
});

test("a time attack is decided on ground covered, which is the other direction", () => {
  const mine = { timeLimitSeconds: 60, finishTime: 60, vehicle: { distance: 1400 } };
  const theirs = { timeLimitSeconds: 60, finishTime: 60, vehicle: { distance: 1200 } };
  const outcome = rivalOutcome(mine, theirs);
  assertEqual(outcome.won, true);
  assertEqual(outcome.timed, true);
  assertEqual(outcome.margin, 200);
});

test("nobody has won while either car is still driving", () => {
  assertEqual(rivalOutcome(finishedAt(12.0), { timeLimitSeconds: null, finishTime: null, vehicle: {} }), null);
  assertEqual(rivalOutcome(null, finishedAt(12.0)), null);
});

test("the verdict names the rival and signs the margin toward better", () => {
  const entry = lineupFor("distance:quarter", null)[4];
  const won = rivalSummary(rivalOutcome(finishedAt(12.0), finishedAt(12.4)), entry);
  assertEqual(won.caption, `BEAT ${entry.name.toUpperCase()}`);
  assertEqual(won.detail, "-0.400s");
  assertEqual(won.tone, TONE_WIN);

  const lost = rivalSummary(rivalOutcome(finishedAt(12.4), finishedAt(12.0)), entry);
  assertEqual(lost.caption, `LOST TO ${entry.name.toUpperCase()}`);
  assertEqual(lost.detail, "+0.400s");
  assertEqual(lost.tone, TONE_LOSS);

  assertEqual(rivalSummary(null, entry), null);
  assertEqual(rivalSummary(rivalOutcome(finishedAt(12.0), finishedAt(12.4)), null), null);
});

// ---------------------------------------------------------------------------
// Where a rival run files its time
// ---------------------------------------------------------------------------

test("a rival run files to the distance boards it borrows", () => {
  // The other car is in the other lane and the sim has no lateral axis for it to
  // reach across, so the run is physically a solo distance run. Boards of its
  // own would split one ladder and break the loop the mode exists for.
  assertEqual(boardModeId(MODE_RIVAL), MODE_DISTANCE);
  for (const objectiveId of ["eighth", "quarter", "half", "mile"]) {
    assertEqual(boardIdFor(MODE_RIVAL, objectiveId), boardIdFor(MODE_DISTANCE, objectiveId));
  }
});

test("a mode that borrows no boards still files to its own", () => {
  assertEqual(boardModeId(MODE_DISTANCE), MODE_DISTANCE);
  assertEqual(boardIdFor(MODE_DISTANCE, "quarter"), "distance:quarter");
});

// ---------------------------------------------------------------------------
// Lockstep with the player's race
// ---------------------------------------------------------------------------

test("a rival stepped alongside a driven race stays on the same clock", () => {
  // How `init-game.js` runs it: one `stepPlayhead` per `stepRace`, starting the
  // tick the player's race leaves staging. Both trees have to light together or
  // every reaction time in the race means something different.
  const built = buildRival(lineupFor("distance:quarter", null)[2], quarterMile, 3);
  let head = createPlayhead(quarterMile, built.log);
  let mine = startRace(createRace(quarterMile));

  for (let tick = 0; tick < 2000 && mine.phase !== FINISHED; tick += 1) {
    mine = stepRace(mine, { throttle: 1 }, TICK_SECONDS);
    head = stepPlayhead(head);
    assertEqual(head.race.countdown, mine.countdown, `the trees diverged on tick ${tick}`);
  }
  assert(mine.phase === FINISHED);
});

test("a rival does not move while the player is still staging", () => {
  // Staging is the player sitting on the line for as long as they like. A rival
  // that ran during it would have driven off before the tree was lit.
  const built = buildRival(lineupFor("distance:quarter", null)[0], quarterMile, 1);
  let head = createPlayhead(quarterMile, built.log);
  const mine = createRace(quarterMile);
  assertEqual(mine.phase, STAGING);
  // The gate `init-game.js` applies, asserted as the rule it is rather than by
  // stepping: nothing advances while the player's race has not left staging.
  const rivalRuns = mine.phase !== STAGING;
  assertEqual(rivalRuns, false);
  assertEqual(head.tick, 0);
});

finish();
