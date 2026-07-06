import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { getArt, getEffectiveStats, getUnitType, isDefending, isRaging } from "../src/core/unitCatalog.js";
import { getArtTargetRange, getFlightTiles, getPyroclasmTargets } from "../src/rules/arts.js";
import { statusImmunities } from "../src/rules/statuses.js";
import { positionKey } from "../src/rules/movement.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Combat is stochastic, so any test asserting an outcome pins the rolls.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };
const SURE_EFFECT = { effectRoll: 0 };

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

test("Gargoyle is registered with its tank stat block", () => {
  const def = getUnitType("gargoyle");
  assert.equal(def.name, "Gargoyle");
  assert.equal(def.classType, "tank");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 1, strength: 10, defense: 7, maxHp: 30, maxMp: 20 });
});

test("Heavy: effective Move can never exceed 3 no matter the speed buff", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 6, y: 6, statModifiers: { moveRange: 5 } }
  ]);
  assert.equal(getEffectiveStats(findUnit(state, "g"), state).moveRange, 3);

  const plain = scenario([{ id: "g", type: "gargoyle", player: 1, x: 6, y: 6 }]);
  assert.equal(getEffectiveStats(findUnit(plain, "g"), plain).moveRange, 2);
});

test("Stone Ward: immune to every status effect", () => {
  const immune = statusImmunities(findUnit(scenario([{ id: "g", type: "gargoyle", player: 1, x: 0, y: 0 }]), "g"));
  for (const status of ["poison", "slow", "blind", "silence", "stun"]) {
    assert.ok(immune.has(status), `should be immune to ${status}`);
  }
});

test("Stone Body: a status targeted at the Gargoyle is reflected onto the offender", () => {
  const state = scenario([
    { id: "arc", type: "archer", player: 1, x: 3, y: 6 },
    { id: "g", type: "gargoyle", player: 2, x: 6, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "arc")).nextState;
  // Leg Shot: physical strike + a Slow status rider. The strike still hits the Gargoyle;
  // the Slow reflects back onto the Archer.
  s = run(s, useArt(1, "arc", "leg-shot", { targetId: "g", ...NORMAL_HIT, ...SURE_EFFECT })).nextState;

  assert.deepEqual(findUnit(s, "g").statuses, [], "Gargoyle takes no status");
  assert.deepEqual(findUnit(s, "arc").statuses.map((x) => x.type), ["slow"], "the Archer is slowed instead");
  assert.ok(findUnit(s, "g").hp < 30, "the physical hit still lands on the Gargoyle");
});

test("Stone Body: a melee attacker takes 1 true damage when the Gargoyle is defending", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 5, y: 5 },
    { id: "sw", type: "swordsman", player: 2, x: 5, y: 6 }
  ]);
  // Gargoyle braces, then the adjacent swordsman strikes it.
  let s = run(state, beginActivation(1, "g")).nextState;
  s = run(s, defend(1, "g")).nextState;
  s = run(s, finishActivation(1, "g")).nextState;
  s = run(s, beginActivation(2, "sw")).nextState;
  const res = run(s, attack(2, "sw", "g", NORMAL_HIT));
  s = res.nextState;

  const swMax = getUnitType("swordsman").stats.maxHp;
  assert.equal(findUnit(s, "sw").hp, swMax - 1, "the melee attacker recoils 1 true damage");
  assert.ok(res.events.some((e) => e.type === "STONE_RETALIATION" && e.offenderId === "sw"));
});

test("Stone Body: no melee recoil when the Gargoyle is NOT defending", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 2, x: 5, y: 5 },
    { id: "sw", type: "swordsman", player: 1, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "sw")).nextState;
  s = run(s, attack(1, "sw", "g", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "sw").hp, getUnitType("swordsman").stats.maxHp, "no recoil off a non-defending Gargoyle");
});

test("Stone Body: a ranged attacker never triggers the melee recoil, even vs a defending Gargoyle", () => {
  // Raging Gargoyle is always defending; a distant archer still takes no recoil.
  const state = scenario([
    { id: "g", type: "gargoyle", player: 2, x: 5, y: 5, hp: 5 },
    { id: "arc", type: "archer", player: 1, x: 5, y: 9 }
  ]);
  let s = run(state, beginActivation(1, "arc")).nextState;
  s = run(s, attack(1, "arc", "g", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "arc").hp, getUnitType("archer").stats.maxHp, "ranged attacker takes no recoil");
});

