import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import * as cmd from "../src/core/commands.js";
import { EVENTS } from "../src/core/events.js";
import {
  completeTutorial,
  createBasicsTutorial,
  prepareTutorialCommand,
  recordTutorialCommand,
} from "../src/tutorials/basics.js";

function unit(id, player, type, x, y, extra = {}) {
  return {
    id,
    player,
    type,
    x,
    y,
    hp: 10,
    maxHp: 10,
    spent: false,
    defending: false,
    guardTargetId: null,
    ...extra,
  };
}

function matchForRangerDuel() {
  const match = createMatchState({ size: 10, seed: 1, mode: "tutorial" });
  match.units = [
    unit("p1-ranger", 1, "ranger", 3, 5),
    unit("p1-warrior", 1, "warrior", 0, 8, { spent: true }),
    unit("p1-tank", 1, "tank", 1, 8, { spent: true }),
    unit("p1-medic", 1, "medic", 1, 9, { spent: true }),
    unit("p2-ranger", 2, "ranger", 7, 5),
    unit("p2-warrior", 2, "warrior", 9, 1),
    unit("p2-tank", 2, "tank", 8, 1),
    unit("p2-medic", 2, "medic", 8, 0),
  ];
  return match;
}

function mustApply(tutorial, match, command) {
  const prepared = prepareTutorialCommand(tutorial, match, command);
  const result = applyCommand(prepared, command);
  assert.equal(result.accepted, true, `expected ${command.type} to be accepted`);
  recordTutorialCommand(tutorial, {
    command,
    events: result.events,
    match: result.nextState,
  });
  return { match: result.nextState, events: result.events };
}

test("basics tutorial forces hit, miss, and crit teaching rolls in sequence", () => {
  const tutorial = createBasicsTutorial();
  let match = matchForRangerDuel();

  ({ match } = mustApply(tutorial, match, cmd.beginActivation(1, "p1-ranger")));
  let applied = mustApply(tutorial, match, cmd.attack(1, "p1-ranger", "p2-ranger"));
  let attack = applied.events.find((event) => event.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(attack.hit, true);
  assert.equal(attack.critical, false);
  assert.equal(tutorial.stage, "await_counter_turn");
  match = applied.match;

  match.currentPlayer = 2;
  match.activation = null;
  tutorial.stage = "cpu_counterattack";
  ({ match } = mustApply(tutorial, match, cmd.beginActivation(2, "p2-ranger")));
  applied = mustApply(tutorial, match, cmd.attack(2, "p2-ranger", "p1-ranger"));
  attack = applied.events.find((event) => event.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(attack.hit, false);
  assert.equal(tutorial.stage, "await_kite_attack");
  match = applied.match;

  match.currentPlayer = 1;
  match.activation = null;
  ({ match } = mustApply(tutorial, match, cmd.beginActivation(1, "p1-ranger")));
  applied = mustApply(tutorial, match, cmd.attack(1, "p1-ranger", "p2-ranger"));
  attack = applied.events.find((event) => event.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(attack.hit, true);
  assert.equal(attack.critical, false);
  assert.equal(tutorial.stage, "await_kite_move");
  match = applied.match;

  applied = mustApply(tutorial, match, cmd.moveUnit(1, "p1-ranger", 3, 4));
  assert.equal(tutorial.stage, "await_final_crit");
  match = applied.match;

  match.activation = null;
  match.units.find((u) => u.id === "p1-ranger").spent = false;
  ({ match } = mustApply(tutorial, match, cmd.beginActivation(1, "p1-ranger")));
  applied = mustApply(tutorial, match, cmd.attack(1, "p1-ranger", "p2-ranger"));
  attack = applied.events.find((event) => event.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(attack.hit, true);
  assert.equal(attack.critical, true);
  assert.equal(tutorial.completed, true);
});

test("completing the only available tutorial grants a curated reward skin", () => {
  const storage = new Map();
  const adapter = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  };

  const progress = completeTutorial(adapter, "basics");

  assert.deepEqual(progress.completedTutorials, ["basics"]);
  assert.equal(progress.allTutorialsComplete, true);
  assert.equal(progress.rewardGranted, true);
  assert.equal(typeof progress.rewardSkin, "string");
  assert.ok(progress.rewardSkin.length > 0);
});
