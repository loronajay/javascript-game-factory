import test from "node:test";
import assert from "node:assert/strict";

import {
  prepareRolledCombatPresentation,
  presentRolledCombat,
} from "../src/ui/rolledCombatPresenter.js";

test("rolled combat preparation captures the pre-command actor and ordered targets", () => {
  const attacker = { id: "attacker", player: 1, position: { x: 1, y: 1 } };
  const first = { id: "first", player: 2, position: { x: 2, y: 1 } };
  const second = { id: "second", player: 2, position: { x: 3, y: 1 } };
  const before = { size: 7, units: [attacker, first, second] };
  const events = [{
    type: "ATTACK_RESOLVED",
    actorId: attacker.id,
    targetId: first.id,
    targetIds: [second.id, first.id],
    hit: true,
  }];

  const snapshot = prepareRolledCombatPresentation(before, events);

  assert.equal(snapshot.rolled, events[0]);
  assert.equal(snapshot.attackerBefore, attacker);
  assert.equal(snapshot.targetBefore, second);
  assert.deepEqual(snapshot.rolledTargetsBefore, [second, first]);
});

test("resource-restoration events are presented against the pre-command unit position", async () => {
  const unit = { id: "virus", player: 1, position: { x: 1, y: 1 } };
  const floats = [];

  await presentRolledCombat({
    before: { size: 7, units: [unit] },
    result: { nextState: { size: 7, units: [unit] } },
    events: [{ type: "GROWTH_MP", unitId: unit.id, mpGained: 2, hpRestored: 0 }],
    rolled: null,
    attackerBefore: null,
    targetBefore: null,
    rolledTargetsBefore: [],
    effects: {
      floatText: async (_position, text, color) => { floats.push({ text, color }); },
    },
    revealRoll: async () => {},
    playAttackImpactSound: () => {},
    artDefinition: () => null,
  });

  assert.deepEqual(floats, [{ text: "+2 MP", color: "#8cc8ff" }]);
});
