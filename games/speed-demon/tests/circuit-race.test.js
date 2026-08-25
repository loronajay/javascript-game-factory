import { suite, test, assert, assertEqual, assertDeepEqual, assertClose, finish } from "./harness.js";
import fs from "node:fs";
import { createLivery } from "../scripts/garage/livery.js";
import { hasCircuitAtlas } from "../scripts/circuit/assets.js";
import { vehicleFootprintPoints, createRoadMask } from "../scripts/circuit/road-mask.js";
import { createVehicle, stepVehicle } from "../scripts/circuit/vehicle.js";
import { forwardVector } from "../scripts/circuit/vehicle.js";
import { resolveVehicleCollision } from "../scripts/circuit/vehicle-collision.js";
import { circuitHudView } from "../scripts/ui/circuit-hud.js";
import { circuitTrackById } from "../scripts/circuit/tracks.js";
import {
  createCircuitRace,
  inputCircuitRace,
  stepCircuitRace,
  circuitRaceResult,
  STATUS_COUNTDOWN,
  STATUS_RACING,
  STATUS_FINISHED,
} from "../scripts/circuit/race.js";
import { createCircuitAdapter } from "../scripts/runtime/circuit-adapter.js";
import { createRuntimeRegistry } from "../scripts/runtime/registry.js";
import { circuitDepthOrder, createCircuitView } from "../scripts/circuit/renderer.js";
import {
  CIRCUIT_DIFFICULTIES,
  DEFAULT_CIRCUIT_DIFFICULTY_ID,
  circuitDifficultyById,
} from "../scripts/circuit/difficulty.js";

suite("circuit race — shared deterministic runtime");

const circuitGolden = JSON.parse(fs.readFileSync(new URL("./fixtures/circuit-golden.json", import.meta.url), "utf8"));

const checkpoints = [
  { x: 0, y: 0, radius: 12 },
  { x: 100, y: 0, radius: 12 },
  { x: 100, y: 100, radius: 12 },
  { x: 0, y: 100, radius: 12 },
];

function definition(sourceKind = "freeplay", participants = null) {
  return {
    runtime: "circuit",
    modeId: "circuit",
    trackId: "test-loop",
    rules: { laps: 1, countdownSeconds: 0, timeoutSeconds: 60 },
    participants: participants ?? [
      { playerId: "local", control: "local", modelId: "kaido-gts", livery: createLivery() },
      { playerId: "cpu", control: "cpu", modelId: "colt-gt", livery: createLivery() },
    ],
    source: { kind: sourceKind, id: sourceKind === "freeplay" ? null : "event-1" },
  };
}

const track = {
  id: "test-loop",
  checkpoints,
  racingLine: checkpoints,
  spawns: [
    { x: 0, y: 0, angle: Math.PI / 2 },
    { x: 0, y: 8, angle: Math.PI / 2 },
  ],
};

const driveable = () => true;

test("canonical model identity is required and never substituted", () => {
  assert(hasCircuitAtlas("kaido-gts"));
  let threw = false;
  try {
    createCircuitAdapter({ track }).create(definition("freeplay", [
      { playerId: "local", control: "local", modelId: "shutter-z", livery: {} },
    ]), track);
  } catch (error) {
    threw = /atlas unavailable/.test(error.message);
  }
  assert(threw, "an unavailable model started a circuit race");
});

test("source is routing metadata and cannot change the simulation", () => {
  const freeplay = createCircuitRace(definition("freeplay"), track);
  const campaign = createCircuitRace(definition("campaign"), track);
  const online = createCircuitRace(definition("online"), track);
  const stripSource = ({ source, ...state }) => state;
  assertDeepEqual(stripSource(freeplay), stripSource(campaign));
  assertDeepEqual(stripSource(freeplay), stripSource(online));
});

