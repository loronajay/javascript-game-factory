import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, finishActivation, moveUnit, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getArt, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { getBasicAttackDamageType } from "../src/rules/combat.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

function begin(state, unitId, player = 1) {
  const result = applyCommand(state, beginActivation(player, unitId));
  assert.ok(result.accepted, `beginActivation rejected (${result.errorCode})`);
  return result.nextState;
}

test("Mystic has Purify as an 8 MP range-5 allied cleanse ART", () => {
  const purify = getArt("mystic", "purify");
  assert.ok(purify, "Purify should be registered");
  assert.equal(purify.name, "Purify");
  assert.equal(purify.kind, "active");
  assert.equal(purify.mpCost, 8);
  assert.deepEqual(purify.targeting, { shape: "ally", range: 5 });
  assert.equal(purify.effect.type, "cleanse");
  assert.equal(purify.implemented, true);
  assert.ok(UNIT_TYPES.mystic.arts.some((art) => art.id === "purify"));
});

test("Purify removes every status from a living ally, spends MP, and emits cleanse feedback", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0 },
      {
        id: "ally",
        player: 1,
        type: "swordsman",
        x: 5,
        y: 0,
        statuses: [
          { type: "poison", duration: "permanent" },
          { type: "blind", duration: 1 },
          { type: "slow", duration: 2, statModifiers: { moveRange: -1 } },
          { type: "empowered", duration: 1, statModifiers: { strength: 1 } }
        ]
      },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8, statuses: [{ type: "silence", duration: 1 }] }
    ]
  });

  const result = applyCommand(begin(state, "mystic"), useArt(1, "mystic", "purify", { targetId: "ally" }));
  assert.ok(result.accepted, result.errorCode);
  assert.deepEqual(findUnit(result.nextState, "ally").statuses, []);
  assert.deepEqual(findUnit(result.nextState, "foe").statuses, [{ type: "silence", duration: 1 }]);
  assert.equal(findUnit(result.nextState, "mystic").mp, UNIT_TYPES.mystic.stats.maxMp - 8);
  assert.equal(findUnit(result.nextState, "mystic").spent, true);

  const event = result.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(event.artId, "purify");
  assert.equal(event.targetId, "ally");
  assert.deepEqual(event.cleansed, ["ally"]);
  assert.equal(event.mpCost, 8);
});

test("Purify refuses self, enemies, and allies outside range", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, statuses: [{ type: "poison", duration: "permanent" }] },
      { id: "near-ally", player: 1, type: "swordsman", x: 1, y: 0, statuses: [{ type: "blind", duration: 1 }] },
      { id: "far-ally", player: 1, type: "swordsman", x: 6, y: 0, statuses: [{ type: "blind", duration: 1 }] },
      { id: "foe", player: 2, type: "swordsman", x: 2, y: 0, statuses: [{ type: "slow", duration: 2 }] }
    ]
  });
  const opened = begin(state, "mystic");

  assert.equal(applyCommand(opened, useArt(1, "mystic", "purify", { targetId: "mystic" })).accepted, false);
  assert.equal(applyCommand(opened, useArt(1, "mystic", "purify", { targetId: "foe" })).accepted, false);
  assert.equal(applyCommand(opened, useArt(1, "mystic", "purify", { targetId: "far-ally" })).accepted, false);
  assert.equal(applyCommand(opened, useArt(1, "mystic", "purify", { targetId: "near-ally" })).accepted, true);
});

test("Purify has a registered cleanse VFX recipe", () => {
  const vfx = getAbilityVfx("purify");
  assert.equal(vfx?.type, "projectileFan");
  assert.equal(vfx.soundKey, "pray");
  assert.equal(vfx.windup?.style, "gather");
  assert.equal(vfx.projectile.shape, "orb");
});

