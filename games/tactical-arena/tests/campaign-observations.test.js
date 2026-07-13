import test from "node:test";
import assert from "node:assert/strict";

import {
  artHasBlindEffect,
  artHasPoisonEffect,
  artHasStatusEffect,
  eventDamageForTarget,
  eventTargetIds,
  playerTriedPoisonOnTarget,
} from "../src/campaign/campaignObservations.js";

test("campaign observation detects nested status effects without treating immunities as casts", () => {
  assert.equal(artHasStatusEffect({ effect: { type: "status", status: "slow" } }), true);
  assert.equal(artHasBlindEffect({ riders: [{ status: "blind" }] }), true);
  assert.equal(artHasPoisonEffect({ globalStatus: { status: "poison" } }), true);
  assert.equal(artHasStatusEffect({ type: "immunity", status: "blind" }), false);
});

test("campaign damage observations normalize target collections and per-target damage", () => {
  const event = {
    targetId: "primary",
    targetIds: ["primary", "splash"],
    damageByTarget: { primary: 5, splash: 2 },
  };

  assert.deepEqual(eventTargetIds(event), ["primary", "splash"]);
  assert.equal(eventDamageForTarget(event, "primary"), 5);
  assert.equal(eventDamageForTarget(event, "splash"), 2);
  assert.equal(eventDamageForTarget(event, "missing"), 0);
});

test("poison attempts are derived from unit and art data", () => {
  const state = {
    units: [
      { id: "archer", player: 1, type: "archer", hp: 20 },
      { id: "boss", player: 2, type: "treant", hp: 30 },
    ],
  };
  const command = {
    type: "USE_ART",
    player: 1,
    unitId: "archer",
    artId: "poison-arrow",
    targetId: "boss",
  };

  assert.equal(playerTriedPoisonOnTarget(state, command, [], "boss"), true);
  assert.equal(playerTriedPoisonOnTarget(state, { ...command, artId: "volley-shot" }, [], "boss"), false);
});