test("circuit difficulty is a normalized serializable race rule", () => {
  const hard = createCircuitRace({
    ...definition(),
    rules: { ...definition().rules, cpuDifficultyId: "hard" },
  }, track);
  const fallback = createCircuitRace({
    ...definition(),
    rules: { ...definition().rules, cpuDifficultyId: "impossible" },
  }, track);

  assertEqual(hard.rules.cpuDifficultyId, "hard");
  assertEqual(hard.participants.find((entry) => entry.control === "cpu").driver.difficultyId, "hard");
  assertEqual(fallback.rules.cpuDifficultyId, DEFAULT_CIRCUIT_DIFFICULTY_ID);
  assertEqual(CIRCUIT_DIFFICULTIES.map((entry) => entry.id).join(), "easy,normal,hard");
  assertEqual(circuitDifficultyById("missing").id, DEFAULT_CIRCUIT_DIFFICULTY_ID);
});

test("higher circuit difficulty produces a meaningfully faster CPU", () => {
  const cpuOnly = (difficultyId) => createCircuitRace({
    ...definition("freeplay", [
      { playerId: "cpu", control: "cpu", modelId: "colt-gt", livery: {} },
    ]),
    rules: { ...definition().rules, cpuDifficultyId: difficultyId },
  }, track);
  const run = (difficultyId) => {
    let race = cpuOnly(difficultyId);
    for (let tick = 0; tick < 120; tick += 1) {
      race = stepCircuitRace(race, 1 / 120, { track, containsVehicle: driveable });
    }
    return race.participants[0];
  };

  const easy = run("easy");
  const hard = run("hard");
  assert(
    hard.vehicle.x > easy.vehicle.x + 8,
    `hard CPU (${hard.vehicle.x.toFixed(1)}) did not pull clear of easy (${easy.vehicle.x.toFixed(1)})`,
  );
});

test("countdown, input and fixed-step vehicle movement share one reducer", () => {
  const withCountdown = {
    ...definition(),
    rules: { ...definition().rules, countdownSeconds: 1 },
  };
  let race = createCircuitRace(withCountdown, track);
  assertEqual(race.status, STATUS_COUNTDOWN);
  race = inputCircuitRace(race, { playerId: "local", throttle: 1, steer: 0 });
  const startX = race.participants[0].vehicle.x;
  for (let tick = 0; tick < 10; tick += 1) {
    race = stepCircuitRace(race, 0.05, { track, containsVehicle: driveable });
  }
  assertClose(race.participants[0].vehicle.x, startX, 1e-9);
  for (let tick = 0; tick < 10; tick += 1) {
    race = stepCircuitRace(race, 0.05, { track, containsVehicle: driveable });
  }
  assertEqual(race.status, STATUS_RACING);
  race = stepCircuitRace(race, 1 / 60, { track, containsVehicle: driveable });
  assert(race.participants[0].vehicle.x > startX, "the local car did not use the two-axis reducer");
});

test("Old Town Shrine Loop starts both cars on one fair line rather than gifting the CPU a lead", () => {
  const oldTown = circuitTrackById("old-town-shrine-loop");
  const [player, opponent] = oldTown.spawns;
  const forward = forwardVector(player.angle);
  const opponentLead = (opponent.x - player.x) * forward.x + (opponent.y - player.y) * forward.y;
  assertClose(opponentLead, 0, 1e-9, "the opponent starts ahead along the racing direction");
  assert(Math.hypot(opponent.x - player.x, opponent.y - player.y) >= 24, "the grid slots overlap");

  const race = createCircuitRace({
    ...definition(),
    trackId: "old-town-shrine-loop",
    rules: { ...definition().rules, countdownSeconds: 3 },
    participants: definition().participants.map((participant) => participant.control === "local"
      ? { ...participant, displayName: "DRIVER" }
      : participant),
  }, oldTown);
  const hud = circuitHudView(race, oldTown, "local");
  assertEqual(hud.position.current, 1, "a stationary fair grid calls the local car P2");
  assertEqual(hud.runners[0].name, "YOU");
});

