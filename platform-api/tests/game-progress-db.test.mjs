import test from "node:test";
import assert from "node:assert/strict";

import {
  isValidGameClaimKind,
  recordGameProgressClaim,
} from "../src/db/game-progress.mjs";

function createGameProgressPool() {
  const state = {
    claims: new Set(),
    valorBalance: 0,
    entitlements: new Map(),
    campaignProgress: new Map(),
  };
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      const text = String(sql);
      if (text === "begin" || text === "commit" || text === "rollback") return { rows: [] };
      if (text.includes("insert into game_progress_profiles")) return { rows: [] };
      if (text.includes("insert into game_progress_claims")) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        if (state.claims.has(key)) return { rowCount: 0, rows: [] };
        state.claims.add(key);
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("update game_progress_profiles")) {
        state.valorBalance += Number(params[2]) || 0;
        return { rows: [] };
      }
      if (text.includes("insert into game_entitlements")) {
        state.entitlements.set(params[2], {
          entitlement_id: params[2],
          kind: params[3],
          source: params[4],
          source_id: params[5],
          quantity: 1,
          created_at: "2026-07-18T00:00:00.000Z",
          updated_at: "2026-07-18T00:00:00.000Z",
        });
        return { rows: [] };
      }
      if (text.includes("insert into game_campaign_progress")) {
        state.campaignProgress.set(params[2], {
          mission_id: params[2],
          stars: params[3],
          completed_at: "2026-07-18T00:00:00.000Z",
          valor_claimed_at: params[4],
          reward_claimed_at: params[5],
        });
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    state,
    calls,
    async connect() {
      return client;
    },
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("from game_progress_profiles")) {
        return {
          rows: [{
            player_id: params[0],
            game_slug: params[1],
            valor_balance: state.valorBalance,
            created_at: "2026-07-18T00:00:00.000Z",
            updated_at: "2026-07-18T00:00:00.000Z",
          }],
        };
      }
      if (text.includes("from game_entitlements")) return { rows: [...state.entitlements.values()] };
      if (text.includes("from game_campaign_progress")) return { rows: [...state.campaignProgress.values()] };
      if (text.includes("from game_inventory_items")) return { rows: [] };
      return { rows: [] };
    },
  };
  return pool;
}

test("tutorial progress claim kinds are accepted by platform validation", () => {
  assert.equal(isValidGameClaimKind("tutorial-complete"), true);
  assert.equal(isValidGameClaimKind("tutorial-valor"), true);
  assert.equal(isValidGameClaimKind("tutorial-unit-reward"), true);
  assert.equal(isValidGameClaimKind("tutorial-skin-choice"), true);
});

test("recordGameProgressClaim applies tutorial Valor and entitlement claims idempotently", async () => {
  const pool = createGameProgressPool();
  const common = { playerId: "player-1", gameSlug: "tactical-arena" };

  const completion = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-complete:basics",
    kind: "tutorial-complete",
    sourceId: "basics",
    payload: { tutorialId: "basics" },
  });
  const valor = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: { amount: 500 },
  });
  const unit = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-unit-reward:all-tutorials:juggernaut",
    kind: "tutorial-unit-reward",
    sourceId: "all-tutorials",
    payload: { type: "juggernaut", entitlementId: "unit:juggernaut" },
  });
  const skin = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-skin-choice:juggernaut:bio-mech",
    kind: "tutorial-skin-choice",
    sourceId: "all-tutorials",
    payload: { type: "juggernaut", slug: "bio-mech", entitlementId: "skin:juggernaut:bio-mech" },
  });
  const duplicateValor = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "tutorial-valor:all-tutorials",
    kind: "tutorial-valor",
    sourceId: "all-tutorials",
    payload: { amount: 500 },
  });

  assert.equal(completion.ok, true);
  assert.equal(valor.progress.valorBalance, 500);
  assert.equal(unit.progress.entitlements.some((entry) => entry.entitlementId === "unit:juggernaut" && entry.source === "tutorial"), true);
  assert.equal(skin.progress.entitlements.some((entry) => entry.entitlementId === "skin:juggernaut:bio-mech" && entry.source === "tutorial"), true);
  assert.equal(duplicateValor.alreadyProcessed, true);
  assert.equal(duplicateValor.progress.valorBalance, 500);
});

test("recordGameProgressClaim refuses premium kinds unless the trusted Stripe path sets allowPremiumKinds", async () => {
  const pool = createGameProgressPool();
  const common = { playerId: "player-1", gameSlug: "tactical-arena" };

  // Untrusted caller (public route) — must be refused, nothing granted.
  const forged = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "forged:cs_fake",
    kind: "premium-skin-purchase",
    sourceId: "cs_fake",
    payload: { entitlementIds: ["skin:swordsman:medieval"] },
  });
  assert.equal(forged, null);
  assert.equal(pool.state.entitlements.has("skin:swordsman:medieval"), false);

  // Trusted Stripe fulfillment path — allowed to grant the paid entitlement.
  const paid = await recordGameProgressClaim(pool, {
    ...common,
    claimId: "stripe-checkout:cs_real",
    kind: "premium-skin-purchase",
    sourceId: "cs_real",
    allowPremiumKinds: true,
    payload: { entitlementIds: ["skin:swordsman:medieval"] },
  });
  assert.equal(paid.ok, true);
  assert.equal(pool.state.entitlements.has("skin:swordsman:medieval"), true);
});
