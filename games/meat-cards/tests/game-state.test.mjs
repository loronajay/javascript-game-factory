import test from "node:test";
import assert from "node:assert/strict";

import { createMatch, endTurn, equipAccessory, startTurn, summonMonster } from "../src/engine/game-state.mjs";

const cardsById = {
  monster_a: {
    id: "monster_a",
    type: "monster",
    name: "Monster A",
    summonCostStars: 2,
    printedHp: 5,
    printedStrength: 3,
  },
  monster_b: {
    id: "monster_b",
    type: "monster",
    name: "Monster B",
    summonCostStars: 2,
    printedHp: 5,
    printedStrength: 3,
  },
  later_a: {
    id: "later_a",
    type: "later",
    name: "Later A",
    playCostStars: 1,
    effects: [],
  },
  accessory_a: {
    id: "accessory_a",
    type: "accessory",
    name: "Accessory A",
    baseEquipCostStars: 1,
    effects: [],
  },
  polar_shift: {
    id: "polar_shift",
    type: "accessory",
    name: "Polar Shift",
    baseEquipCostStars: 1,
    effects: [
      {
        family: "strengthChange",
        timing: "whileEquipped",
        target: "equippedMonster",
        duration: "whileEquipped",
        payload: {
          mode: "setToCurrentMaxHp",
          requiresCurrentStrengthGreaterThan: 0,
        },
      },
    ],
  },
  conjoined_twins: {
    id: "conjoined_twins",
    type: "monster",
    name: "Conjoined Twins",
    summonCostStars: 2,
    printedHp: 4,
    printedStrength: 2,
    effectSlots: [
      {
        id: "two",
        kind: "passive",
        name: "Two",
        rulesText: "This monster can have up to 2 accessories equipped.",
        effects: [
          {
            family: "accessorySlotModification",
            timing: "whileInPlay",
            target: "selfMonster",
            payload: {
              mode: "setCapacity",
              capacity: 2,
            },
          },
        ],
      },
    ],
  },
};

test("player two draws two cards on their first turn", () => {
  let state = startTurn(createTestMatch());

  assert.equal(state.players.p1.hand.length, 6);
  assert.equal(state.players.p2.hand.length, 5);

  state = startTurn(endTurn(state));

  assert.equal(state.currentPlayerId, "p2");
  assert.equal(state.players.p2.hand.length, 7);
  assert.equal(state.players.p2.deck.length, 3);
});

test("player two takes deck-out damage for failed cards from their first-turn draw two", () => {
  let state = startTurn(
    createTestMatch({
      p2DeckEntries: [{ cardId: "monster_b", count: 6 }],
    }),
  );

  state = startTurn(endTurn(state));

  assert.equal(state.players.p2.hand.length, 6);
  assert.equal(state.players.p2.deck.length, 0);
  assert.equal(state.players.p2.currentHp, 18);
});

test("failed starting hand draws deal deck-out damage", () => {
  const state = createTestMatch({
    p1DeckEntries: [{ cardId: "monster_a", count: 3 }],
  });

  assert.equal(state.players.p1.hand.length, 3);
  assert.equal(state.players.p1.deck.length, 0);
  assert.equal(state.players.p1.currentHp, 16);
});

test("unused stars damage the active player when they end the turn", () => {
  let state = startTurn(createTestMatch());
  const p1Card = state.players.p1.hand.find((card) => card.cardId === "monster_a");

  state = summonMonster(state, { playerId: "p1", handCardInstanceId: p1Card.instanceId, slotIndex: 0 });
  state = endTurn(state);

  assert.equal(state.players.p1.stars.spent, 2);
  assert.equal(state.players.p1.currentHp, 17);
  assert.equal(state.currentPlayerId, "p2");
});

test("final discards cover unused star penalty before hand-limit cleanup", () => {
  let state = startTurn(createTestMatch());
  const coverDiscards = state.players.p1.hand.slice(0, 5).map((card) => card.instanceId);

  state = endTurn(state, { unusedStarDiscardInstanceIds: coverDiscards });

  assert.equal(state.players.p1.currentHp, 20);
  assert.equal(state.players.p1.hand.length, 1);
  assert.equal(state.players.p1.graveyard.length, 5);
});

