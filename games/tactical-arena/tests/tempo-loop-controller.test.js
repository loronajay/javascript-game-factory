import test from "node:test";
import assert from "node:assert/strict";

import {
  createTempoLoopController,
  syncTempoGaugeElement,
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

test("tempo gauges do not touch the DOM again while the displayed percentage is unchanged", () => {
  let childQueries = 0;
  let widthWrites = 0;
  let textWrites = 0;
  let readyToggles = 0;
  let width = "";
  let text = "";
  const fill = {
    style: {
      get width() { return width; },
      set width(value) { widthWrites += 1; width = value; },
    },
  };
  const number = {
    get textContent() { return text; },
    set textContent(value) { textWrites += 1; text = value; },
  };
  const element = {
    querySelector(selector) {
      childQueries += 1;
      return selector === ".vital-fill" ? fill : number;
    },
    classList: {
      toggle() { readyToggles += 1; },
    },
  };

  assert.equal(syncTempoGaugeElement(element, 37), true);
  assert.equal(syncTempoGaugeElement(element, 37, 37), false);
  assert.equal(width, "37%");
  assert.equal(text, "37%");
  assert.equal(childQueries, 2);
  assert.equal(widthWrites, 1);
  assert.equal(textWrites, 1);
  assert.equal(readyToggles, 1);
});
