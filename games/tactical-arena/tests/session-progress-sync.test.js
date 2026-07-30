import test from "node:test";
import assert from "node:assert/strict";

import { createSessionProgressSync } from "../src/platform/sessionProgressSync.js";

test("sign-in refreshes account controls immediately, then live progress after reconciliation", async () => {
  const calls = [];
  let releaseSync;
  const syncPending = new Promise((resolve) => { releaseSync = resolve; });
  const onSessionChanged = createSessionProgressSync({
    shouldSync: () => true,
    refreshAccount: () => calls.push("account"),
    syncProgress: async () => {
      calls.push("sync");
      await syncPending;
    },
    refreshProgress: () => calls.push("progress"),
  });

  let reportedWait = null;
  const result = onSessionChanged({
    detail: {
      waitUntil(promise) {
        reportedWait = promise;
      },
    },
  });
  assert.deepEqual(calls, ["account", "sync"]);
  assert.equal(reportedWait, result);

  releaseSync();
  await reportedWait;
  assert.deepEqual(calls, ["account", "sync", "account", "progress"]);
});

test("a failed live sync restores the UI and does not wedge later sign-ins", async () => {
  const calls = [];
  let attempts = 0;
  const onSessionChanged = createSessionProgressSync({
    shouldSync: () => true,
    refreshAccount: () => calls.push("account"),
    syncProgress: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
    },
    refreshProgress: () => calls.push("progress"),
  });

  await assert.doesNotReject(onSessionChanged());
  await assert.doesNotReject(onSessionChanged());

  assert.equal(attempts, 2);
  assert.equal(calls.filter((call) => call === "progress").length, 2);
});

test("sign-out refreshes account controls without importing account progress", async () => {
  let synced = 0;
  let accountRefreshes = 0;
  const onSessionChanged = createSessionProgressSync({
    shouldSync: () => false,
    refreshAccount: () => { accountRefreshes += 1; },
    syncProgress: async () => { synced += 1; },
    refreshProgress: () => {},
  });

  await onSessionChanged();

  assert.equal(accountRefreshes, 1);
  assert.equal(synced, 0);
});