test("Old Town Shrine Loop checkpoint gates span the full driveable road", () => {
  const oldTown = circuitTrackById("old-town-shrine-loop");
  for (const [index, checkpoint] of oldTown.checkpoints.entries()) {
    assert(
      checkpoint.radius >= 106,
      `checkpoint ${index} can discard a legal outside line and force an extra lap`,
    );
  }
});

test("road containment samples the full normalized footprint", () => {
  const width = 40;
  const height = 40;
  const pixels = new Uint8Array(width * height).fill(255);
  const mask = createRoadMask({ width, height, pixels });
  const car = createVehicle({ x: 20, y: 20, angle: 0 });
  assertEqual(vehicleFootprintPoints(car).length, 9);
  assert(mask.containsVehicle(car));
  assert(!mask.containsVehicle({ ...car, x: 3 }), "centre-only containment let the body leave the road");
});

test("ordered checkpoints reject shortcuts and only the finish checkpoint counts a lap", () => {
  let race = createCircuitRace(definition("freeplay", [
    { playerId: "local", control: "local", modelId: "kaido-gts", livery: {} },
  ]), track);
  const placeAt = (x, y) => {
    race = {
      ...race,
      status: STATUS_RACING,
      participants: race.participants.map((participant) => ({
        ...participant,
        vehicle: { ...participant.vehicle, x, y, velocityX: 0, velocityY: 0 },
      })),
    };
    race = stepCircuitRace(race, 0, { track, containsVehicle: driveable });
  };

  placeAt(0, 0);
  assertEqual(race.participants[0].lap, 0, "crossing finish before checkpoint 1 counted");
  placeAt(100, 100);
  assertEqual(race.participants[0].nextCheckpoint, 1, "checkpoint 2 accepted out of order");
  placeAt(100, 0);
  placeAt(100, 100);
  placeAt(0, 100);
  placeAt(0, 0);
  assertEqual(race.participants[0].lap, 1);
  assertEqual(race.participants[0].place, 1);
  assertEqual(race.status, STATUS_FINISHED);
});

test("a three-lap race requires three complete checkpoint sequences and records each lap", () => {
  const threeLaps = {
    ...definition("freeplay", [
      { playerId: "local", control: "local", modelId: "kaido-gts", livery: {} },
    ]),
    rules: { laps: 3, countdownSeconds: 0, timeoutSeconds: 60 },
  };
  let race = createCircuitRace(threeLaps, track);
  const cross = (checkpoint, elapsedStep = 1) => {
    race = {
      ...race,
      participants: race.participants.map((participant) => ({
        ...participant,
        vehicle: { ...participant.vehicle, x: checkpoint.x, y: checkpoint.y, velocityX: 0, velocityY: 0 },
      })),
    };
    race = stepCircuitRace(race, elapsedStep, { track, containsVehicle: driveable });
  };

  for (let lap = 1; lap <= 3; lap += 1) {
    for (const checkpoint of checkpoints.slice(1)) cross(checkpoint);
    cross(checkpoints[0]);
    assertEqual(race.participants[0].lap, lap);
    assertEqual(race.participants[0].lapTimes.length, lap);
    assertEqual(race.status, lap === 3 ? STATUS_FINISHED : STATUS_RACING);
  }
  assertEqual(race.finishOrder.join(), "local");
});

test("car contact changes both vehicles symmetrically", () => {
  const left = createVehicle({ x: 10, y: 10, angle: Math.PI / 2, velocityX: 50 });
  const right = createVehicle({ x: 20, y: 10, angle: Math.PI / 2, velocityX: 0 });
  const contact = resolveVehicleCollision(left, right);
  assert(contact.impact, "overlapping cars did not collide");
  const before = Math.hypot(right.x - left.x, right.y - left.y);
  const after = Math.hypot(contact.cpu.x - contact.player.x, contact.cpu.y - contact.player.y);
  assert(after > before, "contact did not separate both bodies");
  assert(contact.player.x !== left.x || contact.player.y !== left.y);
  assert(contact.cpu.x !== right.x || contact.cpu.y !== right.y);
});

