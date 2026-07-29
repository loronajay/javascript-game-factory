import test from "node:test";
import assert from "node:assert/strict";

import {
  recoverPlayPurchasesForAccount,
  suppressAccountRestoreAnnouncements,
} from "../src/platform/bootProgressSync.js";
import { readUnlockProgress, writeUnlockProgress } from "../src/progression/unlocks.js";
import {
  enqueueUnitUnlockAnnouncements,
  readProgressionAnnouncements,
} from "../src/progression/announcements.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("signed-in progress sync recovers and settles unfinished Play purchases", async () => {
  const calls = [];
  const account = { authenticated: true, token: "token-1" };
  const verifier = async () => ({ ok: true });

  const result = await recoverPlayPurchasesForAccount(account, {
    createVerifier: () => verifier,
    recoverPurchases: async (options) => {
      calls.push(options);
      return { skipped: false, recovered: 1, failed: 0 };
    },
  });

  assert.deepEqual(result, { skipped: false, recovered: 1, failed: 0 });
  assert.equal(calls[0].account, account);
  assert.equal(calls[0].verifyPurchase, verifier);
});

test("signed-out progress sync leaves Play purchases untouched for their owning account", async () => {
  let called = 0;
  const result = await recoverPlayPurchasesForAccount(
    { authenticated: false },
    { recoverPurchases: async () => { called += 1; } },
  );

  assert.equal(called, 0);
  assert.deepEqual(result, { skipped: true, recovered: 0, failed: 0 });
});

test("the first fixed sync clears unlock popups stranded by the old restore bug", () => {
  const storage = storageAdapter();
  const progress = writeUnlockProgress(storage, {
    ...readUnlockProgress(storage),
    unlockedUnits: [...readUnlockProgress(storage).unlockedUnits, "clod"],
  });
  enqueueUnitUnlockAnnouncements(storage, ["clod"], { ignoreSeen: true });
  assert.equal(readProgressionAnnouncements(storage).length, 1);

  suppressAccountRestoreAnnouncements(storage, progress, progress);

  assert.deepEqual(readProgressionAnnouncements(storage), []);
});
