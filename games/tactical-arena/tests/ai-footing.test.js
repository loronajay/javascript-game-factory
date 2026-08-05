import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { focusedThreat, footingBaseline, footingValue, incomingStrikes, incomingThreat, tileHazardCost } from "../src/ai/evaluate.js";

// Footing: what the tile a CPU unit STOPS on costs it (rollover hazards) and what that
// ground is worth to its own kit (tile affinity). The engine grew both long after the
// planner was written; these lock in that the CPU can now see them.
//
// The default board is a checkerboard: (x + y) even is light, odd is dark.

function replay(state, commands) {
  let s = state;
  for (const command of commands) {
    const result = applyCommand(s, command);
    assert.ok(result.accepted, `${command.type} rejected (${result.errorCode})`);
    s = result.nextState;
  }
  return s;
}

function landing(state, unitId, difficulty) {
  const commands = chooseActivation(state, { difficulty, cpuPlayer: 2, rng: cpuRng(state) });
  const after = replay(state, commands);
  const unit = findUnit(after, unitId);
  return { after, unit, position: unit.position };
}

function adjacentEnemies(state, unit) {
  return state.units.filter((other) =>
    other.player !== unit.player && other.hp > 0 &&
    Math.max(Math.abs(other.position.x - unit.position.x), Math.abs(other.position.y - unit.position.y)) <= 1).length;
}

// --- rollover hazards -------------------------------------------------------

test("a burning tile costs its occupant the fire tick, and nothing to a fire-immune unit", () => {
  const state = createBattleState({
    size: 9, seed: 3,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 8, y: 8 },
      { id: "p2-gargoyle", type: "gargoyle", player: 2, x: 7, y: 8 }
    ],
    tileObjects: [{ x: 4, y: 4, kind: "fire" }]
  });

  assert.equal(tileHazardCost(state, findUnit(state, "p2-sword"), { x: 4, y: 4 }), 1);
  assert.equal(tileHazardCost(state, findUnit(state, "p2-sword"), { x: 4, y: 5 }), 0);
  // One With The Flames: the Gargoyle ignores fire damage, so the tile is free ground —
  // the controller's existing fire-camp bonus is what then makes it desirable.
  assert.equal(tileHazardCost(state, findUnit(state, "p2-gargoyle"), { x: 4, y: 4 }), 0);
});

test("the Treant's fire vulnerability raises the fire-tile cost, and rain zeroes it", () => {
  const build = (weather) => createBattleState({
    size: 9, seed: 3, weather,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2-treant", type: "treant", player: 2, x: 8, y: 8 }
    ],
    tileObjects: [{ x: 4, y: 4, kind: "fire" }]
  });

  const dry = build(null);
  assert.equal(tileHazardCost(dry, findUnit(dry, "p2-treant"), { x: 4, y: 4 }), 2);

  // Spring Shower douses the board at the top of the rollover, BEFORE the tick, so the
  // tile is already out by the time it would burn anyone.
  const wet = build("spring");
  assert.equal(tileHazardCost(wet, findUnit(wet, "p2-treant"), { x: 4, y: 4 }), 0);
});

test("rollover auras that cost their owner no activation are priced as real damage", () => {
  const state = createBattleState({
    size: 11, seed: 5,
    units: [
      { id: "p1-time", type: "father-time", player: 1, x: 5, y: 5 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 9, y: 9 }
    ]
  });
  const sword = findUnit(state, "p2-sword");

  // Time Steal: 1 true damage to every enemy within 2, at every rollover, for free.
  assert.equal(tileHazardCost(state, sword, { x: 6, y: 6 }), 1);
  assert.equal(tileHazardCost(state, sword, { x: 7, y: 7 }), 1);
  assert.equal(tileHazardCost(state, sword, { x: 8, y: 8 }), 0);
});