test("finish order and normalized results are deterministic", () => {
  let race = createCircuitRace(definition(), track);
  race = {
    ...race,
    status: STATUS_RACING,
    participants: race.participants.map((participant) => ({
      ...participant,
      nextCheckpoint: 0,
      vehicle: { ...participant.vehicle, x: 0, y: 0, velocityX: 0, velocityY: 0 },
    })),
  };
  race = stepCircuitRace(race, 0, { track, containsVehicle: driveable });
  assertEqual(race.participants[0].place, 1);
  assertEqual(race.participants[1].place, 2);
  assertDeepEqual(circuitRaceResult(race, "local"), {
    won: true,
    outcome: "victory",
    value: 0,
    better: "lower",
    place: 1,
    finished: true,
    fieldSize: 2,
    laps: 1,
    winnerId: "local",
    winnerName: "local",
    playerName: "local",
  });
});

test("the local driver's finish ends the race without waiting for the CPU", () => {
  let race = createCircuitRace(definition(), track);
  race = {
    ...race,
    status: STATUS_RACING,
    participants: race.participants.map((participant, index) => ({
      ...participant,
      nextCheckpoint: index === 0 ? 0 : 1,
      vehicle: {
        ...participant.vehicle,
        x: index === 0 ? 0 : 50,
        y: index === 0 ? 0 : 50,
        velocityX: 0,
        velocityY: 0,
      },
    })),
  };

  race = stepCircuitRace(race, 0, { track, containsVehicle: driveable });

  assertEqual(race.status, STATUS_FINISHED);
  assertEqual(race.participants[0].place, 1);
  assertEqual(race.participants[1].finishedAt, null);
  assertDeepEqual(race.finishOrder, ["local"]);
});

test("overlapping cars draw from upper road position to lower road position", () => {
  const participants = [
    { playerId: "local", control: "local", vehicle: { x: 200, y: 180 } },
    { playerId: "cpu", control: "cpu", vehicle: { x: 200, y: 140 } },
    { playerId: "remote", control: "remote", vehicle: { x: 190, y: 180 } },
  ];

  assertDeepEqual(
    circuitDepthOrder(participants).map((participant) => participant.playerId),
    ["cpu", "remote", "local"],
  );
});

test("the circuit view starts at the selected track's low-speed zoom", () => {
  const race = createCircuitRace(definition(), track);
  const selectedTrack = {
    ...track,
    presentation: { carScale: 0.82, camera: { minZoom: 2, maxZoom: 2.4 } },
  };
  assertEqual(createCircuitView(race, selectedTrack).camera.zoom, 2.4);
});

test("a losing result explicitly names defeat and the driver who took the flag", () => {
  let race = createCircuitRace(definition(), track);
  race = {
    ...race,
    status: STATUS_FINISHED,
    finishOrder: ["cpu", "local"],
    participants: race.participants.map((participant, index) => ({
      ...participant,
      displayName: index === 0 ? "YOU" : "TOLLGATE",
      lap: 1,
      place: index === 0 ? 2 : 1,
      finishedAt: index === 0 ? 15.2 : 14.8,
    })),
  };
  const result = circuitRaceResult(race, "local");
  assertEqual(result.won, false);
  assertEqual(result.outcome, "defeat");
  assertEqual(result.winnerName, "TOLLGATE");
  assertEqual(result.place, 2);
});

