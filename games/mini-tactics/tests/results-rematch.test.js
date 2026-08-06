import test from "node:test";
import assert from "node:assert/strict";

import { createResultsRematch } from "../src/ui/screens/resultsRematch.js";

function harness() {
  const rematchBtn = { disabled: false, textContent: "Rematch", title: "" };
  const statusEl = { hidden: true, textContent: "" };
  const started = [];
  const net = {
    enterResults(controller) {
      this.controller = controller;
      return true;
    },
    requestRematch() {
      return { accepted: true, waiting: true };
    },
    leaveResultsCalls: 0,
    leaveResults() {
      this.leaveResultsCalls += 1;
    },
  };
  const config = { mode: "online", seed: 10, net, size: 10, playerCount: 2 };
  const rematch = createResultsRematch({
    rematchBtn,
    statusEl,
    startMatch: (next) => started.push(next),
  });
  return { rematchBtn, statusEl, started, net, config, rematch };
}

test("online rematch remains locked until every opponent reaches results", () => {
  const h = harness();
  h.rematch.show(h.config);

  assert.equal(h.rematchBtn.disabled, true);
  assert.match(h.statusEl.textContent, /waiting for your opponent/i);

  h.net.controller.onState({ available: true });
  assert.equal(h.rematchBtn.disabled, false);

  h.rematch.request();
  assert.equal(h.rematchBtn.disabled, true);
  assert.match(h.statusEl.textContent, /accept/i);
});

test("mutual consent starts a fresh online match without leaving the relay lobby", () => {
  const h = harness();
  h.rematch.show(h.config);
  h.net.controller.onAccepted({ seed: 99, round: 1 });
  h.rematch.onExit();

  assert.equal(h.started.length, 1);
  assert.equal(h.started[0].seed, 99);
  assert.equal(h.started[0].net, h.net);
  assert.equal(h.net.leaveResultsCalls, 0);
});

test("leaving results withdraws rematch availability", () => {
  const h = harness();
  h.rematch.show(h.config);
  h.rematch.onExit();
  assert.equal(h.net.leaveResultsCalls, 1);
});