test("Stone Body: Tether Grab cannot move the Gargoyle and recoils 2 true (the magic still lands)", () => {
  const state = scenario([
    { id: "jug", type: "juggernaut", player: 1, x: 5, y: 5 },
    { id: "g", type: "gargoyle", player: 2, x: 5, y: 8 } // straight vertical line, distance 3 (≤4)
  ]);
  let s = run(state, beginActivation(1, "jug")).nextState;
  const res = run(s, useArt(1, "jug", "tether-grab", { targetId: "g", ...NORMAL_HIT }));
  s = res.nextState;

  assert.deepEqual(findUnit(s, "g").position, { x: 5, y: 8 }, "the Gargoyle is not hauled");
  assert.equal(findUnit(s, "jug").hp, 30 - 2, "the grabber takes 2 true recoil");
  assert.equal(findUnit(s, "g").hp, 30 - 3, "the grab's 3 magic still lands");
  const grab = res.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(grab.displaced, false);
});

test("Stone Body: Front Kick knockback is negated and recoils 2 true", () => {
  const state = scenario([
    { id: "monk", type: "monk", player: 1, x: 5, y: 5 },
    { id: "g", type: "gargoyle", player: 2, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "monk")).nextState;
  const res = run(s, useArt(1, "monk", "front-kick", { targetId: "g", ...CRIT }));
  s = res.nextState;

  assert.deepEqual(findUnit(s, "g").position, { x: 5, y: 6 }, "the Gargoyle is not knocked back");
  assert.equal(findUnit(s, "monk").hp, getUnitType("monk").stats.maxHp - 2, "the kicker takes 2 true recoil");
  const kick = res.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(kick.knockedBack, false);
});

test("Flight: fly range is Move + 1, and a tile beyond it is illegal", () => {
  const state = scenario([{ id: "g", type: "gargoyle", player: 1, x: 5, y: 5 }]);
  const art = getArt("gargoyle", "flight");
  const g = findUnit(state, "g");
  const tiles = getFlightTiles(state, g, art);
  assert.ok(tiles.has(positionKey({ x: 5, y: 8 })), "distance 3 (Move 2 + 1) is reachable");
  assert.ok(!tiles.has(positionKey({ x: 5, y: 9 })), "distance 4 is out of range");

  let s = run(state, beginActivation(1, "g")).nextState;
  const rejected = applyCommand(s, useArt(1, "g", "flight", { targetPosition: { x: 5, y: 9 } }));
  assert.equal(rejected.accepted, false);
});

test("Flight: reposition then a 2 true blast to enemies within 1 of the landing", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 },
    { id: "away", type: "archer", player: 2, x: 11, y: 11 }
  ]);
  let s = run(state, beginActivation(1, "g")).nextState;
  s = run(s, useArt(1, "g", "flight", { targetPosition: { x: 6, y: 6 } })).nextState;

  assert.deepEqual(findUnit(s, "g").position, { x: 6, y: 6 });
  assert.equal(findUnit(s, "foe").hp, getUnitType("swordsman").stats.maxHp - 2, "enemy within 1 of the landing takes 2 true");
  assert.equal(findUnit(s, "away").hp, getUnitType("archer").stats.maxHp, "a distant enemy is untouched");
});

test("Heavy caps Flight range: a +5 Move buff still only extends the fly to 4", () => {
  const state = scenario([{ id: "g", type: "gargoyle", player: 1, x: 5, y: 5, statModifiers: { moveRange: 5 } }]);
  const tiles = getFlightTiles(state, findUnit(state, "g"), getArt("gargoyle", "flight"));
  assert.ok(tiles.has(positionKey({ x: 5, y: 9 })), "capped Move 3 + 1 = 4 reachable");
  assert.ok(!tiles.has(positionKey({ x: 5, y: 10 })), "distance 5 is still out of range");
});

