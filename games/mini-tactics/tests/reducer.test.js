import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { createRngState, rollD6 } from "../src/core/rng.js";
import { ERR } from "../src/core/errors.js";
import { EVENTS } from "../src/core/events.js";
import * as cmd from "../src/core/commands.js";

// --- helpers -----------------------------------------------------------------

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

// Build a match with a hand-placed roster so each test isolates one rule.
function makeMatch(units, { seed = 1, size = 10 } = {}) {
  const state = createMatchState({ size, seed });
  state.units = units;
  return state;
}

// Apply a command and assert it was accepted, returning the next state.
function must(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `expected accept for ${command.type}`);
  return result.nextState;
}

// First authoritative roll for a seed (the reducer consumes the stream in order).
function firstRoll(seed) {
  return rollD6(createRngState(seed)).roll;
}

// Find a seed whose first roll matches a predicate, so outcome tests are exact.
function seedForFirstRoll(predicate) {
  for (let seed = 1; seed < 200000; seed += 1) {
    if (predicate(firstRoll(seed))) return seed;
  }
  throw new Error("no seed found");
}

const NORMAL_HIT = seedForFirstRoll((roll) => roll >= 2 && roll <= 5);
const MISS = seedForFirstRoll((roll) => roll === 1);
const CRIT = seedForFirstRoll((roll) => roll === 6);

// --- activation flow ---------------------------------------------------------

test("begin then move then attack completes a legal activation", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 4, 1));
  assert.equal(state.activation.moved, true);

  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  assert.equal(state.activation.primaryUsed, true);

  state = must(state, cmd.finishActivation(1, "p1-warrior"));
  assert.equal(state.units.find((u) => u.id === "p1-warrior").spent, true);
});

test("attack then move then finish is legal (action before movement)", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 4, 4));
  state = must(state, cmd.finishActivation(1, "p1-warrior"));
  assert.equal(state.units.find((u) => u.id === "p1-warrior").x, 4);
  assert.equal(state.units.find((u) => u.id === "p1-warrior").y, 4);
});

test("attack then finish without moving is legal", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  state = must(state, cmd.finishActivation(1, "p1-warrior"));
  assert.equal(state.activation, null);
});

test("move-only finish is rejected", () => {
  let state = makeMatch([unit("p1-warrior", 1, "warrior", 1, 1)]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));

  const result = applyCommand(state, cmd.finishActivation(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.FINISH_REQUIRES_ACTION);
});

test("double move is rejected", () => {
  let state = makeMatch([unit("p1-warrior", 1, "warrior", 1, 1)]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));

  const result = applyCommand(state, cmd.moveUnit(1, "p1-warrior", 1, 1));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.MOVE_ALREADY_USED);
});

test("double primary action is rejected", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));

  const result = applyCommand(state, cmd.defend(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.PRIMARY_ALREADY_USED);
});

test("commanding a unit that is not the active one is rejected", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p1-tank", 1, "tank", 5, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));

  const result = applyCommand(state, cmd.defend(1, "p1-tank"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.WRONG_ACTIVE_UNIT);
});

test("switching units after committing is rejected", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p1-tank", 1, "tank", 5, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));

  const result = applyCommand(state, cmd.beginActivation(1, "p1-tank"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.ACTIVATION_ALREADY_OPEN);
});

test("switching units before committing is allowed", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p1-tank", 1, "tank", 5, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.beginActivation(1, "p1-tank"));
  assert.equal(state.activation.unitId, "p1-tank");
});

