import test from "node:test";
import assert from "node:assert/strict";

import { createResultsRematch } from "../src/ui/resultsRematch.js";

function harness() {
  const rematchBtn = { hidden: false, disabled: false, textContent: "Rematch", title: "" };
  const statusEl = { hidden: true, textContent: "" };
  const started = [];
  const net = {
    entered: 0,
    requested: 0,
    left: 0,
    enterResults(controller) {
      this.entered += 1;
      this.controller = controller;
      return true;
    },
    requestRematch() {
      this.requested += 1;
      return { accepted: true, waiting: true };
    },
    leaveResults() {
      this.left += 1;
    },
  };
  const config = { mode: "online", seed: 10, net, ranked: null, squads: { 1: ["archer"], 2: ["king"] } };
  const rematch = createResultsRematch({
    rematchBtn,
    statusEl,
    startMatch: (next) => started.push(next),
  });
  return { rematchBtn, statusEl, started, net, config, rematch };
}

test("casual online rematch unlocks only when the opponent reaches results", () => {
  const h = harness();

  h.rematch.show(h.config);
  assert.equal(h.net.entered, 1);
  assert.equal(h.rematchBtn.disabled, true);
  assert.match(h.statusEl.textContent, /Waiting for your opponent/);

  h.net.controller.onState({
    available: true,
    localRequested: false,
    opponentRequested: false,
    declined: false,
    opponentUnavailable: false,
  });
  assert.equal(h.rematchBtn.disabled, false);
  assert.equal(h.statusEl.hidden, true);

  h.rematch.request();
  assert.equal(h.net.requested, 1);
  assert.equal(h.rematchBtn.disabled, true);
  assert.match(h.statusEl.textContent, /Waiting for your opponent to accept/);
});

test("pending rematch reports a decline and stays locked when the opponent leaves results", () => {
  const h = harness();
  h.rematch.show(h.config);
  h.net.controller.onState({ available: true, localRequested: false, opponentRequested: false });
  h.rematch.request();

  h.net.controller.onState({
    available: false,
    localRequested: true,
    opponentRequested: false,
    declined: true,
    opponentUnavailable: true,
  });

  assert.equal(h.rematchBtn.disabled, true);
  assert.equal(h.rematchBtn.textContent, "Rematch Declined");
  assert.match(h.statusEl.textContent, /declined the rematch/i);
});

test("mutual consent starts a refreshed match without withdrawing from results", () => {
  const h = harness();
  h.rematch.show(h.config);

  h.net.controller.onAccepted({ seed: 99, round: 1 });
  h.rematch.onExit();

  assert.equal(h.started.length, 1);
  assert.equal(h.started[0].seed, 99);
  assert.equal(h.started[0].net, h.net);
  assert.equal(h.net.left, 0);
});

test("leaving online results withdraws rematch availability", () => {
  const h = harness();
  h.rematch.show(h.config);

  h.rematch.onExit();

  assert.equal(h.net.left, 1);
});

test("ranked results keep rematch disabled and never enter the handshake", () => {
  const h = harness();
  h.config.ranked = { matchId: "ranked-1" };

  h.rematch.show(h.config);

  assert.equal(h.net.entered, 0);
  assert.equal(h.rematchBtn.disabled, true);
  assert.match(h.statusEl.textContent, /disabled in Ranked/);
});
