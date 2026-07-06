import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getArt, UNIT_TYPES } from "../src/core/unitCatalog.js";
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