test("acting on the opponent's turn is rejected", () => {
  const state = makeMatch([unit("p2-warrior", 2, "warrior", 1, 1)]);
  const result = applyCommand(state, cmd.beginActivation(2, "p2-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.NOT_ACTIVE_PLAYER);
});

// --- cancel move (scope section 3.6) ----------------------------------------

test("cancel move then move to a different legal tile", () => {
  let state = makeMatch([unit("p1-warrior", 1, "warrior", 1, 1)]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));
  state = must(state, cmd.cancelMove(1, "p1-warrior"));

  const warrior = state.units.find((u) => u.id === "p1-warrior");
  assert.equal(warrior.x, 1);
  assert.equal(warrior.y, 1);
  assert.equal(state.activation.moved, false);

  state = must(state, cmd.moveUnit(1, "p1-warrior", 1, 4));
  assert.equal(state.units.find((u) => u.id === "p1-warrior").y, 4);
});

test("cancel move then attack from the original tile", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 2, 1));
  state = must(state, cmd.cancelMove(1, "p1-warrior"));
  // Back at (4,1) the tank is adjacent again.
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  assert.equal(state.activation.primaryUsed, true);
});

test("cancel move then defend", () => {
  let state = makeMatch([unit("p1-warrior", 1, "warrior", 1, 1)]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 3, 1));
  state = must(state, cmd.cancelMove(1, "p1-warrior"));
  state = must(state, cmd.defend(1, "p1-warrior"));
  assert.equal(state.units.find((u) => u.id === "p1-warrior").defending, true);
  assert.equal(state.units.find((u) => u.id === "p1-warrior").x, 1);
});

test("cancel after a primary action is rejected", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 4, 2));
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));

  const result = applyCommand(state, cmd.cancelMove(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.PRIMARY_ALREADY_USED);
});

test("cancel after attack-then-move is rejected (activation complete)", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  state = must(state, cmd.moveUnit(1, "p1-warrior", 4, 4));

  const result = applyCommand(state, cmd.cancelMove(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.PRIMARY_ALREADY_USED);
});

test("cancel without a prior move is rejected", () => {
  let state = makeMatch([unit("p1-warrior", 1, "warrior", 1, 1)]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));

  const result = applyCommand(state, cmd.cancelMove(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.CANCEL_NOT_AVAILABLE);
});

test("cancel cannot restore a spent unit (no open activation)", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p1-tank", 1, "tank", 5, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  state = must(state, cmd.defend(1, "p1-warrior"));
  state = must(state, cmd.finishActivation(1, "p1-warrior"));

  const result = applyCommand(state, cmd.cancelMove(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.NO_ACTIVATION);
});

// --- targeting and combat through the reducer --------------------------------

test("attack out of range is rejected", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p2-tank", 2, "tank", 8, 8),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-warrior"));

  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.TARGET_OUT_OF_RANGE);
});

test("ranger shot through a blocker is rejected", () => {
  let state = makeMatch([
    unit("p1-ranger", 1, "ranger", 1, 1),
    unit("p1-tank", 1, "tank", 2, 2),
    unit("p2-ranger", 2, "ranger", 4, 4),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-ranger"));

  const result = applyCommand(state, cmd.attack(1, "p1-ranger", "p2-ranger"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.TARGET_BLOCKED);
});

test("healing an enemy or a full-health ally is rejected", () => {
  let state = makeMatch([
    unit("p1-medic", 1, "medic", 1, 1),
    unit("p1-tank", 1, "tank", 2, 1),
    unit("p2-tank", 2, "tank", 3, 1, { hp: 5 }),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-medic"));

  const enemy = applyCommand(state, cmd.heal(1, "p1-medic", "p2-tank"));
  assert.equal(enemy.errorCode, ERR.INVALID_TARGET);

  const fullHealth = applyCommand(state, cmd.heal(1, "p1-medic", "p1-tank"));
  assert.equal(fullHealth.errorCode, ERR.INVALID_TARGET);
});

test("medic may heal itself", () => {
  let state = makeMatch([
    unit("p1-medic", 1, "medic", 1, 1, { hp: 4 }),
  ], { seed: NORMAL_HIT });
  state = must(state, cmd.beginActivation(1, "p1-medic"));
  state = must(state, cmd.heal(1, "p1-medic", "p1-medic"));
  assert.ok(state.units[0].hp > 4);
});

test("a critical attack adds one damage", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-medic", 2, "medic", 5, 1),
  ], { seed: CRIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  const event = result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(event.critical, true);
  assert.equal(event.damage, 4); // warrior 3 + crit 1
});

test("a roll of one misses", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-medic", 2, "medic", 5, 1),
  ], { seed: MISS });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  const event = result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(event.hit, false);
  assert.equal(result.nextState.units.find((u) => u.id === "p2-medic").hp, 10);
});

// --- turn flow and victory ---------------------------------------------------

test("the squad turn changes only when every living unit is spent", () => {
  let state = makeMatch([
    unit("p1-a", 1, "warrior", 1, 1),
    unit("p1-b", 1, "tank", 2, 1),
    unit("p2-a", 2, "warrior", 8, 8),
  ]);

  state = must(state, cmd.beginActivation(1, "p1-a"));
  state = must(state, cmd.defend(1, "p1-a"));
  state = must(state, cmd.finishActivation(1, "p1-a"));
  assert.equal(state.currentPlayer, 1); // p1-b still unspent

  state = must(state, cmd.beginActivation(1, "p1-b"));
  state = must(state, cmd.guard(1, "p1-b", "p1-b"));
  state = must(state, cmd.finishActivation(1, "p1-b"));
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.turnNumber, 2);
});

