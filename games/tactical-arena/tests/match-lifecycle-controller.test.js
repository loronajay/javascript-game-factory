import test from "node:test";
import assert from "node:assert/strict";

import {
  cpuConfigForMatch,
  createMatchLifecycleController,
  matchSeedForConfig,
} from "../src/match/matchLifecycleController.js";

test("only CPU-driven match modes receive a player-two CPU config", () => {
  assert.equal(cpuConfigForMatch({ mode: "hotseat" }), null);
  assert.equal(cpuConfigForMatch({ mode: "online" }), null);
  const campaign = cpuConfigForMatch({ mode: "campaign", difficulty: "hard" });
  assert.equal(campaign.difficulty, "hard");
  assert.deepEqual([...campaign.players], [2]);
});

test("only synchronized and tutorial matches preserve their configured seed", () => {
  assert.equal(matchSeedForConfig({ mode: "online", seed: 42 }), 42);
  assert.equal(matchSeedForConfig({ mode: "tutorial", seed: 7 }), 7);
  assert.equal(matchSeedForConfig({ mode: "single", seed: 42 }), undefined);
});

test("starting a match clears in-flight effects before rendering the fresh battle", () => {
  const calls = [];
  const controller = createMatchLifecycleController({
    runtime: { matchEpoch: 0 },
    interaction: {},
    tutorialPresentation: { reset: () => calls.push("tutorial-reset") },
    tempoLoop: { stop: () => calls.push("tempo-stop") },
    blackout: { clear: () => calls.push("blackout-clear") },
    effects: {
      clearActive: () => calls.push("effects-clear"),
      setMetrics: () => calls.push("metrics"),
    },
    restartControl: {},
    turnFlash: { clear: () => calls.push("turn-clear") },
    menu: { show: () => calls.push("show") },
    audio: {},
    dialogue: {},
    render: () => calls.push("render"),
  });

  controller.start({ mode: "hotseat", size: 5, squads: { 1: ["swordsman"], 2: ["swordsman"] } });

  assert.ok(calls.indexOf("effects-clear") > calls.indexOf("blackout-clear"));
  assert.ok(calls.indexOf("effects-clear") < calls.indexOf("render"));
});

test("online matches replace the topbar menu button with concede", () => {
  const squad = ["swordsman"];
  const controls = {
    restart: {},
    concede: { hidden: true },
    menu: { hidden: false },
  };
  const controller = createMatchLifecycleController({
    runtime: { matchEpoch: 0 },
    interaction: {},
    tutorialPresentation: { reset() {} },
    tempoLoop: { stop() {}, start() {} },
    blackout: { clear() {} },
    effects: { clearActive() {}, setMetrics() {} },
    restartControl: controls.restart,
    concedeControl: controls.concede,
    menuControl: controls.menu,
    turnFlash: { clear() {} },
    menu: { show() {} },
    audio: {},
    dialogue: {},
  });

  controller.start({
    mode: "online",
    size: 13,
    squads: { 1: squad, 2: squad },
    mySeat: 1,
    net: { bind() {}, dispose() {} },
  });
  assert.equal(controls.restart.hidden, true);
  assert.equal(controls.concede.hidden, false);
  assert.equal(controls.concede.disabled, false);
  assert.equal(controls.menu.hidden, true);

  controller.leave();
  assert.equal(controls.concede.hidden, true);
  assert.equal(controls.concede.disabled, true);
  assert.equal(controls.menu.hidden, false);
});

test("ranked online matches also use concede instead of the match menu", () => {
  const squad = ["swordsman"];
  const controls = { restart: {}, concede: { hidden: true }, menu: { hidden: false } };
  const controller = createMatchLifecycleController({
    runtime: { matchEpoch: 0 },
    interaction: {},
    tutorialPresentation: { reset() {} },
    tempoLoop: { stop() {}, start() {} },
    blackout: { clear() {} },
    effects: { clearActive() {}, setMetrics() {} },
    restartControl: controls.restart,
    concedeControl: controls.concede,
    menuControl: controls.menu,
    turnFlash: { clear() {} },
    menu: { show() {} },
    audio: {},
    dialogue: {},
  });

  controller.start({
    mode: "online",
    ranked: { matchId: "ranked-1" },
    size: 13,
    squads: { 1: squad, 2: squad },
    mySeat: 2,
    net: { bind() {} },
  });

  assert.equal(controls.concede.hidden, false);
  assert.equal(controls.concede.disabled, false);
  assert.equal(controls.menu.hidden, true);
});

test("leaving a live ranked match reports an abandon loss before disposing the socket", () => {
  const calls = [];
  const squad = ["swordsman"];
  const runtime = { matchEpoch: 0 };
  const controller = createMatchLifecycleController({
    runtime,
    interaction: {},
    tutorialPresentation: { reset() {} },
    tempoLoop: { stop() { calls.push("tempo-stop"); }, start() {} },
    blackout: { clear() {} },
    effects: { clearActive() {}, setMetrics() {} },
    restartControl: {},
    concedeControl: { hidden: true },
    menuControl: { hidden: false },
    turnFlash: { clear() {} },
    menu: { show() {} },
    audio: {},
    dialogue: {},
  });

  controller.start({
    mode: "online",
    ranked: { matchId: "ranked-1", reportAbandon: () => calls.push("abandon") },
    size: 13,
    squads: { 1: squad, 2: squad },
    mySeat: 1,
    net: { bind() {}, dispose() { calls.push("dispose"); } },
  });

  controller.leave();

  assert.ok(calls.indexOf("abandon") >= 0, "ranked abandon should be reported");
  assert.ok(calls.indexOf("abandon") < calls.indexOf("dispose"), "report before socket disposal");
});

test("local match starts preserve every setup board size from fifteen down to seven", () => {
  const squad = ["swordsman", "archer", "mystic", "magician"];

  for (const mode of ["hotseat", "single"]) {
    for (const size of [15, 14, 13, 12, 11, 10, 9, 8, 7]) {
      let metricsSize = null;
      const runtime = { matchEpoch: 0 };
      const controller = createMatchLifecycleController({
        runtime,
        interaction: {},
        tutorialPresentation: { reset() {} },
        tempoLoop: { stop() {}, start() {} },
        blackout: { clear() {} },
        effects: { clearActive() {}, setMetrics(metrics) { metricsSize = metrics.tileWidth; } },
        restartControl: {},
        turnFlash: { clear() {} },
        menu: { show() {} },
        audio: {},
        dialogue: {},
      });

      controller.start({ mode, size, squads: { 1: squad, 2: squad } });

      assert.equal(runtime.state.size, size);
      assert.ok(metricsSize > 0, `${mode} ${size}x${size} should configure board metrics`);
      assert.equal(runtime.state.units.length, 8);
      assert.ok(
        runtime.state.units.every((unit) => (
          unit.position.x >= 0 &&
          unit.position.y >= 0 &&
          unit.position.x < size &&
          unit.position.y < size
        )),
        `${mode} ${size}x${size} should spawn every unit inside the board`,
      );
    }
  }
});