test("players must discard down to seven before passing the turn", () => {
  let state = startTurn(
    createTestMatch({
      p1DeckEntries: [{ cardId: "monster_a", count: 8 }],
    }),
  );

  assert.equal(state.players.p1.hand.length, 6);
  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1,
        hand: [
          ...state.players.p1.hand,
          { instanceId: "extra_1", cardId: "later_a", ownerDeckId: "extra" },
          { instanceId: "extra_2", cardId: "later_a", ownerDeckId: "extra" },
        ],
      },
    },
  };

  assert.throws(() => endTurn(state), /discard down to 7/i);

  state = endTurn(state, { handLimitDiscardInstanceIds: ["extra_1"] });

  assert.equal(state.players.p1.hand.length, 7);
  assert.equal(state.players.p1.graveyard.at(-1).instanceId, "extra_1");
  assert.equal(state.currentPlayerId, "p2");
});

test("hand-limit cleanup cannot discard extra cards below seven", () => {
  const state = startTurn(createTestMatch());

  assert.throws(
    () => endTurn(state, { handLimitDiscardInstanceIds: [state.players.p1.hand[0].instanceId] }),
    /no hand-limit discards/i,
  );
});

test("delayed star costs are applied before the player can spend stars", () => {
  let state = createTestMatch();
  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1,
        delayedStarsOwed: 2,
      },
    },
  };

  state = startTurn(state);

  assert.equal(state.players.p1.stars.available, 5);
  assert.equal(state.players.p1.stars.spent, 2);
});

test("Polar Shift cannot equip to a monster with zero strength", () => {
  let state = startTurn(
    createTestMatch({
      p1DeckEntries: [
        { cardId: "monster_a", count: 1 },
        { cardId: "polar_shift", count: 1 },
        { cardId: "monster_a", count: 8 },
      ],
    }),
  );
  const monsterCard = state.players.p1.hand.find((card) => card.cardId === "monster_a");
  const polarShift = state.players.p1.hand.find((card) => card.cardId === "polar_shift");

  state = summonMonster(state, { playerId: "p1", handCardInstanceId: monsterCard.instanceId, slotIndex: 0 });
  state = {
    ...state,
    players: {
      ...state.players,
      p1: {
        ...state.players.p1,
        monsterSlots: state.players.p1.monsterSlots.map((monster, index) =>
          index === 0 ? { ...monster, currentStrength: 0 } : monster,
        ),
      },
    },
  };

  assert.throws(
    () => equipAccessory(state, { playerId: "p1", handCardInstanceId: polarShift.instanceId, monsterSlotIndex: 0 }),
    /requires a monster with strength above 0/i,
  );
});

test("Polar Shift equips to nonzero-strength monsters and sets strength to max HP", () => {
  let state = startTurn(
    createTestMatch({
      p1DeckEntries: [
        { cardId: "monster_a", count: 1 },
        { cardId: "polar_shift", count: 1 },
        { cardId: "monster_a", count: 8 },
      ],
    }),
  );
  const monsterCard = state.players.p1.hand.find((card) => card.cardId === "monster_a");
  const polarShift = state.players.p1.hand.find((card) => card.cardId === "polar_shift");

  state = summonMonster(state, { playerId: "p1", handCardInstanceId: monsterCard.instanceId, slotIndex: 0 });
  state = equipAccessory(state, { playerId: "p1", handCardInstanceId: polarShift.instanceId, monsterSlotIndex: 0 });

  const monster = state.players.p1.monsterSlots[0];
  assert.equal(monster.currentStrength, monster.maxHp);
  assert.equal(monster.attachments.length, 1);
});

test("Conjoined Twins can equip a second accessory", () => {
  let state = startTurn(
    createTestMatch({
      p1DeckEntries: [
        { cardId: "conjoined_twins", count: 1 },
        { cardId: "accessory_a", count: 2 },
        { cardId: "monster_a", count: 7 },
      ],
    }),
  );
  const twinsCard = state.players.p1.hand.find((card) => card.cardId === "conjoined_twins");

  state = summonMonster(state, { playerId: "p1", handCardInstanceId: twinsCard.instanceId, slotIndex: 0 });
  for (const accessory of state.players.p1.hand.filter((card) => card.cardId === "accessory_a")) {
    state = equipAccessory(state, { playerId: "p1", handCardInstanceId: accessory.instanceId, monsterSlotIndex: 0 });
  }

  assert.equal(state.players.p1.monsterSlots[0].attachments.length, 2);
});

function createTestMatch({
  p1DeckEntries = [{ cardId: "monster_a", count: 10 }],
  p2DeckEntries = [{ cardId: "monster_b", count: 10 }],
} = {}) {
  return createMatch({
    cardsById,
    players: [
      { id: "p1", name: "Player One", deck: { id: "p1_deck", entries: p1DeckEntries } },
      { id: "p2", name: "Player Two", deck: { id: "p2_deck", entries: p2DeckEntries } },
    ],
  });
}
