import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, cancelMove, moveUnit, useArt } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getRushSteps } from "../src/rules/arts.js";
import { getLegalMoves, getTrampleMoveOptions, positionKey } from "../src/rules/movement.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { generatePlans, toCommands } from "../src/ai/plans.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

test("Fat Knight is registered with his melee stat block and arts", () => {
  const def = getUnitType("fat-knight");
  assert.equal(def.name, "Fat Knight");
  assert.equal(def.glyph, "♞");
  assert.equal(def.classType, "melee");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 1, strength: 10, defense: 6, maxHp: 30, maxMp: 20 });
  assert.deepEqual(def.arts.filter((art) => art.kind === "active").map((art) => art.id), ["stumble", "fart"]);
});

test("Battle Trauma: magic crits do not crit Fat Knight, but still deal +1 and grant +1 STR once", () => {
  const state = scenario([
    { id: "mage", type: "magician", player: 1, x: 5, y: 5 },
    { id: "fk", type: "fat-knight", player: 2, x: 5, y: 8 }
  ]);
  let s = run(state, beginActivation(1, "mage")).nextState;
  const result = run(s, useArt(1, "mage", "spark", { targetId: "fk", ...CRIT }));
  const fk = findUnit(result.nextState, "fk");

  assert.equal(fk.hp, 23, "Spark deals 6 magic + 1 vulnerability, with no crit multiplier");
  assert.equal(getEffectiveStats(fk, result.nextState).strength, 11, "magic damage grants +1 STR");
  assert.equal(fk.statuses.filter((status) => status.type === "battle-trauma").length, 1);
});

test("Battle Trauma: critical basic attacks are not amplified against Fat Knight", () => {
  const state = scenario([
    { id: "sw", type: "swordsman", player: 1, x: 5, y: 5 },
    { id: "fk", type: "fat-knight", player: 2, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "sw")).nextState;
  const result = run(s, attack(1, "sw", "fk", CRIT));
  assert.equal(findUnit(result.nextState, "fk").hp, 26, "10 STR - 6 DEF = 4, not crit-amplified to 6");
});

test("Thick Boi: Fat Knight resists the first status effect, then later statuses can land", () => {
  const state = scenario([
    { id: "m1", type: "mystic", player: 1, x: 4, y: 4 },
    { id: "m2", type: "mystic", player: 1, x: 6, y: 4 },
    { id: "fk", type: "fat-knight", player: 2, x: 5, y: 7 }
  ]);

  let s = run(state, beginActivation(1, "m1")).nextState;
  let first = run(s, useArt(1, "m1", "silence", { targetId: "fk", effectRoll: 0 }));
  let fk = findUnit(first.nextState, "fk");
  assert.equal(fk.statusResistUsed, true);
  assert.deepEqual(fk.statuses, [], "first status is resisted");
  assert.equal(first.events[0].effect.reason, "RESISTED");

  s = run(first.nextState, beginActivation(1, "m2")).nextState;
  const second = run(s, useArt(1, "m2", "silence", { targetId: "fk", effectRoll: 0 }));
  fk = findUnit(second.nextState, "fk");
  assert.deepEqual(fk.statuses.map((status) => status.type), ["silence"], "second status lands");
});

test("Stumble uses Move +2 steps and deals 3 true damage to contacted enemies", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5 },
    { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
  ]);
  assert.equal(getRushSteps(findUnit(state, "fk"), getUnitType("fat-knight").arts[0], state), 4);

  let s = run(state, beginActivation(1, "fk")).nextState;
  const path = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }, { x: 7, y: 7 }];
  const result = run(s, useArt(1, "fk", "stumble", path));
  assert.equal(findUnit(result.nextState, "e").hp, 22);
  assert.deepEqual(findUnit(result.nextState, "fk").position, { x: 7, y: 7 });
  assert.equal(findUnit(result.nextState, "fk").mp, 17);
});

