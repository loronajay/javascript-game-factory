import test from "node:test";
import assert from "node:assert/strict";

import { createTournamentClient } from "./tournament-client.mjs";

test("tournament sync uses the server schedule and a round claim applies only the authoritative reward snapshot", async () => {
  const calls = [];
  const applied = [];
  const open = {
    status: "open",
    event: { id: "yam-major-0000", rounds: [{ index: 0 }] },
    completedRoundIndexes: [],
  };
  const progress = {
    entitlements: [{ entitlementId: "ball-trail:championship-gold" }],
    inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }],
  };
  const client = createTournamentClient({
    platformApi: {
      fetchGameTournament: async (slug) => { calls.push(["get", slug]); return open; },
      claimGameTournamentRound: async (slug, value) => {
        calls.push(["post", slug, value]);
        return {
          ok: true,
          prize: { kind: "entitlement", entitlementId: "ball-trail:championship-gold", name: "Championship Gold Ball Trail" },
          tournament: { ...open, completedRoundIndexes: [0] },
          progress,
        };
      },
    },
    loadout: { applyServerEntitlements: (rows) => applied.push(["entitlements", rows]) },
    voucherClient: { applyProgress: (snapshot) => applied.push(["inventory", snapshot]) },
    onSnapshotApplied: (snapshot) => applied.push(["snapshot", snapshot]),
  });

  assert.equal(await client.sync(), true);
  const result = await client.claimRound({
    eventId: "yam-major-0000",
    roundIndex: 0,
    bowlerSlug: "daisy-monroe",
  });

  assert.deepEqual(calls, [
    ["get", "yam-bowling"],
    ["post", "yam-bowling", { eventId: "yam-major-0000", roundIndex: 0, bowlerSlug: "daisy-monroe" }],
  ]);
  assert.equal(result.ok, true);
  assert.deepEqual(client.getState().completedRoundIndexes, [0]);
  assert.deepEqual(applied, [
    ["entitlements", progress.entitlements],
    ["inventory", progress],
    ["snapshot", progress],
  ]);
});

test("a refused round never changes local tournament or ownership state", async () => {
  const applied = [];
  const client = createTournamentClient({
    platformApi: {
      fetchGameTournament: async () => ({ status: "open", event: { id: "event" }, completedRoundIndexes: [] }),
      claimGameTournamentRound: async () => null,
    },
    loadout: { applyServerEntitlements: () => applied.push("entitlements") },
    voucherClient: { applyProgress: () => applied.push("inventory") },
  });
  await client.sync();

  assert.deepEqual(await client.claimRound({ eventId: "event", roundIndex: 0, bowlerSlug: "daisy-monroe" }), {
    ok: false,
    error: "claim_failed",
  });
  assert.deepEqual(client.getState().completedRoundIndexes, []);
  assert.deepEqual(applied, []);
});