test("the circuit HUD exposes real race instruments, timing and running order", () => {
  let race = createCircuitRace({
    ...definition(),
    rules: { laps: 3, countdownSeconds: 0, timeoutSeconds: 60 },
    participants: [
      { playerId: "local", displayName: "YOU", control: "local", modelId: "kaido-gts", livery: {} },
      { playerId: "cpu", displayName: "TOLLGATE", control: "cpu", modelId: "colt-gt", livery: {} },
    ],
  }, track);
  race = {
    ...race,
    elapsed: 24.5,
    participants: race.participants.map((participant, index) => {
      const { checkpointsPassed, ...wireParticipant } = participant;
      return {
      ...wireParticipant,
      // Authoritative online snapshots carry lap + nextCheckpoint, not the
      // browser-only convenience counter. Running order must survive one.
      nextCheckpoint: index === 0 ? 3 : 2,
      lap: 1,
      lapStartedAt: 18,
      lastLapTime: index === 0 ? 18 : 18.5,
      bestLapTime: index === 0 ? 18 : 18.5,
      vehicle: {
        ...participant.vehicle,
        x: index === 0 ? 0 : 100,
        y: index === 0 ? 0 : 100,
        velocityX: index === 0 ? 200 : 180,
        velocityY: 0,
      },
    };
    }),
  };
  const hud = circuitHudView(race, track, "local");
  assertDeepEqual(hud.position, { current: 1, total: 2 });
  assertDeepEqual(hud.lap, { current: 2, total: 3, completed: 1 });
  assertEqual(hud.timing.currentLap, 6.5);
  assertEqual(hud.timing.lastLap, 18);
  assert(hud.instruments.speedKph > 0);
  assert(hud.instruments.gear >= 1 && hud.instruments.gear <= 6);
  assert(hud.instruments.rpm >= 900 && hud.instruments.rpm <= 8000);
  assertEqual(hud.runners[0].name, "YOU");
});

test("the runtime registry exposes one stable adapter shape", () => {
  const circuit = createCircuitAdapter({ track, containsVehicle: driveable });
  const drag = {
    create() {}, input() {}, step() {}, result() {}, render() {},
  };
  const registry = createRuntimeRegistry({ drag, circuit });
  assert(registry.forDefinition(definition()) === circuit);
  assert(registry.forDefinition({ runtime: "drag" }) === drag);
  for (const method of ["create", "input", "step", "result", "render"]) {
    assertEqual(typeof circuit[method], "function", `circuit adapter has no ${method}`);
  }
});

test("one circuit adapter resolves the selected catalog track for create and step", () => {
  const alternate = {
    ...track,
    id: "alternate-loop",
    spawns: [{ x: 300, y: 400, angle: Math.PI }, { x: 330, y: 400, angle: Math.PI }],
  };
  const seen = [];
  const adapter = createCircuitAdapter({
    trackById: (id) => (id === alternate.id ? alternate : id === track.id ? track : null),
    containsVehicle: (_vehicle, selectedTrack) => {
      seen.push(selectedTrack.id);
      return true;
    },
  });
  const selected = adapter.create({ ...definition(), trackId: alternate.id });
  assertEqual(selected.trackId, alternate.id);
  assertEqual(selected.participants[0].vehicle.x, alternate.spawns[0].x);
  adapter.step(selected, 1 / 120);
  assert(seen.every((id) => id === alternate.id), "collision used a different circuit's mask");
});

test("vehicle integration remains pure", () => {
  const vehicle = createVehicle({ x: 5, y: 5 });
  const next = stepVehicle(vehicle, { throttle: 1, steer: 1 }, 1 / 60);
  assertEqual(vehicle.x, 5);
  assert(next !== vehicle);
});

test("the browser reducer matches the committed cross-runtime golden replay", () => {
  let vehicle = createVehicle({ x: 610, y: 850, angle: Math.PI / 2 });
  for (let tick = 0; tick < circuitGolden.ticks; tick += 1) {
    vehicle = stepVehicle(vehicle, {
      throttle: tick < 180 ? 1 : 0,
      steer: tick < 80 ? 0.2 : tick < 160 ? -0.15 : 0,
    }, 1 / 120);
  }
  for (const [key, expected] of Object.entries(circuitGolden.vehicle)) {
    assertClose(vehicle[key], expected, 1e-12, `${key} drifted`);
  }
});

finish();
