import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { createCampaignProgressClient } from "./campaign-progress-client.mjs";

const require = createRequire(import.meta.url);
const Campaign = require("./campaign-core.js");

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

function firstClearSnapshot() {
  return {
    campaignProgress: [{ missionId: "local-hazel-ward", stars: 1 }],
    entitlements: [{ entitlementId: "bowler:hazel-ward", kind: "bowler" }],
  };
}

test("boot sync applies only the authenticated server snapshot", async () => {
  const store = Campaign.createCampaignStore({ storage: memoryStorage() });
  const client = createCampaignProgressClient({
    campaignStore: store,
    platformApi: { fetchGameProgress: async (slug) => {
      assert.equal(slug, "yam-bowling");
      return firstClearSnapshot();
    } },
  });

  assert.equal(client.isReady(), false);
  assert.equal(await client.sync(), true);
  assert.equal(client.isReady(), true);
  assert.equal(store.getCurrentMatch().id, "local-piper-hart");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), true);
});

test("a circuit clear changes ownership only after the claim returns a server snapshot", async () => {
  const store = Campaign.createCampaignStore({ storage: memoryStorage() });
  let releaseClaim;
  const pendingClaim = new Promise((resolve) => { releaseClaim = resolve; });
  const client = createCampaignProgressClient({
    campaignStore: store,
    platformApi: {
      fetchGameProgress: async () => ({ campaignProgress: [], entitlements: [] }),
      recordGameProgressClaim: async (slug, claim) => {
        assert.equal(slug, "yam-bowling");
        assert.deepEqual(claim, {
          claimId: "circuit-clear:local-hazel-ward",
          kind: "circuit-clear",
          sourceId: "local-hazel-ward",
          payload: { matchId: "local-hazel-ward" },
        });
        return pendingClaim;
      },
    },
  });
  await client.sync();

  const resultPromise = client.claimCircuitClear("local-hazel-ward");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), false);
  releaseClaim({ ok: true, alreadyProcessed: false, progress: firstClearSnapshot() });

  const result = await resultPromise;
  assert.equal(result.ok, true);
  assert.equal(result.firstClear, true);
  assert.equal(result.unlockedBowlerSlug, "hazel-ward");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), true);
});

test("a failed claim never falls back to a local character grant", async () => {
  const store = Campaign.createCampaignStore({ storage: memoryStorage() });
  const client = createCampaignProgressClient({
    campaignStore: store,
    platformApi: {
      fetchGameProgress: async () => ({ campaignProgress: [], entitlements: [] }),
      recordGameProgressClaim: async () => null,
    },
  });
  await client.sync();

  const result = await client.claimCircuitClear("local-hazel-ward");
  assert.equal(result.ok, false);
  assert.equal(store.getCurrentMatch().id, "local-hazel-ward");
  assert.equal(store.getUnlockedBowlerSlugs().includes("hazel-ward"), false);
});