test("Blizzard extends Stumble by one movement-art step", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5 },
    { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
  ], { weather: "blizzard" });
  const art = getUnitType("fat-knight").arts.find((entry) => entry.id === "stumble");
  assert.equal(getRushSteps(findUnit(state, "fk"), art, state), 5);

  const s = run(state, beginActivation(1, "fk")).nextState;
  const path = [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 6 }, { x: 8, y: 7 }];
  const result = run(s, useArt(1, "fk", "stumble", path));
  assert.deepEqual(findUnit(result.nextState, "fk").position, { x: 8, y: 7 });
});

test("Fart pushes nearby enemies away, or deals true damage when blocked", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5 },
    { id: "push", type: "swordsman", player: 2, x: 6, y: 5 },
    { id: "blocked", type: "swordsman", player: 2, x: 5, y: 4 },
    { id: "wall", type: "swordsman", player: 1, x: 5, y: 3 },
    { id: "ally", type: "swordsman", player: 1, x: 4, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "fk")).nextState;
  const result = run(s, useArt(1, "fk", "fart"));

  assert.deepEqual(findUnit(result.nextState, "push").position, { x: 7, y: 5 }, "enemy is shoved one tile away");
  assert.deepEqual(findUnit(result.nextState, "blocked").position, { x: 5, y: 4 }, "blocked enemy stays put");
  assert.equal(findUnit(result.nextState, "blocked").hp, 22, "blocked enemy takes 3 true damage");
  assert.deepEqual(findUnit(result.nextState, "ally").position, { x: 4, y: 5 }, "allies are ignored");
});

test("RAGE Trample lets Fat Knight move through enemies and damages each enemy crossed", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, hp: 5 },
    { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
  ]);
  const legal = getLegalMoves(state, findUnit(state, "fk"));
  assert.equal(legal.has(positionKey({ x: 7, y: 5 })), true, "Trample movement can target a landing tile behind an enemy");
  assert.equal(legal.has(positionKey({ x: 6, y: 5 })), false, "Trample movement still cannot end on an occupied enemy tile");

  let s = run(state, beginActivation(1, "fk")).nextState;
  const result = run(s, moveUnit(1, "fk", 7, 5));

  assert.deepEqual(findUnit(result.nextState, "fk").position, { x: 7, y: 5 });
  assert.equal(findUnit(result.nextState, "e").hp, 22, "crossed enemy takes 3 true damage");
  assert.equal(getEffectiveStats(findUnit(result.nextState, "fk"), result.nextState).defense, 8);
});

test("RAGE Trample move is targeted tile-by-tile like Footwork/Stumble, not a single click to a far destination", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, hp: 5 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 5 },
    { id: "e2", type: "swordsman", player: 2, x: 8, y: 5 }
  ]);
  const fk = findUnit(state, "fk");

  // Step 1 from the origin: only the immediate orthogonal neighbors, not the far
  // destination — the enemy tile at (6,5) is offered (it can be trampled through,
  // there's still room to land past it), the ally-free far tile is NOT a one-click option.
  const step1 = getTrampleMoveOptions(state, fk, []);
  assert.equal(step1.has(positionKey({ x: 6, y: 5 })), true, "the first enemy in line is a legal next step");
  assert.equal(step1.has(positionKey({ x: 9, y: 5 })), false, "a distant tile is not directly selectable — must be walked step by step");
  assert.equal(step1.has(positionKey({ x: 8, y: 5 })), false, "an enemy is only a legal step, not a shortcut past it");

  const afterEmptyStep = getTrampleMoveOptions(state, fk, [{ x: 5, y: 4 }]);
  assert.equal(afterEmptyStep.size > 0, true, "an empty first step continues the Trample path instead of confirming the move");

  // After stepping onto the first enemy's tile, empty continuation tiles are
  // offered; the final third step must still land on empty ground.
  const step2 = getTrampleMoveOptions(state, fk, [{ x: 6, y: 5 }]);
  assert.equal(step2.has(positionKey({ x: 7, y: 5 })), true, "empty tile beyond the first enemy is reachable");
  assert.equal(step2.has(positionKey({ x: 6, y: 4 })), true, "a sideways empty tile is also reachable");

  let s = run(state, beginActivation(1, "fk")).nextState;
  const result = run(s, moveUnit(1, "fk", 7, 6, [{ x: 6, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }]));
  assert.deepEqual(findUnit(result.nextState, "fk").position, { x: 7, y: 6 });
  assert.equal(findUnit(result.nextState, "e1").hp, 22, "the crossed enemy takes 3 true damage");
  assert.equal(findUnit(result.nextState, "e2").hp, 25, "an enemy off the walked path is untouched");
});

