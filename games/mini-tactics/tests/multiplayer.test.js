import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { createRoster, FORMATS } from "../src/core/roster.js";
import { applyCommand } from "../src/core/reducer.js";
import { teamOf, sameTeam } from "../src/state/gameState.js";
import { createRngState, rollD6 } from "../src/core/rng.js";
import { ERR } from "../src/core/errors.js";
import { EVENTS } from "../src/core/events.js";
import * as cmd from "../src/core/commands.js";

// --- deterministic dice helpers ----------------------------------------------

function firstRoll(seed) {
  return rollD6(createRngState(seed)).roll;
}

// Find a seed whose first authoritative roll matches a predicate, so combat
// outcomes in these tests are exact rather than probabilistic.
function seedForFirstRoll(predicate) {
  for (let seed = 1; seed < 200000; seed += 1) {
    if (predicate(firstRoll(seed))) return seed;
  }
  throw new Error("no seed found");
}

const NORMAL_HIT = seedForFirstRoll((roll) => roll >= 2 && roll <= 5);
const CRIT = seedForFirstRoll((roll) => roll === 6);

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
    ...extra,
  };
}

// Build a match with a real roster, then hand-place units so each test isolates
// one rule. The roster (players/turnOrder) comes from createMatchState; only the
// unit layout is overridden.
function makeMatch(opts, units) {
  const state = createMatchState({ size: 13, seed: 1, ...opts });
  state.units = units;
  return state;
}

function must(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `expected accept for ${command.type}`);
  return result.nextState;
}

// Spend a player's whole (single-unit) turn so the clock advances.
function takeTurn(state, player) {
  state = must(state, cmd.beginActivation(player, `p${player}-tank`));
  state = must(state, cmd.defend(player, `p${player}-tank`));
  state = must(state, cmd.finishActivation(player, `p${player}-tank`));
  return state;
}

// --- roster + spawns ---------------------------------------------------------

test("a four-player free-for-all builds four squads in four distinct corners", () => {
  const state = createMatchState({ size: 13, playerCount: 4, format: "ffa" });

  assert.equal(state.units.length, 16); // 4 squads x 4 units
  assert.deepEqual(state.turnOrder, [1, 2, 3, 4]);
  assert.equal(state.currentPlayer, 1);

  // Every player is its own team in FFA.
  for (const slot of state.players) {
    assert.equal(slot.team, slot.id);
  }

  // No two units share a tile.
  const tiles = new Set(state.units.map((u) => `${u.x},${u.y}`));
  assert.equal(tiles.size, state.units.length);

  // Each squad sits near a different corner (its tank's quadrant is unique).
  const max = state.size - 1;
  const quadrants = new Set();
  for (let id = 1; id <= 4; id += 1) {
    const tank = state.units.find((u) => u.id === `p${id}-tank`);
    quadrants.add(`${tank.x < max / 2 ? "L" : "R"}${tank.y < max / 2 ? "T" : "B"}`);
  }
  assert.equal(quadrants.size, 4);
});

test("the default two-player match is unchanged (roster + classic placement)", () => {
  const state = createMatchState({ size: 10 });

  assert.deepEqual(state.turnOrder, [1, 2]);
  assert.equal(state.players.length, 2);

  // Original P1/P2 corner coordinates are preserved exactly.
  const p1tank = state.units.find((u) => u.id === "p1-tank");
  const p2tank = state.units.find((u) => u.id === "p2-tank");
  assert.deepEqual({ x: p1tank.x, y: p1tank.y }, { x: 1, y: 8 });
  assert.deepEqual({ x: p2tank.x, y: p2tank.y }, { x: 8, y: 1 });
});

// --- team assignment ---------------------------------------------------------

test("a 2v2 roster pairs odd seats vs even seats on shared diagonals", () => {
  const roster = createRoster({ playerCount: 4, format: FORMATS.TEAMS });

  assert.equal(roster[0].team, 1); // P1
  assert.equal(roster[1].team, 2); // P2
  assert.equal(roster[2].team, 1); // P3
  assert.equal(roster[3].team, 2); // P4

  // Allies sit on opposite corners; seat order still alternates teams.
  assert.equal(roster[0].corner, 0); // P1
  assert.equal(roster[2].corner, 1); // P3 — diagonal from P1
  assert.equal(roster[1].corner, 2); // P2
  assert.equal(roster[3].corner, 3); // P4 — diagonal from P2
});

test("teamOf and sameTeam read the roster, not the player id", () => {
  const state = createMatchState({ playerCount: 4, format: "teams", size: 13 });

  assert.equal(teamOf(state, 1), 1);
  assert.equal(teamOf(state, 3), 1);
  assert.equal(teamOf(state, 2), 2);

  assert.equal(sameTeam(state, 1, 3), true); // allies, different player slots
  assert.equal(sameTeam(state, 1, 2), false);
});

// --- turn rotation -----------------------------------------------------------

