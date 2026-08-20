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

test("an old snapshot never rewinds a newer acknowledgement", () => {
  const adapter = createCircuitAdapter({ track });
  let prediction = createCircuitPrediction(adapter.create(definition), "p1");
  prediction = predictCircuitTick(prediction, adapter, { throttle: 1 });
  prediction = { ...prediction, acknowledgedTick: 1 };
  const stale = { ...prediction.state, tick: 0 };
  assert(reconcileCircuitSnapshot(prediction, adapter, stale) === prediction);
});

finish();