test("eliminating the last enemy unit ends the match", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-medic", 2, "medic", 5, 1, { hp: 3 }),
  ], { seed: NORMAL_HIT });

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  assert.equal(result.nextState.phase, "complete");
  assert.equal(result.nextState.winner, 1);
  assert.equal(result.nextState.victoryReason, "squad-eliminated");
  assert.ok(result.events.some((e) => e.type === EVENTS.MATCH_COMPLETE));
});

test("commands are rejected after the match is complete", () => {
  // Conceding drops the player's units; with only the opponent left standing,
  // the surviving team wins and further commands are rejected.
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 1, 1),
    unit("p2-warrior", 2, "warrior", 8, 8),
  ]);
  state = must(state, cmd.concede(1));
  assert.equal(state.winner, 2);
  assert.equal(state.phase, "complete");

  const result = applyCommand(state, cmd.beginActivation(1, "p1-warrior"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.MATCH_COMPLETE);
});

test("defending reduces the next incoming hit", () => {
  // p2 tank defends, then on p1's turn a warrior attacks it for 2 - 1 = 1.
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p2-tank", 2, "tank", 5, 1),
    unit("p1-extra", 1, "tank", 9, 9, { spent: true }),
    unit("p2-extra", 2, "warrior", 0, 9),
  ], { seed: NORMAL_HIT });

  // Hand the turn to p2 so the tank can defend, then back to p1.
  state.currentPlayer = 2;
  state = must(state, cmd.beginActivation(2, "p2-tank"));
  state = must(state, cmd.guard(2, "p2-tank", "p2-tank"));
  state = must(state, cmd.finishActivation(2, "p2-tank"));
  state = must(state, cmd.beginActivation(2, "p2-extra"));
  state = must(state, cmd.defend(2, "p2-extra"));
  state = must(state, cmd.finishActivation(2, "p2-extra"));
  assert.equal(state.currentPlayer, 1);

  const tankBefore = state.units.find((u) => u.id === "p2-tank");
  assert.equal(tankBefore.defending, true);

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  const event = result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED);
  // Warrior deals 2 to a tank; defense knocks it to 1 (assuming non-crit seed).
  assert.equal(event.defended, true);
  assert.equal(event.damage, 1);
});

// --- tank guard -------------------------------------------------------------

