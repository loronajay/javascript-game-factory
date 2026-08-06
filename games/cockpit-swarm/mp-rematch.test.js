import test from "node:test";
import assert from "node:assert/strict";

import { createRematchFlow } from "./js/systems/mp-rematch.mjs";

test("guest waits for the coordinator's synchronized rematch start", () => {
  const accepted = [];
  const starts = [];
  const flow = createRematchFlow({
    sendState() {},
    sendStart: (start) => starts.push(start),
    isCoordinator: () => false,
    buildStart: (round) => ({ round, startAt: 5000 }),
    onAccepted: (start) => accepted.push(start),
  });

  flow.enterResults({ round: 0 });
  flow.receiveState({ round: 0, available: true, requested: true });
  flow.request();
  assert.deepEqual(starts, []);
  assert.deepEqual(accepted, []);

  flow.receiveStart({ round: 1, startAt: 5000 });
  assert.deepEqual(accepted, [{ round: 1, startAt: 5000 }]);
});

test("a post-results departure makes a pending rematch visibly unavailable", () => {
  const states = [];
  const flow = createRematchFlow({ onState: state => states.push(state) });
  flow.enterResults({ round: 3 });
  flow.receiveState({ round: 3, available: true, requested: false });
  flow.request();
  flow.receiveState({ round: 3, available: false, requested: false });
  assert.equal(states.at(-1).declined, true);
  assert.equal(states.at(-1).available, false);
});

