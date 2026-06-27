import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, cloneState, getTileObject, isWallAt } from "../src/core/state.js";
import { getLegalMoves } from "../src/rules/movement.js";
import { isWallBetween } from "../src/rules/combat.js";
import { getFootworkStepOptions, getLegalFleeTiles, getSummonPlacementTiles, validateFootworkPath } from "../src/rules/arts.js";
import { getArt } from "../src/core/unitCatalog.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, attackTile, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";

// Run a full turn for player 1's lone unit so the turn rolls over to player 2,
// firing the board-hazard tick. Returns the post-rollover state.
function rolloverAfterP1(state, unitId = "p1") {
  let s = applyCommand(state, beginActivation(1, unitId)).nextState;
  s = applyCommand(s, defend(1, unitId)).nextState;
  return applyCommand(s, finishActivation(1, unitId)).nextState;
}

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

// A wall on (1,0) sits between a shooter at (0,0) and a mark at (2,0).
function walledLane(extraUnits = []) {
  return createBattleState({
    units: [
      { id: "shooter", player: 1, type: "archer", x: 0, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 },
      ...extraUnits
    ],
    tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }]
  });
}

test("createBattleState stores tile objects keyed by tile, with a default HP", () => {
  const state = createBattleState({ tileObjects: [{ x: 1, y: 0, kind: "wall" }] });
  assert.deepEqual(getTileObject(state, { x: 1, y: 0 }), { kind: "wall", hp: 1 });
  assert.equal(isWallAt(state, { x: 1, y: 0 }), true);
  assert.equal(isWallAt(state, { x: 2, y: 0 }), false);
});

test("cloneState deep-copies tile objects so mutations don't leak across clones", () => {
  const state = createBattleState({ tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }] });
  const clone = cloneState(state);
  clone.tileObjects["1,0"].hp = 0;
  assert.equal(state.tileObjects["1,0"].hp, 1); // original untouched
});

test("a wall blocks movement onto and through its tile", () => {
  const open = createBattleState({ units: [{ id: "mover", player: 1, type: "archer", x: 0, y: 0 }] });
  const mover = open.units[0];
  assert.equal(getLegalMoves(open, mover).has("1,0"), true);
  assert.equal(getLegalMoves(open, mover).has("2,0"), true);

  const walled = createBattleState({
    units: [{ id: "mover", player: 1, type: "archer", x: 0, y: 0 }],
    tileObjects: [{ x: 1, y: 0, kind: "wall" }]
  });
  const legal = getLegalMoves(walled, walled.units[0]);
  assert.equal(legal.has("1,0"), false); // can't stand on the wall
  assert.equal(legal.has("2,0"), false); // can't path through it within range
});

test("isWallBetween blocks a line through a wall, but a piercing Sniper ignores it", () => {
  const state = walledLane();
  assert.equal(isWallBetween(state, { x: 0, y: 0 }, { x: 2, y: 0 }), true);
  assert.equal(isWallBetween(state, { x: 0, y: 0 }, { x: 2, y: 0 }, { type: "sniper" }), false);

  const clear = createBattleState({ tileObjects: [] });
  assert.equal(isWallBetween(clear, { x: 0, y: 0 }, { x: 2, y: 0 }), false);
});

test("a wall blocks a basic ranged attack", () => {
  const begun = applyCommand(walledLane(), beginActivation(1, "shooter"));
  const result = applyCommand(begun.nextState, attack(1, "shooter", "mark", NORMAL_HIT));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "TARGET_OBSTRUCTED");
});

test("a Sniper shoots through a wall (Rifle Powered pierces cover)", () => {
  const state = createBattleState({
    units: [
      { id: "sniper", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
    ],
    tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }]
  });
  const begun = applyCommand(state, beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, attack(1, "sniper", "mark", NORMAL_HIT));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((u) => u.id === "mark").hp, 21); // 25 - (3+1)
});

test("a wall blocks a MAGIC ART too (unlike a unit body)", () => {
  const state = createBattleState({
    units: [
      { id: "mage", player: 1, type: "magician", x: 0, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
    ],
    tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }]
  });
  const begun = applyCommand(state, beginActivation(1, "mage"));
  const result = applyCommand(begun.nextState, useArt(1, "mage", "spark", { targetId: "mark", ...NORMAL_HIT }));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "TARGET_OBSTRUCTED");
});

test("a wall blocks movement ARTs — Footwork can't step onto or through it", () => {
  const state = createBattleState({
    units: [{ id: "sword", player: 1, type: "swordsman", x: 0, y: 0 }],
    tileObjects: [{ x: 1, y: 0, kind: "wall" }]
  });
  const sword = state.units[0];
  // A straight path east runs into the wall on (1,0).
  assert.equal(validateFootworkPath(state, sword, [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }]), false);
  // And the wall tile is not offered as a Footwork step option.
  assert.equal(getFootworkStepOptions(state, sword, []).has("1,0"), false);
});

