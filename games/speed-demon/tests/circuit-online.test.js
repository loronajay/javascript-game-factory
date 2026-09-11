import { suite, test, assert, assertDeepEqual, assertEqual, finish } from "./harness.js";
import { createLivery } from "../scripts/garage/livery.js";
import { createCircuitAdapter } from "../scripts/runtime/circuit-adapter.js";
import { createCircuitPrediction, predictCircuitTick, reconcileCircuitSnapshot } from "../scripts/online/circuit-sync.js";

suite("circuit online prediction and reconciliation");

const track = {
  id: "test-loop",
  spawns: [{ x: 0, y: 0, angle: Math.PI / 2 }, { x: 0, y: 30, angle: Math.PI / 2 }],
  checkpoints: [{ x: 0, y: 0, radius: 10 }, { x: 500, y: 0, radius: 10 }],
  racingLine: [{ x: 0, y: 0 }, { x: 500, y: 0 }],
};
const definition = {
  runtime: "circuit", modeId: "circuit", trackId: "test-loop",
  rules: { laps: 3, countdownSeconds: 0, timeoutSeconds: 300 },
  source: { kind: "online", id: null },
  participants: [
    { playerId: "p1", control: "local", modelId: "kaido-gts", livery: createLivery() },
    { playerId: "p2", control: "remote", modelId: "colt-gt", livery: createLivery() },
  ],
};

test("every locally predicted input carries a simulation tick and the complete wire controls", () => {
  const adapter = createCircuitAdapter({ track });
  let prediction = createCircuitPrediction(adapter.create(definition), "p1");
  prediction = predictCircuitTick(prediction, adapter, { throttle: 1, brake: 0, steer: 0.25, shift: 1 });
  assertDeepEqual(prediction.pending[0], { t: 0, throttle: 1, brake: 0, steer: 0.25, shift: 1 });
  assertEqual(prediction.state.tick, 1);
});

test("an authoritative snapshot drops acknowledged inputs and replays the unacknowledged tail", () => {
  const adapter = createCircuitAdapter({ track });
  let client = createCircuitPrediction(adapter.create(definition), "p1");
  let server = adapter.create(definition);
  let snapshot = null;
  for (let tick = 0; tick < 12; tick += 1) {
    const controls = { throttle: 1, brake: 0, steer: tick < 6 ? 0.2 : -0.1, shift: tick === 4 ? 1 : 0 };
    client = predictCircuitTick(client, adapter, controls);
    server = adapter.input(server, { playerId: "p1", ...controls });
    server = adapter.step(server, 1 / 120);
    if (tick === 5) snapshot = structuredClone(server);
  }
  client = reconcileCircuitSnapshot(client, adapter, snapshot);
  assertEqual(client.pending[0].t, 6);
  assertDeepEqual(client.state.participants.map((entry) => entry.vehicle), server.participants.map((entry) => entry.vehicle));
});

test("a snapshot carries the simulated tree and the lap ledger, not only the cars", () => {
  // The countdown is simulated on the server (tick 0 is at startAt on both
  // sides), so a client that joined the tick late must adopt the server's
  // countdown or its own 3-2-1 lands on the wrong tick. Lap times ride along so
  // the HUD reads the authoritative ledger rather than a predicted one.
  const adapter = createCircuitAdapter({ track });
  const counted = { ...definition, rules: { ...definition.rules, countdownSeconds: 3 } };
  let client = createCircuitPrediction(adapter.create(counted), "p1");
  let server = adapter.create(counted);
  for (let tick = 0; tick < 200; tick += 1) server = adapter.step(server, 1 / 120);
  client = reconcileCircuitSnapshot(client, adapter, {
    ...structuredClone(server),
    participants: server.participants.map((entry) => ({ ...entry, lapTimes: [1.5], bestLapTime: 1.5 })),
  });
  assertEqual(client.state.tick, 200);
  assertEqual(client.state.status, "countdown");
  assertEqual(client.state.countdown, server.countdown);
  assertDeepEqual(client.state.participants[0].lapTimes, [1.5]);
  assertEqual(client.state.participants[0].control, "local", "wire fields never overwrite who drives the car");
});

test("an online race does not end when the local car is home", () => {
  // The server holds the flag. A client whose reducer declared the race over
  // on its own finish would stop stepping the opponent's last lap.
  const adapter = createCircuitAdapter({ track });
  const online = { ...definition, rules: { ...definition.rules, finishRule: "all" } };
  assertEqual(adapter.create(online).rules.finishRule, "all");
});

test("an old snapshot never rewinds a newer acknowledgement", () => {
  const adapter = createCircuitAdapter({ track });
  let prediction = createCircuitPrediction(adapter.create(definition), "p1");
  prediction = predictCircuitTick(prediction, adapter, { throttle: 1 });
  prediction = { ...prediction, acknowledgedTick: 1 };
  const stale = { ...prediction.state, tick: 0 };
  assert(reconcileCircuitSnapshot(prediction, adapter, stale) === prediction);
});

finish();