test("RAGE Trample rejects an explicit path that doesn't end on the clicked destination or skips a tile", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, hp: 5 },
    { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "fk")).nextState;

  const short = applyCommand(s, moveUnit(1, "fk", 7, 5, [{ x: 6, y: 5 }, { x: 7, y: 5 }]));
  assert.equal(short.accepted, false, "explicit Trample paths must use the full movement length like Footwork/Stumble");

  const mismatched = applyCommand(s, moveUnit(1, "fk", 7, 5, [{ x: 6, y: 5 }]));
  assert.equal(mismatched.accepted, false, "path must end at the declared destination");

  const skipped = applyCommand(s, moveUnit(1, "fk", 10, 5, [{ x: 8, y: 5 }, { x: 9, y: 5 }, { x: 10, y: 5 }]));
  assert.equal(skipped.accepted, false, "path steps must be orthogonally adjacent, not a jump");
});

test("RAGE Trample movement cannot be cancelled after it is committed", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, hp: 5 },
    { id: "e", type: "swordsman", player: 2, x: 6, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "fk")).nextState;
  s = run(s, moveUnit(1, "fk", 7, 5)).nextState;

  const cancelled = applyCommand(s, cancelMove(1, "fk"));
  assert.equal(cancelled.accepted, false);
  assert.equal(cancelled.errorCode, "CANCEL_NOT_AVAILABLE");
  assert.deepEqual(findUnit(s, "fk").position, { x: 7, y: 5 });
  assert.equal(findUnit(s, "e").hp, 22);
});

test("RAGE Trample stacks with Stumble contact damage and extends Stumble by 3", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 2, y: 2, hp: 5 },
    { id: "e", type: "swordsman", player: 2, x: 3, y: 2 }
  ]);
  const art = getUnitType("fat-knight").arts.find((entry) => entry.id === "stumble");
  assert.equal(getRushSteps(findUnit(state, "fk"), art, state), 8);

  let s = run(state, beginActivation(1, "fk")).nextState;
  const path = [
    { x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 2 }, { x: 6, y: 2 },
    { x: 7, y: 2 }, { x: 8, y: 2 }, { x: 9, y: 2 }, { x: 10, y: 2 }
  ];
  const result = run(s, useArt(1, "fk", "stumble", path));
  assert.equal(findUnit(result.nextState, "e").hp, 19, "3 Stumble + 3 Trample true damage");
});

test("Fat Knight's active ARTS register VFX recipes", () => {
  assert.equal(getAbilityVfx("stumble").type, "dashTrail");
  assert.equal(getAbilityVfx("fart").type, "magicBurst");
});

test("CPU: Fat Knight plans replay cleanly, including Stumble and Fart", () => {
  const state = scenario([
    { id: "fk", type: "fat-knight", player: 1, x: 5, y: 5, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 5 },
    { id: "e2", type: "archer", player: 2, x: 8, y: 5 }
  ]);
  const plans = generatePlans(state, findUnit(state, "fk"));
  assert.ok(plans.some((plan) => plan.primary.artId === "stumble"), "expected a Stumble plan");
  assert.ok(plans.some((plan) => plan.primary.artId === "fart"), "expected a Fart plan");
  for (const plan of plans) {
    let s = state;
    for (const command of toCommands(1, plan)) {
      const result = applyCommand(s, command);
      assert.ok(result.accepted, `${plan.primary.artId ?? plan.primary.kind} -> ${command.type} rejected (${result.errorCode})`);
      s = result.nextState;
    }
  }
});