test("Flee and Summon Ghoul placement both exclude a wall tile", () => {
  const fleeState = createBattleState({
    units: [{ id: "mage", player: 1, type: "magician", x: 5, y: 5 }],
    tileObjects: [{ x: 5, y: 6, kind: "wall" }]
  });
  assert.equal(getLegalFleeTiles(fleeState, fleeState.units[0]).has("5,6"), false);

  const necroState = createBattleState({
    units: [{ id: "necro", player: 1, type: "necromancer", x: 5, y: 5 }],
    tileObjects: [{ x: 5, y: 6, kind: "wall" }]
  });
  const necro = necroState.units[0];
  assert.equal(getSummonPlacementTiles(necroState, necro, getArt("necromancer", "summon-ghoul")).has("5,6"), false);
});

test("a unit can attack and destroy an adjacent wall, spending its primary", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2", player: 2, type: "swordsman", x: 9, y: 9 }
    ],
    tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }]
  });
  const begun = applyCommand(state, beginActivation(1, "p1"));
  const result = applyCommand(begun.nextState, attackTile(1, "p1", 1, 0));
  assert.equal(result.accepted, true);
  assert.equal(result.events[0].type, "WALL_ATTACKED");
  assert.equal(result.events[0].destroyed, true);
  assert.equal(result.nextState.tileObjects["1,0"], undefined);
  assert.equal(result.nextState.activation.primaryUsed, true);
});

test("a Sniper can shoot a wall behind another body (pierce), but a normal unit can't reach a covered wall", () => {
  // A wall at (3,0); an enemy body at (1,0) sits between a shooter at (0,0) and it.
  const make = (type) => createBattleState({
    units: [
      { id: "shooter", player: 1, type, x: 0, y: 0 },
      { id: "body", player: 2, type: "swordsman", x: 1, y: 0 }
    ],
    tileObjects: [{ x: 3, y: 0, kind: "wall", hp: 1 }]
  });

  const archer = applyCommand(make("archer"), beginActivation(1, "shooter"));
  const archerShot = applyCommand(archer.nextState, attackTile(1, "shooter", 3, 0));
  assert.equal(archerShot.accepted, false);
  assert.equal(archerShot.errorCode, "TARGET_OBSTRUCTED");

  const sniper = applyCommand(make("sniper"), beginActivation(1, "shooter"));
  const sniperShot = applyCommand(sniper.nextState, attackTile(1, "shooter", 3, 0));
  assert.equal(sniperShot.accepted, true);
  assert.equal(sniperShot.nextState.tileObjects["3,0"], undefined);
});

test("attacking a tile with no wall is rejected", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "p1"));
  const result = applyCommand(begun.nextState, attackTile(1, "p1", 1, 0));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "INVALID_TARGET");
});

test("fire burns a unit standing on it at the rollover and counts down", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2", player: 2, type: "swordsman", x: 5, y: 5 }
    ],
    tileObjects: [{ x: 5, y: 5, kind: "fire", turnsLeft: 3 }]
  });
  const s = rolloverAfterP1(state);
  assert.equal(s.units.find((u) => u.id === "p2").hp, 24); // 25 - 1 true damage
  assert.equal(s.tileObjects["5,5"].turnsLeft, 2);
});

test("fire burns whoever stands on it — friend included", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 }, // its owner stands on the fire
      { id: "p2", player: 2, type: "swordsman", x: 5, y: 5 }
    ],
    tileObjects: [{ x: 0, y: 0, kind: "fire", turnsLeft: 3 }]
  });
  const s = rolloverAfterP1(state);
  assert.equal(s.units.find((u) => u.id === "p1").hp, 24); // own unit burns too
});

test("a fire burn surfaces a FIRE_DAMAGE event for the view to animate", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2", player: 2, type: "swordsman", x: 5, y: 5 }
    ],
    tileObjects: [{ x: 5, y: 5, kind: "fire", turnsLeft: 3 }]
  });
  let s = applyCommand(state, beginActivation(1, "p1")).nextState;
  s = applyCommand(s, defend(1, "p1")).nextState;
  const finished = applyCommand(s, finishActivation(1, "p1"));
  const burn = finished.events.find((e) => e.type === "FIRE_DAMAGE");
  assert.ok(burn, "rollover should surface a FIRE_DAMAGE event");
  assert.equal(burn.unitId, "p2");
  assert.deepEqual(burn.position, { x: 5, y: 5 });
  assert.equal(burn.damage, 1);
  // The event is presentation-only — it must not linger on the returned state.
  assert.equal(finished.nextState.pendingRolloverEvents, undefined);
});

test("fire is removed once its turns run out", () => {
  const state = createBattleState({
    units: [
      { id: "p1", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2", player: 2, type: "swordsman", x: 5, y: 5 }
    ],
    tileObjects: [{ x: 3, y: 3, kind: "fire", turnsLeft: 1 }] // empty tile
  });
  const s = rolloverAfterP1(state);
  assert.equal(s.tileObjects["3,3"], undefined);
});

test("a wall blocks a pure status cast (Silence)", () => {
  const state = createBattleState({
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
    ],
    tileObjects: [{ x: 1, y: 0, kind: "wall", hp: 1 }]
  });
  const begun = applyCommand(state, beginActivation(1, "mystic"));
  const result = applyCommand(begun.nextState, useArt(1, "mystic", "silence", { targetId: "mark", effectRoll: 0.1 }));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "TARGET_OBSTRUCTED");
});