test("a Ghoul's bite is split across the bodies crowding into its reach", () => {
  const crowd = (extra) => createBattleState({
    size: 11, seed: 5,
    units: [
      { id: "p1-ghoul", type: "ghoul", player: 1, x: 5, y: 5 },
      { id: "p1-necro", type: "necromancer", player: 1, x: 0, y: 0 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 9, y: 9 },
      ...extra
    ]
  });

  // Ghoul Bite picks ONE random adjacent enemy for 1 true damage, so standing there alone
  // means taking all of it and standing there with a friend means taking half.
  const alone = crowd([]);
  assert.equal(tileHazardCost(alone, findUnit(alone, "p2-sword"), { x: 5, y: 6 }), 1);

  const shared = crowd([{ id: "p2-archer", type: "archer", player: 2, x: 4, y: 5 }]);
  assert.equal(tileHazardCost(shared, findUnit(shared, "p2-sword"), { x: 5, y: 6 }), 0.5);
});

test("the CPU does not retreat onto a burning tile when a tied clean one exists", () => {
  // A Treant trades with an adjacent enemy and then falls back. (5,3) and (5,5) are both
  // one tile from the enemy, so nothing but the fire separates them. Run across seeds
  // because the tie is otherwise broken by the state-seeded rng — without the hazard term
  // the CPU lands in the fire a fair share of the time.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const state = createBattleState({
      size: 9, seed,
      units: [
        { id: "p1-sword", type: "swordsman", player: 1, x: 4, y: 4 },
        { id: "p2-treant", type: "treant", player: 2, x: 5, y: 4, mp: 0 }
      ],
      tileObjects: [{ x: 5, y: 3, kind: "fire", permanent: true }]
    });
    state.currentPlayer = 2;

    const { after, position } = landing(state, "p2-treant", "hard");
    assert.notEqual(after.tileObjects[`${position.x},${position.y}`]?.kind, "fire",
      `seed ${seed}: the CPU ended its activation standing in fire at ${position.x},${position.y}`);
  }
});

// --- tile affinity ----------------------------------------------------------

test("footingValue is zero for the tile a unit already stands on", () => {
  const state = createBattleState({
    size: 9, seed: 2,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 4, y: 4 },
      { id: "p2-black", type: "blacksword", player: 2, x: 6, y: 4 }
    ]
  });
  const black = findUnit(state, "p2-black");
  // A delta, not an absolute — otherwise owning a tile passive would bias which unit the
  // controller activates rather than where it puts it.
  assert.equal(footingValue(state, black, { x: 6, y: 4 }), 0);
});

test("Blacksword reads dark ground as better footing than white, and the Paladin the reverse", () => {
  const state = createBattleState({
    size: 9, seed: 2,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 4, y: 4 },
      { id: "p2-black", type: "blacksword", player: 2, x: 6, y: 5 },
      { id: "p2-paladin", type: "paladin", player: 2, x: 8, y: 5 }
    ]
  });

  // Dark Tread: +damage against enemies on dark, and +1 damage TAKEN on white.
  const black = findUnit(state, "p2-black");
  const blackBase = footingBaseline(state, black);
  const onWhite = footingValue(state, black, { x: 6, y: 4 }, blackBase);
  const onDark = footingValue(state, black, { x: 5, y: 4 }, blackBase);
  assert.ok(onWhite < 0, `stepping onto white should read as worse footing (got ${onWhite})`);
  assert.ok(onDark > onWhite, "dark ground should beat white for Blacksword");

  // Hand of Life: +1 DEF while the Paladin stands on a white tile. Read through the stat
  // fold, so any future position-sensitive passive is picked up without touching this.
  const paladin = findUnit(state, "p2-paladin");
  const paladinBase = footingBaseline(state, paladin);
  assert.ok(footingValue(state, paladin, { x: 7, y: 5 }, paladinBase) >
    footingValue(state, paladin, { x: 7, y: 4 }, paladinBase),
    "the Paladin should prefer the white tile it gains DEF on");
});

