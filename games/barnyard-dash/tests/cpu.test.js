import test from "node:test";
import assert from "node:assert/strict";

import { CPU_KNOBS, cpuControls } from "../scripts/sim/cpu.js";
import { COURSES, findCourse } from "../scripts/sim/courses.js";
import { createRace, stepRace } from "../scripts/sim/race.js";
import { CPU_LEVEL_IDS } from "../../pet-games/shared/sim/levels.js";

const PET = Object.freeze({ speed: 60, strength: 60, size: 1 });

test("every shared CPU level has hands in this event", () => {
  assert.deepEqual(Object.keys(CPU_KNOBS).sort(), [...CPU_LEVEL_IDS].sort());
});

test("an off-road CPU steers back toward the course even when its checkpoint would pull it farther out", () => {
  const track = {
    start: { x: 0, y: 0, angle: 0 },
    roadWidth: 20,
    road: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    checkpoints: [{ x: 100, y: 100, radius: 5 }],
    obstacles: [],
    mud: [],
  };
  const controls = cpuControls({
    id: "cpu-test", x: 50, y: 30, angle: 0, speed: 80, lap: 1, checkpoint: 0, lastImpact: null,
    profile: { radius: 12, gatePower: 0.65, speedMultiplier: 1 },
  }, track);

  assert.equal(controls.left, true);
  assert.equal(controls.right, false);
});

test("a CPU too slow to smash a gate chooses a deterministic route around an end", () => {
  const track = {
    start: { x: 0, y: 0, angle: 0 },
    roadWidth: 40,
    road: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    checkpoints: [{ x: 100, y: 0, radius: 5 }],
    obstacles: [{ id: "gate", kind: "gate", x: 35, y: 0, length: 28, thickness: 4, angle: Math.PI / 2 }],
    mud: [],
  };
  const racer = {
    id: "cpu-test", x: 25, y: 0, angle: 0, speed: 50, lap: 1, checkpoint: 0, lastImpact: "gate", jumpHeight: 0, jumpHeld: false,
    profile: { radius: 5, gatePower: 0.65, speedMultiplier: 1 },
  };
  const first = cpuControls(racer, track, [], { level: "champion" });
  assert.notEqual(first.left, first.right);
  assert.equal(first.throttle, true);
  assert.deepEqual(cpuControls(racer, track, [], { level: "champion" }), first, "the same moment gives the same answer");
});

test("CPU hands are deterministic: the same seed replays the same race", () => {
  const course = findCourse("orchard-esses");
  const run = () => {
    let race = createRace({ track: course.track, entrants: [0, 1, 2].map((index) => ({ id: `c${index}`, pet: PET, cpu: "pro" })), countdownSeconds: 0, seed: 7 });
    for (let tick = 0; tick < 1200; tick += 1) race = stepRace(race, {}, 1 / 60);
    return JSON.stringify(race.racers.map(({ x, y, lap, checkpoint }) => [x, y, lap, checkpoint]));
  };
  assert.equal(run(), run());
});

function medianFinish(course, level) {
  const times = [];
  for (const seed of [1, 2]) {
    let race = createRace({
      track: course.track,
      entrants: [0, 1, 2].map((index) => ({ id: `c${index}`, pet: PET, cpu: level })),
      countdownSeconds: 0,
      totalLaps: course.laps,
      seed,
      finishWindowSeconds: 300,
    });
    while (race.status !== "finished") race = stepRace(race, {}, 1 / 60);
    for (const racer of race.racers) {
      assert.ok(Number.isFinite(racer.finishedAt), `${level} ${racer.id} did not finish ${course.id}`);
      times.push(racer.finishedAt);
    }
  }
  times.sort((left, right) => left - right);
  return times[times.length >> 1];
}

test("on every course every level finishes, and Rookie is slower than Champion", () => {
  for (const course of COURSES) {
    const rookie = medianFinish(course, "rookie");
    const champion = medianFinish(course, "champion");
    assert.ok(rookie > champion * 1.05, `${course.id}: rookie ${rookie.toFixed(1)}s vs champion ${champion.toFixed(1)}s`);
  }
});
