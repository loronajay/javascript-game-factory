import test from "node:test";
import assert from "node:assert/strict";

import { redeemYamBowlingSkinVoucher } from "../src/db/game-progress.mjs";
import { isPremiumGameClaimKind, isPublicGameClaimKind } from "../src/services/game-progress-claim-catalog.mjs";

function makePool({ vouchers = 1, swimsuitVouchers = 0 } = {}) {
  const state = {
    inventory: new Map([
      ["skin-voucher", vouchers],
      ["swimsuit-voucher", swimsuitVouchers],
    ]),
    entitlements: new Map(),
    claims: new Map(),
    transactions: [],
  };
  const client = {
    async query(sql, params = []) {
      const text = String(sql).trim();
      if (["begin", "commit", "rollback"].includes(text)) {
        state.transactions.push(text);
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("insert into game_progress_profiles")) return { rows: [], rowCount: 1 };
      if (text.startsWith("insert into game_progress_claims")) {
        const key = `${params[0]}:${params[1]}:${params[2]}`;
        if (state.claims.has(key)) return { rows: [], rowCount: 0 };
        state.claims.set(key, {});
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("select payload from game_progress_claims")) {
        return { rows: [{ payload: state.claims.get(`${params[0]}:${params[1]}:${params[2]}`) }] };
      }
      if (text.startsWith("select 1 from game_entitlements")) {
        const owned = state.entitlements.has(params[2]);
        return { rows: owned ? [{ "?column?": 1 }] : [], rowCount: owned ? 1 : 0 };
      }
      if (text.startsWith("update game_inventory_items")) {
        const itemId = params[2];
        const quantity = state.inventory.get(itemId) || 0;
        if (quantity < 1) return { rows: [], rowCount: 0 };
        state.inventory.set(itemId, quantity - 1);
        return { rows: [{ quantity: quantity - 1 }], rowCount: 1 };
      }
      if (text.startsWith("insert into game_entitlements")) {
        state.entitlements.set(params[2], { entitlement_id: params[2], kind: params[3] });
        return { rows: [], rowCount: 1 };
      }
      if (text.startsWith("update game_progress_claims set payload")) {
        state.claims.set(`${params[0]}:${params[1]}:${params[2]}`, JSON.parse(params[3]));
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unhandled query: ${text.slice(0, 100)}`);
    },
    release() {},
  };
  const pool = {
    connect: async () => client,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes("from game_progress_profiles")) return { rows: [{}] };
      if (text.includes("from game_entitlements")) {
        return { rows: [...state.entitlements.values()].map((row) => ({
          ...row,
          source: "skin-voucher",
          source_id: "redeem-1",
          quantity: 1,
        })) };
      }
      if (text.includes("from game_inventory_items")) {
        return { rows: [...state.inventory]
          .filter(([, quantity]) => quantity > 0)
          .map(([item_id, quantity]) => ({ item_id, quantity })) };
      }
      return { rows: [] };
    },
    state,
  };
  return pool;
}

const request = {
  playerId: "player-1",
  gameSlug: "yam-bowling",
  entitlementId: "skin:daisy-monroe:maid",
  redemptionId: "redeem-1",
};

test("paid voucher inventory grants are trusted-only Yam Bowling claims", () => {
  assert.equal(isPremiumGameClaimKind("yam-bowling", "premium-inventory-purchase"), true);
  assert.equal(isPublicGameClaimKind("yam-bowling", "premium-inventory-purchase"), false);
});

test("skin voucher redemption decrements and grants in one transaction", async () => {
  const pool = makePool();

  const result = await redeemYamBowlingSkinVoucher(pool, request);

  assert.equal(result.ok, true);
  assert.equal(result.alreadyProcessed, false);
  assert.equal(pool.state.inventory.get("skin-voucher"), 0);
  assert.equal(pool.state.entitlements.has(request.entitlementId), true);
  assert.deepEqual(pool.state.transactions, ["begin", "commit"]);
  assert.deepEqual(result.progress.entitlements.map((entry) => entry.entitlementId), [request.entitlementId]);
});

test("retrying a redemption id replays its result without spending again", async () => {
  const pool = makePool();

  await redeemYamBowlingSkinVoucher(pool, request);
  const replay = await redeemYamBowlingSkinVoucher(pool, request);

  assert.equal(replay.ok, true);
  assert.equal(replay.alreadyProcessed, true);
  assert.equal(pool.state.inventory.get("skin-voucher"), 0);
});

test("swimsuits consume only Swimsuit Vouchers and regular skins consume only Skin Vouchers", async () => {
  const swimsuitRequest = {
    ...request,
    entitlementId: "skin:daisy-monroe:swimsuit",
    redemptionId: "redeem-swimsuit",
  };

  const wrongForSwimsuit = makePool({ vouchers: 1, swimsuitVouchers: 0 });
  assert.equal((await redeemYamBowlingSkinVoucher(wrongForSwimsuit, swimsuitRequest)).error, "voucher_not_owned");
  assert.equal(wrongForSwimsuit.state.inventory.get("skin-voucher"), 1, "regular voucher was not spent");

  const swimsuit = makePool({ vouchers: 0, swimsuitVouchers: 1 });
  assert.equal((await redeemYamBowlingSkinVoucher(swimsuit, swimsuitRequest)).ok, true);
  assert.equal(swimsuit.state.inventory.get("swimsuit-voucher"), 0);

  const wrongForMaid = makePool({ vouchers: 0, swimsuitVouchers: 1 });
  assert.equal((await redeemYamBowlingSkinVoucher(wrongForMaid, request)).error, "voucher_not_owned");
  assert.equal(wrongForMaid.state.inventory.get("swimsuit-voucher"), 1, "swimsuit voucher was not spent");
});

test("redemption refuses an empty balance, an owned skin, and forged targets", async () => {
  const empty = makePool({ vouchers: 0 });
  assert.equal((await redeemYamBowlingSkinVoucher(empty, request)).error, "voucher_not_owned");

  const owned = makePool();
  owned.state.entitlements.set(request.entitlementId, { entitlement_id: request.entitlementId, kind: "skin" });
  assert.equal((await redeemYamBowlingSkinVoucher(owned, request)).error, "skin_already_owned");

  assert.equal((await redeemYamBowlingSkinVoucher(makePool(), {
    ...request,
    entitlementId: "skin:daisy-monroe:canon",
  })).error, "invalid_skin_target");
});
