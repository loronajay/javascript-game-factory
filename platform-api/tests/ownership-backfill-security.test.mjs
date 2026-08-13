// The ownership-grandfather window is CLOSED (2026-08-13).
//
// It existed for one migration: when Tactical Arena moved to server-authoritative ownership,
// players' locally-stored units/skins/Valor had to be imported once so the switch lost nothing.
// That import was, by necessity, the one place a client could assert ownership it had not paid
// for — bounded by a one-shot claim row, a catalog whitelist, a cap, and an account-age cutoff,
// but present. Every legitimate account has now migrated, so the endpoint grants nothing at all
// and there is no path left for a client to mint an entitlement or Valor.
//
// The route still exists and still answers ok: the client's boot sync only goes
// server-authoritative once the backfill call has confirmed (OWNERSHIP_BACKFILL_FLAG). Removing
// the endpoint would strand that gate and keep clients in additive mode forever.

import test from "node:test";
import assert from "node:assert/strict";

import { backfillLocalOwnership } from "../src/db/game-progress.mjs";

function createPool({ migrated = false, playerCreatedAt = "2026-08-03T00:00:00.000Z" } = {}) {
  const state = {
    claims: new Set(migrated ? ["migration:local-ownership-v1"] : []),
    entitlements: new Map(),
    valorBalance: 0,
    playerCreatedAt,
  };
  async function query(sql, params = []) {
    const text = String(sql);
    if (["begin", "commit", "rollback"].includes(text)) return { rows: [], rowCount: 0 };
    if (text.includes("insert into game_progress_profiles")) return { rows: [], rowCount: 0 };
    if (text.includes("select 1 from game_entitlements") && text.includes("limit 1")) {
      return { rows: state.entitlements.size ? [{ "?column?": 1 }] : [], rowCount: state.entitlements.size ? 1 : 0 };
    }
    if (text.includes("from accounts") && text.includes("created_at")) {
      return { rows: [{ created_at: state.playerCreatedAt }], rowCount: 1 };
    }
    if (text.includes("insert into game_progress_claims")) {
      const claimId = params[2];
      if (state.claims.has(claimId)) return { rows: [], rowCount: 0 };
      state.claims.add(claimId);
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("insert into game_entitlements")) {
      state.entitlements.set(params[2], params[3]);
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("greatest(valor_balance")) {
      state.valorBalance = Math.max(state.valorBalance, Number(params[2]) || 0);
      return { rows: [], rowCount: 1 };
    }
    if (text.includes("from game_progress_profiles")) {
      return { rows: [{ valor_balance: state.valorBalance, campaign_epoch: 0 }] };
    }
    if (text.includes("from game_entitlements")) return { rows: [] };
    if (text.includes("from game_campaign_progress") || text.includes("from game_inventory_items")
      || text.includes("from game_progress_claims")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  }
  return { state, connect: async () => ({ query, release() {} }), query };
}

// Real catalog entries, so the payload is the strongest one an attacker could send: everything
// passes id-format and catalog-membership validation and is refused anyway.
const REAL_PAYLOAD = {
  playerId: "player-1",
  gameSlug: "tactical-arena",
  entitlementIds: ["unit:monk", "unit:paladin"],
  valorBalance: 500000,
};

// The account ages that used to matter. Neither does now.
for (const [label, playerCreatedAt] of [
  ["pre-cutoff", "2026-07-01T00:00:00.000Z"],
  ["post-cutoff", "2026-08-03T00:00:00.000Z"],
]) {
  test(`a ${label} account cannot grandfather ownership or Valor`, async () => {
    const pool = createPool({ playerCreatedAt });
    const result = await backfillLocalOwnership(pool, REAL_PAYLOAD);

    assert.equal(result.ok, true);
    assert.equal(result.alreadyMigrated, true);
    assert.equal(pool.state.entitlements.size, 0, "granted an entitlement through a closed migration");
    assert.equal(pool.state.valorBalance, 0, "minted Valor through a closed migration");
  });
}

// This was the last opening the security doc called out: a pre-cutoff account the server owned
// nothing for could re-run its consumed migration once, so an attacker holding one of those old
// empty accounts had a single injection left. All such accounts have since migrated.
test("an empty server set no longer reopens a consumed migration", async () => {
  const pool = createPool({ migrated: true, playerCreatedAt: "2026-07-01T00:00:00.000Z" });
  assert.equal(pool.state.entitlements.size, 0, "precondition: server owns nothing");

  const result = await backfillLocalOwnership(pool, REAL_PAYLOAD);

  assert.equal(result.ok, true);
  assert.equal(result.alreadyMigrated, true);
  assert.equal(pool.state.entitlements.size, 0, "the stranded-account repair is still open");
  assert.equal(pool.state.valorBalance, 0);
});

// The client sets OWNERSHIP_BACKFILL_FLAG on any ok response and only then trusts the server's
// set as authoritative. If this stopped answering ok, every client would stay in additive mode
// and injected local ownership would never be reconciled away — the opposite of the intent.
test("the endpoint still confirms, so the client can go server-authoritative", async () => {
  for (const payload of [REAL_PAYLOAD, { playerId: "player-1", gameSlug: "tactical-arena", entitlementIds: [], valorBalance: 0 }]) {
    const result = await backfillLocalOwnership(createPool(), payload);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyMigrated, true);
    assert.ok(result.progress, "the caller needs a snapshot back");
  }
});

test("a malformed request is still rejected rather than silently accepted", async () => {
  const pool = createPool();
  for (const bad of [{ playerId: "", gameSlug: "tactical-arena" }, { playerId: "player-1", gameSlug: "" }]) {
    const result = await backfillLocalOwnership(pool, bad);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
  }
});
