import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation, concede, defend, finishActivation } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { areAllies, areEnemies } from "../src/core/state.js";
import { hashState } from "../src/core/state-hash.js";
import { createMatchState, teamOf } from "../src/match/matchBuilder.js";
import { DEFAULT_SQUAD } from "../src/ui/squadPicker.js";

function must(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `${command.type} should be accepted`);
  return result.nextState;
}

function firstLivingUnit(state, player) {
  return state.units.find((unit) => unit.player === player && unit.hp > 0);
}

test("four-player 2v2 assigns odd seats against even seats", () => {
  const state = createMatchState({ size: 13, playerCount: 4, format: "teams" });

  assert.deepEqual(state.turnOrder, [1, 2, 3, 4]);
  assert.equal(teamOf(state, 1), 1);
  assert.equal(teamOf(state, 3), 1);
  assert.equal(teamOf(state, 2), 2);
  assert.equal(teamOf(state, 4), 2);
  assert.equal(areAllies(firstLivingUnit(state, 1), firstLivingUnit(state, 3)), true);
  assert.equal(areEnemies(firstLivingUnit(state, 1), firstLivingUnit(state, 2)), true);
});

test("four-player matches spawn four squads without overlapping tiles", () => {
  const state = createMatchState({ size: 13, playerCount: 4, format: "teams" });

  assert.equal(state.units.length, 16);
  const tiles = new Set(state.units.map((unit) => `${unit.position.x},${unit.position.y}`));
  assert.equal(tiles.size, state.units.length);
});

test("2v2 turn order skips a fully eliminated seat but keeps that seat's ally alive", () => {
  let state = createMatchState({ size: 13, playerCount: 4, format: "teams" });
  state.currentPlayer = 1;
  const unit = firstLivingUnit(state, 1);
  for (const other of state.units) {
    if (other.player === 2) other.hp = 0;
    if (other.player === 1 && other.id !== unit.id) other.hp = 0;
    if (other.player !== 1) other.spent = false;
  }
  state = must(state, beginActivation(1, unit.id));
  state = must(state, defend(1, unit.id));
  state = must(state, finishActivation(1, unit.id));

  assert.equal(state.phase, "playing");
  assert.equal(state.currentPlayer, 3);
});

test("2v2 concede ends only after the whole enemy team is gone", () => {
  let state = createMatchState({ size: 13, playerCount: 4, format: "teams" });

  state = must(state, concede(2));
  assert.equal(state.phase, "playing");
  assert.equal(state.winner, null);

  state = must(state, concede(4));
  assert.equal(state.phase, "complete");
  assert.equal(state.winner, 1);
});

test("four online clients build the same 2v2 lockstep state hash", () => {
  const squads = { 1: DEFAULT_SQUAD, 2: DEFAULT_SQUAD, 3: DEFAULT_SQUAD, 4: DEFAULT_SQUAD };
  const clients = [1, 2, 3, 4].map((seat) => ({
    seat,
    match: createMatchState({
      size: 13,
      seed: 42,
      squads,
      playerCount: 4,
      format: "teams",
      teamColors: { 1: "#5288c6", 2: "#c4463f" },
    }),
  }));

  const ref = hashState(clients[0].match);
  for (const client of clients) assert.equal(hashState(client.match), ref, `seat ${client.seat} hash`);
});