test("tank can guard itself instead of using normal defend", () => {
  let state = makeMatch([
    unit("p1-tank", 1, "tank", 5, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-tank"));

  const defend = applyCommand(state, cmd.defend(1, "p1-tank"));
  assert.equal(defend.accepted, false);
  assert.equal(defend.errorCode, ERR.DEFEND_NOT_AVAILABLE);

  const result = applyCommand(state, cmd.guard(1, "p1-tank", "p1-tank"));
  assert.equal(result.accepted, true);
  const tank = result.nextState.units.find((u) => u.id === "p1-tank");
  assert.equal(tank.guardTargetId, "p1-tank");
  assert.equal(tank.defending, true);
  assert.ok(result.events.some((e) => e.type === EVENTS.UNIT_GUARDED && e.selfGuard));
});

test("only tanks can guard adjacent living allies", () => {
  let state = makeMatch([
    unit("p1-tank", 1, "tank", 5, 5),
    unit("p1-medic", 1, "medic", 6, 6),
    unit("p1-ranger", 1, "ranger", 8, 8),
    unit("p2-warrior", 2, "warrior", 5, 6),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-tank"));

  assert.equal(
    applyCommand(state, cmd.guard(1, "p1-tank", "p1-ranger")).errorCode,
    ERR.TARGET_OUT_OF_RANGE,
  );
  assert.equal(
    applyCommand(state, cmd.guard(1, "p1-tank", "p2-warrior")).errorCode,
    ERR.INVALID_TARGET,
  );

  const guarded = applyCommand(state, cmd.guard(1, "p1-tank", "p1-medic"));
  assert.equal(guarded.accepted, true);
  assert.equal(
    guarded.nextState.units.find((u) => u.id === "p1-tank").guardTargetId,
    "p1-medic",
  );
  assert.equal(
    guarded.nextState.units.find((u) => u.id === "p1-tank").defending,
    false,
  );

  let nonTank = makeMatch([
    unit("p1-warrior", 1, "warrior", 5, 5),
    unit("p1-medic", 1, "medic", 6, 5),
  ]);
  nonTank = must(nonTank, cmd.beginActivation(1, "p1-warrior"));
  const rejected = applyCommand(nonTank, cmd.guard(1, "p1-warrior", "p1-medic"));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.errorCode, ERR.GUARD_TANK_ONLY);
});

test("external guard redirects the declared attack to the tank and is consumed", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 5),
    unit("p2-tank", 2, "tank", 6, 6),
    unit("p2-medic", 2, "medic", 5, 5, { spent: true }),
    unit("p1-extra", 1, "tank", 9, 9, { spent: true }),
    unit("p2-extra", 2, "tank", 0, 9, { spent: true }),
  ], { seed: NORMAL_HIT });

  state.currentPlayer = 2;
  state = must(state, cmd.beginActivation(2, "p2-tank"));
  state = must(state, cmd.guard(2, "p2-tank", "p2-medic"));
  state = must(state, cmd.finishActivation(2, "p2-tank"));
  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  assert.equal(result.accepted, true);

  const event = result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(event.declaredTargetId, "p2-medic");
  assert.equal(event.targetId, "p2-tank");
  assert.equal(event.intercepted, true);
  assert.equal(event.guardingTankId, "p2-tank");
  assert.equal(event.defended, true);
  assert.equal(event.damage, 1); // warrior vs tank is 2, intercepted guard reduces by 1
  assert.ok(result.events.some((e) => e.type === EVENTS.GUARD_INTERCEPTED));

  const nextTank = result.nextState.units.find((u) => u.id === "p2-tank");
  const nextMedic = result.nextState.units.find((u) => u.id === "p2-medic");
  assert.equal(nextTank.hp, 9);
  assert.equal(nextMedic.hp, 10);
  assert.equal(nextTank.guardTargetId, null);
});

test("external guard is consumed on a miss", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 4, 5),
    unit("p2-tank", 2, "tank", 6, 6),
    unit("p2-medic", 2, "medic", 5, 5),
  ], { seed: MISS });
  state.currentPlayer = 2;
  state = must(state, cmd.beginActivation(2, "p2-tank"));
  state = must(state, cmd.guard(2, "p2-tank", "p2-medic"));
  state = must(state, cmd.finishActivation(2, "p2-tank"));
  state.currentPlayer = 1;
  state = must(state, cmd.beginActivation(1, "p1-warrior"));

  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  assert.equal(result.accepted, true);
  assert.equal(result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED).hit, false);
  assert.equal(result.nextState.units.find((u) => u.id === "p2-tank").guardTargetId, null);
});

