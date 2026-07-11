import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation, attack, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit, getTileAffinity } from "../src/core/state.js";
import { getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { getCritChance } from "../src/rules/combat.js";
import { canUseArt } from "../src/rules/arts.js";
import { applyStatus } from "../src/rules/statuses.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const MISS = { attackRoll: 0.01, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `${command.type} rejected (${result.errorCode})`);
  return result;
}

// Blacksword at (1,1); every scenario pins tile affinities explicitly so the tile-based
// passive is deterministic rather than relying on the checkerboard default.
function scenario({ units = [], tiles = [], blacksword = {}, size = 9 } = {}) {
  return createBattleState({
    size,
    seed: 11,
    tiles,
    units: [
      { id: "bs", player: 1, type: "blacksword", x: 1, y: 1, ...blacksword },
      ...units
    ]
  });
}

test("Blacksword is a melee unit with 0 MP and Blind immunity", () => {
  const def = getUnitType("blacksword");
  assert.equal(def.name, "Blacksword");
  assert.equal(def.classType, "melee");
  assert.deepEqual(def.stats, { moveRange: 3, attackRange: 1, strength: 10, defense: 6, maxHp: 30, maxMp: 0 });

  const bs = findUnit(scenario(), "bs");
  assert.equal(bs.mp, 0, "no MP pool");
  assert.equal(applyStatus(bs, { type: "blind", duration: 1 }).applied, false, "Dark Tread blocks Blind");
  assert.equal(applyStatus(bs, { type: "silence", duration: 1 }).applied, true, "only Blind is immune");
});

test("Dark Tread: +1 damage vs an enemy on a dark tile, +2 when Blacksword is on one too", () => {
  // Blacksword on light, target on dark → +1.
  const a = scenario({
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "dark" }]
  });
  let s = run(a, beginActivation(1, "bs")).nextState;
  s = run(s, attack(1, "bs", "foe", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "foe").hp, 25 - 6, "10 STR - 5 DEF + 1 dark-tile bonus");

  // Both on dark → +2.
  const b = scenario({
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "dark" }, { x: 1, y: 2, affinity: "dark" }]
  });
  let t = run(b, beginActivation(1, "bs")).nextState;
  t = run(t, attack(1, "bs", "foe", NORMAL_HIT)).nextState;
  assert.equal(findUnit(t, "foe").hp, 25 - 7, "10 STR - 5 DEF + 2 both-dark bonus");
});

test("Dark Tread: heal 1 HP when damaging an enemy on a dark tile", () => {
  const state = scenario({
    blacksword: { hp: 20 },
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "dark" }]
  });
  let s = run(state, beginActivation(1, "bs")).nextState;
  s = run(s, attack(1, "bs", "foe", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "bs").hp, 21, "lifesteal +1 for striking an enemy on a dark tile");
});

test("Dark Tread: no lifesteal when the enemy stands on a light tile", () => {
  const state = scenario({
    blacksword: { hp: 20 },
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "light" }]
  });
  let s = run(state, beginActivation(1, "bs")).nextState;
  s = run(s, attack(1, "bs", "foe", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "bs").hp, 20, "no dark tile, no heal");
});

test("Dark Tread: +1 damage taken while Blacksword stands on a white tile", () => {
  const white = scenario({
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "light" }]
  });
  white.currentPlayer = 2;
  let s = run(white, beginActivation(2, "foe")).nextState;
  s = run(s, attack(2, "foe", "bs", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "bs").hp, 30 - 5, "10 STR - 6 DEF + 1 white-tile vulnerability");

  const dark = scenario({
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "dark" }, { x: 1, y: 2, affinity: "dark" }]
  });
  dark.currentPlayer = 2;
  let t = run(dark, beginActivation(2, "foe")).nextState;
  t = run(t, attack(2, "foe", "bs", NORMAL_HIT)).nextState;
  assert.equal(findUnit(t, "bs").hp, 30 - 4, "no vulnerability off a white tile");
});

test("Darkspread: a critical strike blinds the target for 1 turn", () => {
  const state = scenario({
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "light" }]
  });
  let s = run(state, beginActivation(1, "bs")).nextState;
  s = run(s, attack(1, "bs", "foe", CRIT)).nextState;
  assert.ok((findUnit(s, "foe").statuses ?? []).some((st) => st.type === "blind"), "crit applies blind");
});

test("Dark Ether: spends 2 HP and forces the next basic attack to crit (a miss still whiffs)", () => {
  const cast = scenario({ blacksword: { hp: 20 } });
  let s = run(cast, beginActivation(1, "bs")).nextState;
  s = run(s, useArt(1, "bs", "dark-ether")).nextState;
  const bs = findUnit(s, "bs");
  assert.equal(bs.hp, 18, "Dark Ether costs 2 HP");
  assert.equal(bs.guaranteedCritCharged, true);
  assert.equal(getCritChance(bs), 1, "the charge guarantees a landed swing crits");

  // A charged NORMAL_HIT (critRoll 0.99, normally no crit) crits, and consumes the charge.
  const charged = scenario({
    blacksword: { guaranteedCritCharged: true },
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }],
    tiles: [{ x: 1, y: 1, affinity: "light" }, { x: 1, y: 2, affinity: "light" }]
  });
  let h = run(charged, beginActivation(1, "bs")).nextState;
  h = run(h, attack(1, "bs", "foe", NORMAL_HIT)).nextState;
  assert.ok(findUnit(h, "foe").hp < 25 - 5, "charged swing deals crit (more than the normal 5)");
  assert.equal(findUnit(h, "bs").guaranteedCritCharged, false, "the charge is spent");

  // A charged swing can still MISS, and the miss spends the charge.
  const missed = scenario({
    blacksword: { guaranteedCritCharged: true },
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 2 }]
  });
  let m = run(missed, beginActivation(1, "bs")).nextState;
  m = run(m, attack(1, "bs", "foe", MISS)).nextState;
  assert.equal(findUnit(m, "foe").hp, 25, "a miss deals nothing");
  assert.equal(findUnit(m, "bs").guaranteedCritCharged, false, "the charge is still spent on a miss");
});