test("Pyroclasm: 5 magic to every enemy on a ray within range; off-line enemies are spared", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 6, y: 6 },
    { id: "vert", type: "swordsman", player: 2, x: 6, y: 8 },   // vertical ray, dist 2
    { id: "diag", type: "swordsman", player: 2, x: 8, y: 8 },   // diagonal ray, dist 2
    { id: "horiz", type: "swordsman", player: 2, x: 9, y: 6 },  // horizontal ray, dist 3
    { id: "off", type: "swordsman", player: 2, x: 7, y: 8 }     // (1,2) — not on any ray
  ]);
  let s = run(state, beginActivation(1, "g")).nextState;
  s = run(s, useArt(1, "g", "pyroclasm", {})).nextState;

  const swMax = getUnitType("swordsman").stats.maxHp;
  assert.equal(findUnit(s, "vert").hp, swMax - 5);
  assert.equal(findUnit(s, "diag").hp, swMax - 5);
  assert.equal(findUnit(s, "horiz").hp, swMax - 5);
  assert.equal(findUnit(s, "off").hp, swMax, "an enemy off every ray is untouched");
});

test("Pyroclasm: a wall stops its ray", () => {
  const state = scenario(
    [
      { id: "g", type: "gargoyle", player: 1, x: 6, y: 6 },
      { id: "behind", type: "swordsman", player: 2, x: 6, y: 9 }
    ],
    { tileObjects: [{ x: 6, y: 7, kind: "wall", hp: 1 }] }
  );
  const targets = getPyroclasmTargets(state, findUnit(state, "g"), getArt("gargoyle", "pyroclasm"));
  assert.ok(!targets.some((t) => t.id === "behind"), "the wall shields the enemy behind it");
});

test("Volcanic Rage: at ≤5 HP the Gargoyle is +2 DEF, always defending, and Pyroclasm gains +2 range", () => {
  const state = scenario([{ id: "g", type: "gargoyle", player: 1, x: 6, y: 6, hp: 5 }]);
  const g = findUnit(state, "g");
  assert.ok(isRaging(g));
  assert.equal(getEffectiveStats(g, state).defense, 9, "+2 DEF while raging");
  assert.ok(isDefending(g), "always defending under Volcanic Rage");
  assert.equal(getArtTargetRange(state, g, getArt("gargoyle", "pyroclasm")), 5, "Pyroclasm range 3 + 2");

  const healthy = findUnit(scenario([{ id: "g", type: "gargoyle", player: 1, x: 6, y: 6 }]), "g");
  const healthyState = scenario([{ id: "g", type: "gargoyle", player: 1, x: 6, y: 6 }]);
  assert.equal(getArtTargetRange(healthyState, healthy, getArt("gargoyle", "pyroclasm")), 3);
});

test("Volcanic Rage: every 3rd raging activation erupts a free Pyroclasm before the turn", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 6, y: 6, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 8, hp: 30 }
  ]);

  // One full round: Gargoyle begins → (maybe erupts) → defends → finishes; foe passes.
  function gargBegin(s) {
    return applyCommand(s, beginActivation(1, "g"));
  }
  function foeTurn(s) {
    let n = run(s, beginActivation(2, "foe")).nextState;
    n = run(n, defend(2, "foe")).nextState;
    return run(n, finishActivation(2, "foe")).nextState;
  }
  function finishGarg(s) {
    let n = run(s, defend(1, "g")).nextState;
    return run(n, finishActivation(1, "g")).nextState;
  }

  let s = state;
  let erupted = [];
  for (let round = 1; round <= 3; round += 1) {
    const res = gargBegin(s);
    assert.ok(res.accepted);
    erupted.push(res.events.some((e) => e.type === "PYROCLASM_ERUPT"));
    s = finishGarg(res.nextState);
    if (s.phase === "playing") s = foeTurn(s);
  }

  assert.deepEqual(erupted, [false, false, true], "the 3rd raging begin erupts, the first two do not");
  assert.ok(findUnit(s, "foe").hp < 30, "the free eruption damaged an enemy on a ray");
});

test("A non-raging Gargoyle never erupts on begin", () => {
  const state = scenario([
    { id: "g", type: "gargoyle", player: 1, x: 6, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 8 }
  ]);
  const res = run(state, beginActivation(1, "g"));
  assert.ok(!res.events.some((e) => e.type === "PYROCLASM_ERUPT"));
  assert.equal(findUnit(res.nextState, "g").volcanicCounter, 0);
});

test("Flight + Pyroclasm both register a VFX recipe", () => {
  assert.equal(getAbilityVfx("flight").type, "dashTrail");
  assert.equal(getAbilityVfx("pyroclasm").type, "magicBurst");
});