test("direct attacks against an externally guarding tank are not reduced", () => {
  let state = makeMatch([
    unit("p1-warrior", 1, "warrior", 5, 6),
    unit("p2-tank", 2, "tank", 6, 6),
    unit("p2-medic", 2, "medic", 5, 5),
  ], { seed: NORMAL_HIT });
  state.currentPlayer = 2;
  state = must(state, cmd.beginActivation(2, "p2-tank"));
  state = must(state, cmd.guard(2, "p2-tank", "p2-medic"));
  state = must(state, cmd.finishActivation(2, "p2-tank"));
  state.currentPlayer = 1;
  state = must(state, cmd.beginActivation(1, "p1-warrior"));

  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  const event = result.events.find((e) => e.type === EVENTS.ATTACK_RESOLVED);
  assert.equal(event.intercepted, false);
  assert.equal(event.defended, false);
  assert.equal(event.damage, 2);
});

test("guard clears when units separate, die, or the tank activates again", () => {
  let state = makeMatch([
    unit("p1-tank", 1, "tank", 5, 5),
    unit("p1-medic", 1, "medic", 6, 5),
    unit("p2-warrior", 2, "warrior", 9, 9),
  ], { seed: NORMAL_HIT });
  state = must(state, cmd.beginActivation(1, "p1-tank"));
  state = must(state, cmd.guard(1, "p1-tank", "p1-medic"));
  state = must(state, cmd.finishActivation(1, "p1-tank"));
  state = must(state, cmd.beginActivation(1, "p1-medic"));
  state = must(state, cmd.moveUnit(1, "p1-medic", 7, 5));
  assert.equal(state.units.find((u) => u.id === "p1-tank").guardTargetId, null);

  state = makeMatch([
    unit("p1-tank", 1, "tank", 5, 5),
    unit("p1-medic", 1, "medic", 6, 5),
    unit("p2-warrior", 2, "warrior", 7, 4),
  ], { seed: NORMAL_HIT });
  state = must(state, cmd.beginActivation(1, "p1-tank"));
  state = must(state, cmd.guard(1, "p1-tank", "p1-medic"));
  state = must(state, cmd.finishActivation(1, "p1-tank"));
  state = must(state, cmd.beginActivation(1, "p1-medic"));
  state = must(state, cmd.moveUnit(1, "p1-medic", 6, 4));
  assert.equal(state.units.find((u) => u.id === "p1-tank").guardTargetId, "p1-medic");

  state.currentPlayer = 2;
  state.activation = null;
  state = must(state, cmd.beginActivation(2, "p2-warrior"));
  state = must(state, cmd.attack(2, "p2-warrior", "p1-medic"));
  assert.equal(state.units.find((u) => u.id === "p1-tank").guardTargetId, null);

  state.currentPlayer = 1;
  state.activation = null;
  state.units.find((u) => u.id === "p1-tank").spent = false;
  state.units.find((u) => u.id === "p1-tank").guardTargetId = "p1-tank";
  state.units.find((u) => u.id === "p1-tank").defending = true;
  state = must(state, cmd.beginActivation(1, "p1-tank"));
  const tank = state.units.find((u) => u.id === "p1-tank");
  assert.equal(tank.guardTargetId, null);
  assert.equal(tank.defending, false);
});

test("one ally cannot be externally guarded by two tanks", () => {
  let state = makeMatch([
    unit("p1-tank-a", 1, "tank", 5, 5),
    unit("p1-tank-b", 1, "tank", 5, 6),
    unit("p1-medic", 1, "medic", 6, 5),
  ]);
  state = must(state, cmd.beginActivation(1, "p1-tank-a"));
  state = must(state, cmd.guard(1, "p1-tank-a", "p1-medic"));
  state.activation = null;
  state = must(state, cmd.beginActivation(1, "p1-tank-b"));

  const result = applyCommand(state, cmd.guard(1, "p1-tank-b", "p1-medic"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.TARGET_ALREADY_GUARDED);
});