test("Dark Tick: 3 true damage to every blinded enemy, costs 1 HP, needs a blinded enemy", () => {
  const state = scenario({
    blacksword: { hp: 20 },
    units: [
      { id: "blinded", player: 2, type: "swordsman", x: 5, y: 5, statuses: [{ type: "blind", duration: 2 }] },
      { id: "awake", player: 2, type: "swordsman", x: 6, y: 6 }
    ],
    tiles: [{ x: 5, y: 5, affinity: "light" }]
  });
  let s = run(state, beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(s, findUnit(s, "bs"), "dark-tick"), true, "usable with a blinded enemy on the board");
  s = run(s, useArt(1, "bs", "dark-tick")).nextState;
  assert.equal(findUnit(s, "blinded").hp, 25 - 3, "3 true damage to the blinded enemy");
  assert.equal(findUnit(s, "awake").hp, 25, "an un-blinded enemy is untouched");
  assert.equal(findUnit(s, "bs").hp, 19, "Dark Tick costs 1 HP");

  const noBlind = scenario({ units: [{ id: "awake", player: 2, type: "swordsman", x: 5, y: 5 }] });
  const nb = run(noBlind, beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(nb, findUnit(nb, "bs"), "dark-tick"), false, "no blinded enemy → unusable");
});

test("Dark Rush: a straight orthogonal charge dealing tile-scaled true damage for 2 HP", () => {
  const state = scenario({
    blacksword: { hp: 20 },
    units: [{ id: "foe", player: 2, type: "swordsman", x: 1, y: 3 }],
    tiles: [{ x: 1, y: 3, affinity: "dark" }]
  });
  // Move 3 + extraMove 1 = 4 straight steps south, passing through the foe at (1,3).
  const path = [{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 1, y: 5 }];
  let s = run(state, beginActivation(1, "bs")).nextState;
  s = run(s, useArt(1, "bs", "dark-rush", path)).nextState;
  assert.equal(findUnit(s, "foe").hp, 25 - 4, "4 true damage on a dark tile");
  const bs = findUnit(s, "bs");
  assert.deepEqual(bs.position, { x: 1, y: 5 }, "ends on the final tile");
  // -2 HP cost, +1 Dark Tread lifesteal (foe was on a dark tile) = net -1.
  assert.equal(bs.hp, 19, "2 HP cost offset by 1 dark-tile lifesteal");
});

test("Dark Rush rejects a bent (non-straight) path and is unusable at low HP", () => {
  const bent = scenario({ units: [{ id: "foe", player: 2, type: "swordsman", x: 5, y: 5 }] });
  let s = run(bent, beginActivation(1, "bs")).nextState;
  const turn = [{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 4 }];
  assert.equal(applyCommand(s, useArt(1, "bs", "dark-rush", turn)).accepted, false, "a corner breaks the straight line");

  const lowHp = run(scenario({ blacksword: { hp: 2 } }), beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(lowHp, findUnit(lowHp, "bs"), "dark-rush"), false, "cannot pay 2 HP with only 2 HP");
});

test("Banisher RAGE: +2 STR / +1 MOVE at 5 HP or lower", () => {
  const raging = findUnit(scenario({ blacksword: { hp: 5 } }), "bs");
  assert.equal(isRaging(raging), true);
  const stats = getEffectiveStats(raging, scenario({ blacksword: { hp: 5 } }));
  assert.equal(stats.strength, 12);
  assert.equal(stats.moveRange, 4);
});

test("Banish: RAGE-only, destroys every enemy on a dark tile and consumes Blacksword", () => {
  const state = scenario({
    blacksword: { hp: 5 },
    units: [
      { id: "dark", player: 2, type: "swordsman", x: 5, y: 5 },
      { id: "light", player: 2, type: "swordsman", x: 6, y: 6 }
    ],
    tiles: [{ x: 5, y: 5, affinity: "dark" }, { x: 6, y: 6, affinity: "light" }]
  });
  assert.equal(getTileAffinity(state, { x: 5, y: 5 }), "dark");
  let s = run(state, beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(s, findUnit(s, "bs"), "banish-dark"), true, "raging with an enemy on a dark tile");
  s = run(s, useArt(1, "bs", "banish-dark")).nextState;
  assert.equal(findUnit(s, "dark").hp, 0, "enemy on a dark tile is destroyed");
  assert.equal(findUnit(s, "light").hp, 25, "an enemy off a dark tile survives");
  assert.equal(findUnit(s, "bs").hp, 0, "Banish consumes Blacksword (all HP)");

  const notRaging = run(scenario({ blacksword: { hp: 20 }, units: [{ id: "dark", player: 2, type: "swordsman", x: 5, y: 5 }], tiles: [{ x: 5, y: 5, affinity: "dark" }] }), beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(notRaging, findUnit(notRaging, "bs"), "banish-dark"), false, "not usable outside RAGE");

  const noDark = run(scenario({ blacksword: { hp: 5 }, units: [{ id: "light", player: 2, type: "swordsman", x: 6, y: 6 }], tiles: [{ x: 6, y: 6, affinity: "light" }] }), beginActivation(1, "bs")).nextState;
  assert.equal(canUseArt(noDark, findUnit(noDark, "bs"), "banish-dark"), false, "no enemy on a dark tile → unusable");
});
