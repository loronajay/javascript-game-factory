import test from "node:test";
import assert from "node:assert/strict";

import { createMasteryCelebrationQueue } from "./state/mastery-celebrations.mjs";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

const rewards = {
  rewardsBetween: ({ characterSlug, fromLevel, toLevel }) => Array.from(
    { length: Math.max(0, toLevel - fromLevel) },
    (_, index) => ({
      id: `mastery:${characterSlug}:level-${String(fromLevel + index + 1).padStart(2, "0")}:reward`,
      label: `Level ${fromLevel + index + 1} Reward`,
      level: fromLevel + index + 1,
    }),
  ),
};

test("the first authoritative observation establishes a baseline instead of replaying old levels", () => {
  const queue = createMasteryCelebrationQueue({ storage: memoryStorage(), rewards });

  assert.deepEqual(queue.observe("player-1", [{ slug: "reina-sato", level: 8 }]), []);
  assert.equal(queue.peek("player-1"), null);
});

test("a later level gain is queued once with every reward crossed", () => {
  const queue = createMasteryCelebrationQueue({ storage: memoryStorage(), rewards });
  queue.observe("player-1", [{ slug: "reina-sato", level: 2 }]);

  const added = queue.observe("player-1", [{ slug: "reina-sato", level: 5 }]);
  assert.equal(added.length, 1);
  assert.deepEqual(added[0].rewards.map((reward) => reward.level), [3, 4, 5]);
  assert.equal(queue.peek("player-1").toLevel, 5);

  assert.deepEqual(queue.observe("player-1", [{ slug: "reina-sato", level: 5 }]), []);
  assert.equal(queue.list("player-1").length, 1);
});

test("pending celebrations survive reload and disappear only after acknowledgement", () => {
  const storage = memoryStorage();
  const first = createMasteryCelebrationQueue({ storage, rewards });
  first.observe("player-1", [{ slug: "reina-sato", level: 1 }]);
  first.observe("player-1", [{ slug: "reina-sato", level: 3 }]);

  const reloaded = createMasteryCelebrationQueue({ storage, rewards });
  const pending = reloaded.peek("player-1");
  assert.equal(pending.fromLevel, 1);
  assert.equal(pending.toLevel, 3);
  assert.equal(reloaded.acknowledge("player-1", pending.id), true);
  assert.equal(reloaded.peek("player-1"), null);

  const afterDismiss = createMasteryCelebrationQueue({ storage, rewards });
  assert.equal(afterDismiss.peek("player-1"), null);
});

test("a rollback or malformed snapshot cannot make the same level celebrate twice", () => {
  const queue = createMasteryCelebrationQueue({ storage: memoryStorage(), rewards });
  queue.observe("player-1", [{ slug: "reina-sato", level: 4 }]);
  queue.observe("player-1", [{ slug: "reina-sato", level: 2 }]);
  assert.deepEqual(queue.observe("player-1", [{ slug: "reina-sato", level: 4 }]), []);
  assert.deepEqual(queue.observe("", [{ slug: "reina-sato", level: 9 }]), []);
  assert.deepEqual(queue.observe("player-1", [{ slug: "", level: 9 }, { slug: "reina-sato", level: Number.NaN }]), []);
});

