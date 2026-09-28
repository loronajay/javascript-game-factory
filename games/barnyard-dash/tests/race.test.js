import test from "node:test";
import assert from "node:assert/strict";

import { HOP_SPEED, createRace, raceOrder, racerById, retireRacer, stepRace, withRacer } from "../scripts/sim/race.js";
import { DEFAULT_TRACK } from "../scripts/sim/track.js";

const PET = Object.freeze({ speed: 50, strength: 50, size: 1 });
const EMPTY_TRACK = Object.freeze({
  start: Object.freeze({ x: 0, y: 0, angle: 0 }),
  checkpoints: Object.freeze([
    Object.freeze({ x: 20, y: 0, radius: 4 }),
    Object.freeze({ x: 40, y: 0, radius: 4 }),
  ]),
  road: Object.freeze([Object.freeze({ x: 0, y: 0 }), Object.freeze({ x: 45, y: 0 })]),
  roadWidth: 20,
  mud: Object.freeze([]),
  obstacles: Object.freeze([]),
});

const player = (race) => racerById(race, "player");
const rival = (race, index = 1) => racerById(race, `cpu-${index}`);
const setPlayer = (race, patch) => withRacer(race, "player", patch);

function runningRace(track = EMPTY_TRACK) {
  return createRace({ track, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
}

test("a racer only finishes after crossing checkpoints in order", () => {
  let race = createRace({ track: EMPTY_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0, totalLaps: 1 });
  race = setPlayer(race, { x: 40, y: 0 });
  race = stepRace(race, { throttle: true, brake: false, left: false, right: false, jump: false }, 1 / 60);
  assert.equal(player(race).checkpoint, 0);
  assert.equal(player(race).finishedAt, null);

  race = stepRace(setPlayer(race, { x: 20, y: 0 }), {}, 1 / 60);
  assert.equal(player(race).checkpoint, 1);
  race = stepRace(setPlayer(race, { x: 40, y: 0 }), {}, 1 / 60);
  assert.equal(player(race).checkpoint, 2);
  assert.ok(Number.isFinite(player(race).finishedAt));
});

test("a race runs for three laps and only finishes on the last ordered crossing", () => {
  let race = runningRace();
  assert.equal(race.totalLaps, 3);
  assert.equal(player(race).lap, 1);

  for (let lap = 1; lap <= 3; lap += 1) {
    race = stepRace(setPlayer(race, { x: 20, y: 0 }), {}, 1 / 60);
    race = stepRace(setPlayer(race, { x: 40, y: 0 }), {}, 1 / 60);
    if (lap < 3) {
      assert.equal(player(race).lap, lap + 1);
      assert.equal(player(race).checkpoint, 0);
      assert.equal(player(race).finishedAt, null);
    }
  }

  assert.ok(Number.isFinite(player(race).finishedAt));
});

test("swept crossings count checkpoints and obstacle impacts between simulation endpoints", () => {
  const narrowTrack = Object.freeze({
    ...EMPTY_TRACK,
    checkpoints: Object.freeze([Object.freeze({ x: 20, y: 0, radius: 1 })]),
    obstacles: Object.freeze([Object.freeze({ id: "h1", kind: "hurdle", x: 35, y: 0, radius: 1 })]),
  });
  let race = createRace({ track: narrowTrack, playerPet: PET, cpuPets: [], countdownSeconds: 0, totalLaps: 2 });
  race = stepRace(setPlayer(race, { speed: 500 }), {}, 0.05);

  assert.equal(player(race).lap, 2);
  assert.equal(player(race).checkpoint, 0);
  assert.equal(player(race).lastImpact, "hurdle");
  assert.ok(player(race).x < 35);
});

test("a narrow hurdle stops a racer at its visible rail and bounces it back a run-up", () => {
  const hurdleTrack = Object.freeze({
    ...EMPTY_TRACK,
    obstacles: Object.freeze([Object.freeze({
      id: "h1", kind: "hurdle", x: 35, y: 0, length: 44, thickness: 4, angle: Math.PI / 2,
    })]),
  });
  const base = runningRace(hurdleTrack);
  const hit = stepRace(setPlayer(base, { speed: 500 }), {}, 0.05);
  const radius = player(hit).profile.radius;

  assert.equal(player(hit).lastImpact, "hurdle");
  assert.ok(player(hit).x < 35 - radius, "it never passes through the rail");
  assert.ok(player(hit).x > 35 - radius - 2 - 25, `bounced implausibly far, to x=${player(hit).x}`);
});

test("a pet stopped dead in front of a hurdle can always hop it", () => {
  const hurdleTrack = Object.freeze({
    ...EMPTY_TRACK,
    road: Object.freeze([Object.freeze({ x: -100, y: 0 }), Object.freeze({ x: 200, y: 0 })]),
    roadWidth: 60,
    checkpoints: Object.freeze([Object.freeze({ x: 150, y: 0, radius: 4 })]),
    obstacles: Object.freeze([Object.freeze({ id: "h1", kind: "hurdle", x: 35, y: 0, length: 60, thickness: 4, angle: Math.PI / 2 })]),
  });
  let race = createRace({ track: hurdleTrack, playerPet: PET, cpuPets: [], countdownSeconds: 0, totalLaps: 1 });
  race = stepRace(setPlayer(race, { speed: 500 }), {}, 0.05);
  race = setPlayer(race, { speed: 0 });
  race = stepRace(race, { throttle: true, jump: true }, 1 / 60);
  assert.ok(player(race).speed >= HOP_SPEED - 1);
  for (let tick = 0; tick < 90; tick += 1) race = stepRace(race, { throttle: true }, 1 / 60);
  assert.ok(player(race).x > 35, `still stuck behind the hurdle at x=${player(race).x}`);
});

test("throttle and steering are player inputs advanced by a fixed simulation step", () => {
  let race = runningRace();
  for (let tick = 0; tick < 120; tick += 1) race = stepRace(race, { throttle: true, right: true }, 1 / 60);

  assert.ok(player(race).speed > 0);
  assert.ok(player(race).x > 0);
  assert.ok(player(race).angle > 0);
});

test("jump timing clears a low hurdle while staying grounded costs momentum", () => {
  const hurdleTrack = Object.freeze({
    ...EMPTY_TRACK,
    obstacles: Object.freeze([Object.freeze({ id: "h1", kind: "hurdle", x: 7, y: 0, radius: 1.4 })]),
  });
  const base = runningRace(hurdleTrack);
  const moving = { x: 6, y: 0, speed: 120 };

  const grounded = stepRace(setPlayer(base, moving), { throttle: true }, 1 / 60);
  const airborne = stepRace(setPlayer(base, { ...moving, jumpHeight: 1, jumpVelocity: 0 }), { throttle: true }, 1 / 60);

  assert.ok(player(grounded).speed < player(airborne).speed);
  assert.equal(player(grounded).lastImpact, "hurdle");
  assert.notEqual(player(airborne).lastImpact, "hurdle");
});

test("strength preserves more momentum through mud and breakable gates", () => {
  const roughTrack = Object.freeze({
    ...EMPTY_TRACK,
    mud: Object.freeze([Object.freeze({ x: 0, y: 0, width: 30, height: 20 })]),
    obstacles: Object.freeze([Object.freeze({ id: "g1", kind: "gate", x: 7, y: 0, radius: 1.4 })]),
  });
  const weakRace = createRace({ track: roughTrack, playerPet: { ...PET, strength: 0 }, cpuPets: [PET], countdownSeconds: 0 });
  const strongRace = createRace({ track: roughTrack, playerPet: { ...PET, strength: 100 }, cpuPets: [PET], countdownSeconds: 0 });
  const pose = { x: 6, y: 0, speed: 120 };

  const weak = stepRace(setPlayer(weakRace, pose), { throttle: true }, 1 / 60);
  const strong = stepRace(setPlayer(strongRace, pose), { throttle: true }, 1 / 60);

  assert.ok(player(strong).speed > player(weak).speed);
  assert.ok(strong.brokenObstacles.includes("g1"));
});

test("the race supports deterministic fields from 1v1 through eight pets", () => {
  const full = createRace({ track: EMPTY_TRACK, playerPet: PET, cpuPets: Array.from({ length: 9 }, (_, index) => ({ ...PET, name: `CPU ${index}` })), countdownSeconds: 0 });
  assert.equal(full.racers.length, 8, "a field is capped at eight");

  let a = runningRace();
  let b = runningRace();
  for (let tick = 0; tick < 180; tick += 1) {
    a = stepRace(a, {}, 1 / 60);
    b = stepRace(b, {}, 1 / 60);
  }
  assert.deepEqual(a.racers, b.racers);
});

test("people and CPUs are seats keyed by id; a person's controls arrive in a map", () => {
  let race = createRace({
    track: DEFAULT_TRACK,
    entrants: [{ id: "seat-a", pet: PET }, { id: "seat-b", pet: PET }, { id: "cpu-1", pet: PET, cpu: "rookie" }],
    countdownSeconds: 0,
  });
  for (let tick = 0; tick < 60; tick += 1) race = stepRace(race, { "seat-a": { throttle: true } }, 1 / 60);
  assert.ok(racerById(race, "seat-a").speed > 50, "the seat that pressed throttle moves");
  assert.equal(racerById(race, "seat-b").speed, 0, "a seat nobody drives stands still");
  assert.ok(racerById(race, "cpu-1").speed > 0, "a CPU drives itself");
  assert.equal(racerById(race, "seat-a").human, true);
  assert.equal(racerById(race, "cpu-1").human, false);
});

test("grounded racers are separated deterministically instead of ghosting through each other", () => {
  let race = runningRace();
  const sharedPose = { x: 10, y: 0, speed: 0 };
  race = withRacer(setPlayer(race, sharedPose), "cpu-1", sharedPose);
  race = stepRace(race, {}, 1 / 60);
  const distance = Math.hypot(player(race).x - rival(race).x, player(race).y - rival(race).y);

  assert.ok(distance > 0);
  assert.ok(distance >= (player(race).profile.radius + rival(race).profile.radius) * 0.7);
});

test("lap progress controls race order and a CPU can complete the three-lap course", () => {
  let race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
  race = setPlayer(race, { lap: 2, checkpoint: 0 });
  race = withRacer(race, "cpu-1", { lap: 1, checkpoint: DEFAULT_TRACK.checkpoints.length - 1 });
  assert.equal(raceOrder(race)[0].id, "player");

  race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
  for (let tick = 0; tick < 6_000 && rival(race).finishedAt === null; tick += 1) race = stepRace(race, {}, 1 / 60);
  assert.ok(Number.isFinite(rival(race).finishedAt));
});

test("after the first pet finishes, the rest have a window; then the race ends with them unfinished", () => {
  let race = createRace({ track: EMPTY_TRACK, entrants: [{ id: "a", pet: PET }, { id: "b", pet: PET }], countdownSeconds: 0, totalLaps: 1, finishWindowSeconds: 2 });
  race = withRacer(race, "a", { x: 20, y: 0 });
  race = stepRace(race, {}, 1 / 60);
  race = withRacer(race, "a", { x: 40, y: 0 });
  race = stepRace(race, {}, 1 / 60);
  assert.ok(Number.isFinite(racerById(race, "a").finishedAt));
  assert.equal(race.status, "racing");
  for (let tick = 0; tick < 130; tick += 1) race = stepRace(race, {}, 1 / 60);
  assert.equal(race.status, "finished");
  assert.equal(racerById(race, "b").dnf, true);
  assert.deepEqual(raceOrder(race).map(({ id }) => id), ["a", "b"]);
});

test("a retired seat is out of the race and never holds it open", () => {
  let race = createRace({ track: EMPTY_TRACK, entrants: [{ id: "a", pet: PET }, { id: "b", pet: PET }], countdownSeconds: 0, totalLaps: 1 });
  race = retireRacer(race, "b");
  assert.equal(racerById(race, "b").dnf, true);
  race = retireRacer(race, "a");
  assert.equal(race.status, "finished");
});

test("a full varied CPU field at every level completes the original course", () => {
  const cpuPets = Array.from({ length: 7 }, (_, index) => ({
    ...PET,
    name: `CPU ${index + 1}`,
    speed: 35 + index * 9,
    strength: index * 16,
    size: 0.7 + index * 0.06,
  }));
  for (const level of ["rookie", "pro", "champion"]) {
    let race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets, cpuLevel: level, countdownSeconds: 0, finishWindowSeconds: 300 });
    race = retireRacer(race, "player");
    for (let tick = 0; tick < 12_000 && race.status !== "finished"; tick += 1) race = stepRace(race, {}, 1 / 60);
    assert.deepEqual(race.racers.filter((entry) => entry.cpu && entry.finishedAt === null).map(({ id }) => id), [], level);
  }
});
