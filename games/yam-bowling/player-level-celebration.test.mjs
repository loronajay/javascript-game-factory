import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createPlayerLevelCelebrationQueue } from "./state/player-level-celebrations.mjs";

const require = createRequire(import.meta.url);
const playerRewards = require("./player-rewards-core.js");

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const rewards = {
  rewardsBetween: ({ fromLevel, toLevel }) => Array.from(
    { length: Math.max(0, toLevel - fromLevel) },
    (_, index) => ({
      id: `player:level-${String(fromLevel + index + 1).padStart(2, "0")}:reward`,
      family: "ball-trail",
      label: `Level ${fromLevel + index + 1} Reward`,
      level: fromLevel + index + 1,
      equipment: {
        scope: "global",
        slot: "ballTrail",
        itemId: `ball-trail:level-${fromLevel + index + 1}`,
      },
    }),
  ),
};

test("the first authoritative player level establishes a baseline", () => {
  const queue = createPlayerLevelCelebrationQueue({ storage: memoryStorage(), rewards });

  assert.deepEqual(queue.observe("player-1", { level: 8 }), []);
  assert.equal(queue.peek("player-1"), null);
});

test("a multi-level player gain queues one celebration containing every crossed reward", () => {
  const queue = createPlayerLevelCelebrationQueue({ storage: memoryStorage(), rewards });
  queue.observe("player-1", { level: 2 });

  const added = queue.observe("player-1", { level: 5 });

  assert.equal(added.length, 1);
  assert.equal(added[0].track, "player");
  assert.equal(added[0].fromLevel, 2);
  assert.equal(added[0].toLevel, 5);
  assert.deepEqual(added[0].rewards.map((reward) => reward.level), [3, 4, 5]);
  assert.deepEqual(added[0].rewards[0].equipment, {
    scope: "global",
    slot: "ballTrail",
    itemId: "ball-trail:level-3",
  });
  assert.deepEqual(queue.observe("player-1", { level: 5 }), []);
  assert.equal(queue.list("player-1").length, 1);
});

test("the live player ladder announces the complete Emerald set when level five is crossed", () => {
  const queue = createPlayerLevelCelebrationQueue({ storage: memoryStorage(), rewards: playerRewards });
  queue.observe("player-1", { level: 4 });

  const [event] = queue.observe("player-1", { level: 5 });

  assert.deepEqual(event.rewards.map((reward) => reward.label), [
    "Emerald Glow Ball Trail",
    "Emerald Impact Burst",
  ]);
  assert.deepEqual(event.rewards.map((reward) => reward.equipment.itemId), [
    "ball-trail:emerald-glow",
    "strike-burst:emerald-impact",
  ]);
});

test("pending player celebrations persist until acknowledged", () => {
  const storage = memoryStorage();
  const first = createPlayerLevelCelebrationQueue({ storage, rewards });
  first.observe("player-1", { level: 1 });
  first.observe("player-1", { level: 3 });

  const reloaded = createPlayerLevelCelebrationQueue({ storage, rewards });
  const pending = reloaded.peek("player-1");
  assert.equal(pending.toLevel, 3);
  assert.equal(reloaded.acknowledge("player-1", pending.id), true);
  assert.equal(reloaded.peek("player-1"), null);
});

test("rollback and malformed observations cannot replay a player level", () => {
  const queue = createPlayerLevelCelebrationQueue({ storage: memoryStorage(), rewards });
  queue.observe("player-1", { level: 4 });
  queue.observe("player-1", { level: 2 });

  assert.deepEqual(queue.observe("player-1", { level: 4 }), []);
  assert.deepEqual(queue.observe("", { level: 9 }), []);
  assert.deepEqual(queue.observe("player-1", { level: Number.NaN }), []);
});