test("seat order rotates through all four players and wraps", () => {
  let state = makeMatch(
    { playerCount: 4, format: "ffa" },
    [
      unit("p1-tank", 1, "tank", 0, 0),
      unit("p2-tank", 2, "tank", 12, 0),
      unit("p3-tank", 3, "tank", 0, 12),
      unit("p4-tank", 4, "tank", 12, 12),
    ]
  );

  state = takeTurn(state, 1);
  assert.equal(state.currentPlayer, 2);
  state = takeTurn(state, 2);
  assert.equal(state.currentPlayer, 3);
  state = takeTurn(state, 3);
  assert.equal(state.currentPlayer, 4);
  state = takeTurn(state, 4);
  assert.equal(state.currentPlayer, 1); // wrapped
});

test("an eliminated player is skipped in the turn order", () => {
  let state = makeMatch(
    { playerCount: 4, format: "ffa" },
    [
      unit("p1-tank", 1, "tank", 0, 0),
      unit("p2-tank", 2, "tank", 12, 0, { hp: 0 }), // already eliminated
      unit("p3-tank", 3, "tank", 0, 12),
      unit("p4-tank", 4, "tank", 12, 12),
    ]
  );

  state = takeTurn(state, 1);
  assert.equal(state.currentPlayer, 3); // 2 is dead, skip to 3
});

// --- team friend/foe ---------------------------------------------------------

test("a unit cannot attack a teammate owned by a different player", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams" },
    [
      unit("p1-warrior", 1, "warrior", 5, 5),
      unit("p3-tank", 3, "tank", 6, 5), // ally (team 1), adjacent
    ]
  );

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p3-tank"));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, ERR.INVALID_TARGET);
});

test("a medic can heal a wounded teammate owned by a different player", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams", seed: NORMAL_HIT },
    [
      unit("p1-medic", 1, "medic", 5, 5),
      unit("p3-tank", 3, "tank", 6, 5, { hp: 4 }), // ally, wounded, in range
    ]
  );

  state = must(state, cmd.beginActivation(1, "p1-medic"));
  state = must(state, cmd.heal(1, "p1-medic", "p3-tank"));
  assert.ok(state.units.find((u) => u.id === "p3-tank").hp > 4);
});

test("an enemy on a different team is still a legal attack target", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams", seed: NORMAL_HIT },
    [
      unit("p1-warrior", 1, "warrior", 5, 5),
      unit("p2-tank", 2, "tank", 6, 5), // team 2 enemy, adjacent
    ]
  );

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-tank"));
  assert.equal(result.accepted, true);
});

// --- victory by last team standing -------------------------------------------

test("the match continues while any player on the losing team is alive", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams", seed: CRIT },
    [
      unit("p1-warrior", 1, "warrior", 5, 5),
      unit("p2-medic", 2, "medic", 6, 5, { hp: 3 }), // team 2, about to die
      unit("p4-tank", 4, "tank", 0, 0), // team 2, far away, still alive
    ]
  );

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.phase, "playing"); // P4 keeps team 2 alive
  assert.equal(result.nextState.winner, null);
});

test("eliminating the last unit of the last enemy team wins for the survivors", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams", seed: CRIT },
    [
      unit("p1-warrior", 1, "warrior", 5, 5), // team 1
      unit("p2-medic", 2, "medic", 6, 5, { hp: 3 }), // team 2, last unit
    ]
  );

  state = must(state, cmd.beginActivation(1, "p1-warrior"));
  const result = applyCommand(state, cmd.attack(1, "p1-warrior", "p2-medic"));
  assert.equal(result.nextState.phase, "complete");
  assert.equal(result.nextState.winner, 1); // team 1
  assert.equal(result.nextState.victoryReason, "squad-eliminated");
});

// --- concede drop-out --------------------------------------------------------

test("conceding in free-for-all drops the player and continues the match", () => {
  let state = makeMatch(
    { playerCount: 4, format: "ffa" },
    [
      unit("p1-tank", 1, "tank", 0, 0),
      unit("p2-tank", 2, "tank", 12, 0),
      unit("p3-tank", 3, "tank", 0, 12),
      unit("p4-tank", 4, "tank", 12, 12),
    ]
  );

  const result = applyCommand(state, cmd.concede(1));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.phase, "playing");
  assert.equal(result.nextState.winner, null);
  assert.equal(result.nextState.units.find((u) => u.id === "p1-tank").hp, 0);
  assert.equal(result.nextState.currentPlayer, 2); // turn passed off the quitter
  assert.ok(result.events.some((e) => e.type === EVENTS.PLAYER_CONCEDED));
});

test("conceding down to one surviving team ends the match", () => {
  let state = makeMatch(
    { playerCount: 4, format: "teams" },
    [
      unit("p1-tank", 1, "tank", 0, 0), // team 1
      unit("p3-tank", 3, "tank", 0, 12), // team 1 ally
      unit("p2-tank", 2, "tank", 12, 0), // team 2
      unit("p4-tank", 4, "tank", 12, 12), // team 2
    ]
  );

  // Both team-2 players concede; team 1 is the last team standing.
  state = must(state, cmd.concede(2));
  assert.equal(state.phase, "playing"); // P4 still holds team 2
  const result = applyCommand(state, cmd.concede(4));
  assert.equal(result.nextState.phase, "complete");
  assert.equal(result.nextState.winner, 1);
  assert.equal(result.nextState.victoryReason, "concede");
});
