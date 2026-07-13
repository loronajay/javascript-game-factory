import test from "node:test";
import assert from "node:assert/strict";

import {
  createTempoLoopController,
  tempoStructuralSignature,
} from "../src/ui/tempoLoopController.js";

test("tempo structural signatures ignore gauge progress but track readiness and vitals", () => {
  const state = {
    phase: "playing",
    activation: null,
    units: [{ id: "u1", hp: 10, mp: 3, spent: false, statuses: [], ready: false }],
  };
  const isReady = (_state, unit) => unit.ready;

  const waiting = tempoStructuralSignature(state, isReady);
  state.units[0].gauge = 42;
  assert.equal(tempoStructuralSignature(state, isReady), waiting);
  state.units[0].ready = true;
  assert.notEqual(tempoStructuralSignature(state, isReady), waiting);
});

test("stopping the tempo loop clears transient CPU and animation ownership", () => {
  const runtime = {
    tempoCpuActing: true,
    tempoCpuAbort: true,
    tempoAnimating: 2,
    tempoBusy: true,
  };
  const controller = createTempoLoopController({ runtime });

  controller.stop();

  assert.equal(runtime.tempoCpuActing, false);
  assert.equal(runtime.tempoCpuAbort, false);
  assert.equal(runtime.tempoAnimating, 0);
  assert.equal(runtime.tempoBusy, false);
});
