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

test("a migrated account created after the repair cutoff cannot reopen an empty ownership backfill", async () => {
  const pool = createPool({ migrated: true, playerCreatedAt: "2026-08-03T00:00:00.000Z" });
  const result = await backfillLocalOwnership(pool, {
    playerId: "player-new",
    gameSlug: "tactical-arena",
    entitlementIds: ["unit:blacksword"],
    valorBalance: 999999,
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyMigrated, true);
  assert.equal(pool.state.entitlements.size, 0);
  assert.equal(pool.state.valorBalance, 0);
});

test("a first backfill rejects nonexistent catalog items even when their id format looks valid", async () => {
  const pool = createPool();
  const result = await backfillLocalOwnership(pool, {
    playerId: "player-new",
    gameSlug: "tactical-arena",
    entitlementIds: ["unit:not-a-real-unit", "skin:not-real:but-shaped"],
    valorBalance: 0,
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyMigrated, false);
  assert.equal(pool.state.entitlements.size, 0);
  assert.equal(pool.state.claims.has("migration:local-ownership-v1"), false);
});

test("an account created after the migration cutoff cannot use a first backfill to mint real catalog items or Valor", async () => {
  const pool = createPool({ playerCreatedAt: "2026-08-03T00:00:00.000Z" });
  const result = await backfillLocalOwnership(pool, {
    playerId: "player-new",
    gameSlug: "tactical-arena",
    entitlementIds: ["unit:blacksword", "skin:swordsman:medieval"],
    valorBalance: 999999,
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyMigrated, true);
  assert.equal(pool.state.entitlements.size, 0);
  assert.equal(pool.state.valorBalance, 0);
});

test("a pre-cutoff account consumed by the old empty-backfill bug can still repair once", async () => {
  const pool = createPool({ migrated: true, playerCreatedAt: "2026-07-01T00:00:00.000Z" });
  const result = await backfillLocalOwnership(pool, {
    playerId: "player-legacy",
    gameSlug: "tactical-arena",
    entitlementIds: ["unit:sniper"],
    valorBalance: 700,
  });

  assert.equal(result.ok, true);
  assert.equal(result.alreadyMigrated, false);
  assert.equal(pool.state.entitlements.has("unit:sniper"), true);
  assert.equal(pool.state.valorBalance, 700);
});
