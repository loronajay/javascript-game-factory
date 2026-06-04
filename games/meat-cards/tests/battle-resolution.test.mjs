import test from "node:test";
import assert from "node:assert/strict";

import { createAttackResolution } from "../src/ui/battle-resolution.mjs";
import { prepareAttackResolution } from "../src/game-board-app.mjs";

const cardsById = {
  attacker: {
    id: "attacker",
    type: "monster",
    name: "Lunch Problem",
    art: "card-art/attacker.jfif",
    printedHp: 5,
    printedStrength: 2,
  },
  target: {
    id: "target",
    type: "monster",
    name: "Target Dummy",
    art: "card-art/target.jfif",
    printedHp: 4,
    printedStrength: 1,
  },
};

test("attack resolution preview shows the d6 roll, hit damage, and target hp drop before state commits", () => {
  const resolution = createAttackResolution(testState(), cardsById, {
    attackerPlayerId: "p1",
    attackerSlotIndex: 0,
    targetPlayerId: "p2",
    targetSlotIndex: 0,
    roll: 4,
  });

  assert.equal(resolution.type, "attack");
  assert.equal(resolution.roll, 4);
  assert.equal(resolution.hit, true);
  assert.equal(resolution.damage, 2);
  assert.equal(resolution.floatText, "-2 HP");
  assert.equal(resolution.attacker.card.name, "Lunch Problem");
  assert.equal(resolution.attacker.card.currentStrength, 2);
  assert.equal(resolution.target.beforeHp, 4);
  assert.equal(resolution.target.afterHp, 2);
  assert.equal(resolution.target.card.currentHp, 2);
  assert.equal(resolution.target.card.currentStrength, 1);
});

test("attack resolution preview makes misses obvious without lowering target hp", () => {
  const resolution = createAttackResolution(testState(), cardsById, {
    attackerPlayerId: "p1",
    attackerSlotIndex: 0,
    targetPlayerId: "p2",
    targetSlotIndex: 0,
    roll: 1,
  });

  assert.equal(resolution.roll, 1);
  assert.equal(resolution.hit, false);
  assert.equal(resolution.damage, 0);
  assert.equal(resolution.floatText, "MISS!");
  assert.equal(resolution.target.beforeHp, 4);
  assert.equal(resolution.target.afterHp, 4);
  assert.equal(resolution.target.card.currentHp, 4);
});

test("attack resolution preparation rejects offensive restrictions before animation starts", () => {
  const state = playableState({
    attackerOverrides: {
      actionRestrictions: [{ blockedActionCategory: "offensive", remainingControllerTurns: 1 }],
    },
  });

  assert.throws(
    () =>
      prepareAttackResolution(state, cardsById, {
        type: "attack",
        attackerPlayerId: "p1",
        attackerSlotIndex: 0,
        targetPlayerId: "p2",
        targetSlotIndex: 0,
      }, 4),
    /blocked from offensive actions/i,
  );
});

test("attack resolution preparation commits the same roll it previews", () => {
  const prepared = prepareAttackResolution(
    playableState(),
    cardsById,
    {
      type: "attack",
      attackerPlayerId: "p1",
      attackerSlotIndex: 0,
      targetPlayerId: "p2",
      targetSlotIndex: 0,
    },
    4,
  );

  assert.equal(prepared.battleResolution.roll, 4);
  assert.equal(prepared.battleResolution.floatText, "-2 HP");
  assert.equal(prepared.nextState.players.p2.monsterSlots[0].currentHp, 2);
  assert.equal(prepared.nextState.players.p1.monsterSlots[0].hasAttackedThisTurn, true);
});

function testState() {
  return {
    players: {
      p1: {
        id: "p1",
        name: "Player One",
        monsterSlots: [
          {
            instanceId: "monster_1",
            cardInstanceId: "p1_attacker_1",
            cardId: "attacker",
            currentHp: 5,
            maxHp: 5,
            currentStrength: 2,
            attachments: [],
          },
        ],
      },
      p2: {
        id: "p2",
        name: "Player Two",
        monsterSlots: [
          {
            instanceId: "monster_2",
            cardInstanceId: "p2_target_1",
            cardId: "target",
            currentHp: 4,
            maxHp: 4,
            currentStrength: 1,
            attachments: [],
          },
        ],
      },
    },
  };
}

function playableState({ attackerOverrides = {} } = {}) {
  const base = testState();
  return {
    ...base,
    currentPlayerId: "p1",
    playerOrder: ["p1", "p2"],
    log: [],
    cardsById,
    players: {
      p1: {
        ...base.players.p1,
        stars: { available: 5, spent: 0 },
        finalCleanupStarted: false,
        turnsStarted: 2,
        monsterSlots: [
          {
            ...base.players.p1.monsterSlots[0],
            hasAttackedThisTurn: false,
            actionRestrictions: [],
            ...attackerOverrides,
          },
        ],
      },
      p2: {
        ...base.players.p2,
        stars: { available: 5, spent: 0 },
        finalCleanupStarted: false,
        turnsStarted: 2,
      },
    },
  };
}
