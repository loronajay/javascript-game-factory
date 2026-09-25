import test from "node:test";
import assert from "node:assert/strict";

import { createRace, raceOrder, stepRace } from "../scripts/race.js";

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

function runningRace(track = EMPTY_TRACK) {
  return createRace({ track, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
}

test("a racer only finishes after crossing checkpoints in order", () => {
  let race = createRace({ track: EMPTY_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0, totalLaps: 1 });
  race = { ...race, player: { ...race.player, x: 40, y: 0 } };
  race = stepRace(race, { throttle: true, brake: false, left: false, right: false, jump: false }, 1 / 60);
  assert.equal(race.player.checkpoint, 0);
  assert.equal(race.player.finishedAt, null);

  race = { ...race, player: { ...race.player, x: 20, y: 0 } };
  race = stepRace(race, {}, 1 / 60);
  assert.equal(race.player.checkpoint, 1);
  race = { ...race, player: { ...race.player, x: 40, y: 0 } };
  race = stepRace(race, {}, 1 / 60);
  assert.equal(race.player.checkpoint, 2);
  assert.ok(Number.isFinite(race.player.finishedAt));
});

test("a race runs for three laps and only finishes on the last ordered crossing", () => {
  let race = runningRace();
  assert.equal(race.totalLaps, 3);
  assert.equal(race.player.lap, 1);

  for (let lap = 1; lap <= 3; lap += 1) {
    race = { ...race, player: { ...race.player, x: 20, y: 0 } };
    race = stepRace(race, {}, 1 / 60);
    race = { ...race, player: { ...race.player, x: 40, y: 0 } };
    race = stepRace(race, {}, 1 / 60);

    if (lap < 3) {
      assert.equal(race.player.lap, lap + 1);
      assert.equal(race.player.checkpoint, 0);
      assert.equal(race.player.finishedAt, null);
    }
  }

  assert.ok(Number.isFinite(race.player.finishedAt));
});

test("swept crossings count checkpoints and obstacle impacts between simulation endpoints", () => {
  const narrowTrack = Object.freeze({
    ...EMPTY_TRACK,
    checkpoints: Object.freeze([Object.freeze({ x: 20, y: 0, radius: 1 })]),
    obstacles: Object.freeze([Object.freeze({ id: "h1", kind: "hurdle", x: 35, y: 0, radius: 1 })]),
  });
  let race = createRace({ track: narrowTrack, playerPet: PET, cpuPets: [], countdownSeconds: 0, totalLaps: 2 });
  race = { ...race, player: { ...race.player, speed: 500 } };
  race = stepRace(race, {}, 0.05);

  assert.equal(race.player.lap, 2);
  assert.equal(race.player.checkpoint, 0);
  assert.equal(race.player.lastImpact, "hurdle");
  assert.ok(race.player.x < 35);
});

test("a narrow hurdle stops racers at its visible rail instead of an oversized collision bubble", () => {
  const hurdleTrack = Object.freeze({
    ...EMPTY_TRACK,
    obstacles: Object.freeze([Object.freeze({
      id: "h1", kind: "hurdle", x: 35, y: 0, length: 44, thickness: 4, angle: Math.PI / 2,
    })]),
  });
  const base = runningRace(hurdleTrack);
  const hit = stepRace({ ...base, player: { ...base.player, speed: 500 } }, {}, 0.05);

  assert.equal(hit.player.lastImpact, "hurdle");
  assert.ok(hit.player.x >= 20, `stopped too early at x=${hit.player.x}`);
});

test("throttle and steering are player inputs advanced by a fixed simulation step", () => {
  let race = runningRace();
  for (let tick = 0; tick < 120; tick += 1) {
    race = stepRace(race, { throttle: true, right: true }, 1 / 60);
  }

  assert.ok(race.player.speed > 0);
  assert.ok(race.player.x > 0);
  assert.ok(race.player.angle > 0);
});

test("jump timing clears a low hurdle while staying grounded costs momentum", () => {
  const hurdleTrack = Object.freeze({
    ...EMPTY_TRACK,
    obstacles: Object.freeze([Object.freeze({ id: "h1", kind: "hurdle", x: 7, y: 0, radius: 1.4 })]),
  });
  const base = runningRace(hurdleTrack);
  const moving = { ...base.player, x: 6, y: 0, speed: 120 };

  const grounded = stepRace({ ...base, player: moving }, { throttle: true }, 1 / 60);
  const airborne = stepRace({ ...base, player: { ...moving, jumpHeight: 1, jumpVelocity: 0 } }, { throttle: true }, 1 / 60);

  assert.ok(grounded.player.speed < airborne.player.speed);
  assert.equal(grounded.player.lastImpact, "hurdle");
  assert.notEqual(airborne.player.lastImpact, "hurdle");
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

  const weak = stepRace({ ...weakRace, player: { ...weakRace.player, ...pose } }, { throttle: true }, 1 / 60);
  const strong = stepRace({ ...strongRace, player: { ...strongRace.player, ...pose } }, { throttle: true }, 1 / 60);

  assert.ok(strong.player.speed > weak.player.speed);
  assert.ok(strong.brokenObstacles.includes("g1"));
});

test("the race supports deterministic fields from 1v1 through eight pets", () => {
  const full = createRace({ track: EMPTY_TRACK, playerPet: PET, cpuPets: Array.from({ length: 7 }, (_, index) => ({ ...PET, name: `CPU ${index}` })), countdownSeconds: 0 });
  assert.equal(full.rivals.length, 7);
  assert.equal(full.racers.length, 8);

  let a = runningRace();
  let b = runningRace();
  for (let tick = 0; tick < 180; tick += 1) {
    a = stepRace(a, {}, 1 / 60);
    b = stepRace(b, {}, 1 / 60);
  }

  assert.deepEqual(a.rivals, b.rivals);
  assert.ok(a.rivals[0].x > 0 || a.rivals[0].y !== 22);
});

test("grounded racers are separated deterministically instead of ghosting through each other", () => {
  const base = runningRace();
  const sharedPose = { x: 10, y: 0, speed: 0 };
  const race = stepRace({
    ...base,
    player: { ...base.player, ...sharedPose },
    rivals: [{ ...base.rivals[0], ...sharedPose }],
  }, {}, 1 / 60);
  const distance = Math.hypot(race.player.x - race.rivals[0].x, race.player.y - race.rivals[0].y);

  assert.ok(distance > 0);
  assert.ok(distance >= (race.player.profile.radius + race.rivals[0].profile.radius) * 0.7);
});

test("lap progress controls race order and a CPU can complete the revised three-lap course", async () => {
  const { DEFAULT_TRACK } = await import("../scripts/track.js");
  let race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
  race = {
    ...race,
    player: { ...race.player, lap: 2, checkpoint: 0 },
    rivals: [{ ...race.rivals[0], lap: 1, checkpoint: DEFAULT_TRACK.checkpoints.length - 1 }],
  };
  race = { ...race, racers: [race.player, ...race.rivals] };
  assert.equal(raceOrder(race)[0].id, "player");

  race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets: [PET], countdownSeconds: 0 });
  for (let tick = 0; tick < 4_000 && race.rivals[0].finishedAt === null; tick += 1) {
    race = stepRace(race, {}, 1 / 60);
  }
  assert.ok(Number.isFinite(race.rivals[0].finishedAt));
});

test("a full varied CPU field recovers from fences and completes the course", async () => {
  const { DEFAULT_TRACK } = await import("../scripts/track.js");
  const cpuPets = Array.from({ length: 7 }, (_, index) => ({
    ...PET,
    name: `CPU ${index + 1}`,
    speed: 35 + index * 9,
    strength: index * 16,
    size: 0.7 + index * 0.06,
  }));
  let race = createRace({ track: DEFAULT_TRACK, playerPet: PET, cpuPets, countdownSeconds: 0 });

  for (let tick = 0; tick < 9_000 && race.rivals.some(({ finishedAt }) => finishedAt === null); tick += 1) {
    race = stepRace(race, {}, 1 / 60);
  }

  assert.deepEqual(race.rivals.filter(({ finishedAt }) => finishedAt === null).map(({ id }) => id), []);
});