test("the CPU Blacksword closes onto dark ground rather than whichever tile ties", () => {
  // Blacksword walks in from range. Several tiles put it next to the target; only its own
  // affinity separates them, so without the footing term the choice is an rng tie-break.
  for (const seed of [1, 2, 3, 4]) {
    const state = createBattleState({
      size: 9, seed,
      units: [
        { id: "p1-sword", type: "swordsman", player: 1, x: 4, y: 4 },
        { id: "p2-black", type: "blacksword", player: 2, x: 7, y: 4 }
      ]
    });
    state.currentPlayer = 2;

    const { position } = landing(state, "p2-black", "hard");
    assert.equal((position.x + position.y) % 2, 1,
      `seed ${seed}: expected a dark tile, got ${position.x},${position.y}`);
  }
});

// --- survival ---------------------------------------------------------------

test("focusedThreat counts a focus-fire, not the whole board's reach", () => {
  const state = createBattleState({
    size: 13, seed: 9,
    units: [
      { id: "p1-a", type: "swordsman", player: 1, x: 4, y: 3 },
      { id: "p1-b", type: "swordsman", player: 1, x: 6, y: 3 },
      { id: "p1-c", type: "swordsman", player: 1, x: 5, y: 2 },
      { id: "p1-d", type: "swordsman", player: 1, x: 5, y: 4 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 5, y: 9 }
    ]
  });
  const victim = findUnit(state, "p2-sword");
  const pos = { x: 5, y: 5 };
  const focused = focusedThreat(incomingStrikes(state, victim, pos));
  const total = incomingThreat(state, victim, pos);
  assert.ok(focused > 0, "the tile is in reach of the squad");
  assert.ok(focused < total, "only the heaviest couple of attackers should count");
  // Bracing halves what lands, so a plan that defends reads as less lethal.
  assert.ok(focusedThreat(incomingStrikes(state, victim, pos, true)) < focused);
});

test("a hard CPU will not dive a movement ART into a squad that would kill it; Normal still does", () => {
  // A half-health Swordsman with Footwork, one rush away from a four-body formation.
  // Diving lands it inside the pack for one activation's worth of contact damage and it
  // dies before acting again. Hard should hold the line and brace; Normal is deliberately
  // left making the blunder, because the campaign runs at Normal.
  const build = () => {
    const state = createBattleState({
      size: 13, seed: 9,
      units: [
        { id: "p1-a", type: "swordsman", player: 1, x: 4, y: 3 },
        { id: "p1-b", type: "swordsman", player: 1, x: 6, y: 3 },
        { id: "p1-c", type: "swordsman", player: 1, x: 5, y: 2 },
        { id: "p1-d", type: "swordsman", player: 1, x: 5, y: 4 },
        { id: "p2-sword", type: "swordsman", player: 2, x: 5, y: 10, hp: 10 }
      ]
    });
    state.currentPlayer = 2;
    return state;
  };

  const hard = landing(build(), "p2-sword", "hard");
  assert.equal(adjacentEnemies(hard.after, hard.unit), 0,
    `a hard CPU parked a 10 HP body inside the formation at ${hard.position.x},${hard.position.y}`);

  const normal = landing(build(), "p2-sword", "normal");
  assert.ok(adjacentEnemies(normal.after, normal.unit) > 0,
    "normal must keep its current, more forgiving behaviour — the campaign is tuned around it");
});

test("a healthy unit still charges: the survival term is about lethality, not danger", () => {
  // Same formation, full health. If this ever starts bracing, the risk curve has flattened
  // into a second exposure term and the two squads will stare at each other all match.
  const state = createBattleState({
    size: 13, seed: 9,
    units: [
      { id: "p1-a", type: "swordsman", player: 1, x: 4, y: 3 },
      { id: "p1-b", type: "swordsman", player: 1, x: 6, y: 3 },
      { id: "p1-c", type: "swordsman", player: 1, x: 5, y: 2 },
      { id: "p1-d", type: "swordsman", player: 1, x: 5, y: 4 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 5, y: 10 }
    ]
  });
  state.currentPlayer = 2;

  const { after, unit } = landing(state, "p2-sword", "hard");
  assert.ok(adjacentEnemies(after, unit) > 0, "a full-health CPU unit should still engage");
});