test("raging Mystic can move before using an ART", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, hp: 5 },
      { id: "ally", player: 1, type: "swordsman", x: 3, y: 0, hp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });

  let next = begin(state, "mystic");
  const moved = applyCommand(next, moveUnit(1, "mystic", 1, 0));
  assert.ok(moved.accepted, moved.errorCode);
  next = moved.nextState;

  const cast = applyCommand(next, useArt(1, "mystic", "pray"));
  assert.ok(cast.accepted, cast.errorCode);
  assert.equal(findUnit(cast.nextState, "mystic").spent, false);
  assert.equal(cast.nextState.activation.unitId, "mystic");
  assert.equal(cast.nextState.activation.moved, true);
  assert.equal(cast.nextState.activation.primaryUsed, true);
  assert.equal(findUnit(cast.nextState, "ally").hp, 13);

  const finished = applyCommand(cast.nextState, finishActivation(1, "mystic"));
  assert.ok(finished.accepted, finished.errorCode);
  assert.equal(findUnit(finished.nextState, "mystic").spent, true);
});

test("Mystic restores 15 MP when entering rage", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "sword", player: 1, type: "swordsman", x: 0, y: 1 },
      { id: "mystic", player: 2, type: "mystic", x: 0, y: 0, hp: 11, mp: 10 }
    ]
  });

  const result = applyCommand(begin(state, "sword"), attack(1, "sword", "mystic", { attackRoll: 0.5, critRoll: 0.99 }));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "mystic").hp, 5);
  assert.equal(findUnit(result.nextState, "mystic").mp, 25);
  assert.ok(result.events.some((event) =>
    event.type === "RAGE_REGENERATE" &&
    event.unitId === "mystic" &&
    event.hpRestored === 0 &&
    event.mpRestored === 15
  ));
});

test("raging Mystic basic attacks deal magic damage", () => {
  assert.equal(getBasicAttackDamageType({ type: "mystic", hp: 5 }), "magic");
  assert.equal(getBasicAttackDamageType({ type: "mystic", hp: 6 }), "physical");

  const state = createBattleState({
    size: 7,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, hp: 5 },
      { id: "foe", player: 2, type: "swordsman", x: 0, y: 5 }
    ]
  });

  const result = applyCommand(begin(state, "mystic"), attack(1, "mystic", "foe", { attackRoll: 0.5, critRoll: 0.99 }));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "foe").hp, 20);
  assert.equal(result.events[0].damage, 5);
});

test("raging Mystic can move after using an ART", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, hp: 5 },
      { id: "ally", player: 1, type: "swordsman", x: 3, y: 0, hp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });

  let next = begin(state, "mystic");
  const cast = applyCommand(next, useArt(1, "mystic", "pray"));
  assert.ok(cast.accepted, cast.errorCode);
  assert.equal(findUnit(cast.nextState, "mystic").spent, false);
  assert.equal(cast.nextState.activation.primaryUsed, true);

  const moved = applyCommand(cast.nextState, moveUnit(1, "mystic", 1, 0));
  assert.ok(moved.accepted, moved.errorCode);
  assert.equal(findUnit(moved.nextState, "mystic").position.x, 1);
  assert.equal(moved.nextState.activation.moved, true);

  const finished = applyCommand(moved.nextState, finishActivation(1, "mystic"));
  assert.ok(finished.accepted, finished.errorCode);
  assert.equal(findUnit(finished.nextState, "mystic").spent, true);
});

test("raging Mystic can move before casting Silence", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, hp: 5 },
      { id: "foe", player: 2, type: "swordsman", x: 5, y: 0 }
    ]
  });

  const opened = begin(state, "mystic");
  const moved = applyCommand(opened, moveUnit(1, "mystic", 1, 0));
  assert.ok(moved.accepted, moved.errorCode);

  const cast = applyCommand(moved.nextState, useArt(1, "mystic", "silence", { targetId: "foe", effectRoll: 0.1 }));
  assert.ok(cast.accepted, cast.errorCode);
  assert.equal(findUnit(cast.nextState, "mystic").spent, false);
  assert.deepEqual(findUnit(cast.nextState, "foe").statuses, [{ type: "silence", duration: 1 }]);
  assert.equal(cast.nextState.activation.primaryUsed, true);
});

test("Mystic still needs rage to move before using an ART", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "mystic", player: 1, type: "mystic", x: 0, y: 0, hp: 6 },
      { id: "ally", player: 1, type: "swordsman", x: 3, y: 0, hp: 10 },
      { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
    ]
  });

  const opened = begin(state, "mystic");
  const moved = applyCommand(opened, moveUnit(1, "mystic", 1, 0));
  assert.ok(moved.accepted, moved.errorCode);
  assert.equal(applyCommand(moved.nextState, useArt(1, "mystic", "pray")).accepted, false);
});
