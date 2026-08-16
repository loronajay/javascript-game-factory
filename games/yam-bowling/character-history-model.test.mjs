import test from "node:test";
import assert from "node:assert/strict";

import { buildCharacterHistoryModel } from "./ui/character-history-model.mjs";

const character = { slug: "reina-sato", name: "Reina Sato" };

test("character history joins authoritative mastery with owned collection completion", () => {
  const owned = new Set([
    "skin:reina-sato:canon",
    "victory-pose:reina-sato:canon",
    "player-card:reina-sato",
  ]);
  const model = buildCharacterHistoryModel({
    character,
    status: "ready",
    progression: {
      getBowler: () => ({
        level: 4,
        xpIntoLevel: 150,
        xpForNextLevel: 500,
        isMaxLevel: false,
        matches: 12,
        wins: 7,
        strikes: 30,
        highGame: 201,
      }),
    },
    cosmetics: {
      listForCharacter: () => [
        { id: "skin:reina-sato:canon" },
        { id: "victory-pose:reina-sato:canon" },
        { id: "defeat-pose:reina-sato:canon" },
        { id: "player-card:reina-sato" },
      ],
    },
    loadout: { owns: (itemId) => owned.has(itemId) },
  });

  assert.deepEqual(model, {
    status: "ready",
    heading: "Your Reina Sato",
    level: 4,
    xpLabel: "150 / 500 XP",
    progressPercent: 30,
    matches: 12,
    wins: 7,
    strikes: 30,
    highGame: 201,
    collection: { owned: 3, total: 4, percent: 75, label: "3 / 4 owned" },
  });
});

test("character history withholds cached numbers until the current session is authoritative", () => {
  const progression = {
    getBowler: () => ({ level: 29, matches: 999, wins: 999, strikes: 999, highGame: 300 }),
  };

  for (const [status, message] of [
    ["signed-out", "Sign in to see your history with Reina Sato."],
    ["syncing", "Loading your Reina Sato history…"],
    ["unavailable", "Reina Sato history is unavailable until progression sync succeeds."],
  ]) {
    assert.deepEqual(buildCharacterHistoryModel({ character, status, progression }), {
      status,
      heading: "Your Reina Sato",
      message,
    });
  }
});

test("character history normalizes malformed counts and handles an empty collection", () => {
  const model = buildCharacterHistoryModel({
    character,
    status: "ready",
    progression: {
      getBowler: () => ({
        level: -4,
        xpIntoLevel: 800,
        xpForNextLevel: 0,
        matches: -1,
        wins: "bad",
        strikes: 3.8,
        highGame: Infinity,
      }),
    },
    cosmetics: { listForCharacter: () => [] },
    loadout: { owns: () => true },
  });

  assert.equal(model.level, 1);
  assert.equal(model.progressPercent, 0);
  assert.equal(model.matches, 0);
  assert.equal(model.wins, 0);
  assert.equal(model.strikes, 3);
  assert.equal(model.highGame, 0);
  assert.deepEqual(model.collection, { owned: 0, total: 0, percent: 0, label: "0 / 0 owned" });
});
