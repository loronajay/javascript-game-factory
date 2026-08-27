import test from "node:test";
import assert from "node:assert/strict";

import { buildVoucherChoices, createVoucherClient } from "./profile/voucher-client.mjs";
import { VOUCHER_STORE_OFFERS, createVoucherStoreClient, formatVoucherPrice } from "./profile/voucher-store-client.mjs";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("redemption choices include only unowned alternate skins for owned bowlers", () => {
  const choices = buildVoucherChoices({
    ownedBowlers: [{ slug: "daisy-monroe", name: "Daisy Monroe" }, { slug: "nia-brooks", name: "Nia Brooks" }],
    availableSkins: [
      { id: "canon", name: "Classic" },
      { id: "swimsuit", name: "Swimsuit" },
      { id: "maid", name: "Maid Café" },
      { id: "halloween", name: "Halloween" },
    ],
    owns: (itemId) => itemId === "skin:daisy-monroe:maid",
  });

  assert.deepEqual(choices.map(({ entitlementId }) => entitlementId), [
    "skin:daisy-monroe:swimsuit",
    "skin:daisy-monroe:halloween",
    "skin:nia-brooks:swimsuit",
    "skin:nia-brooks:maid",
    "skin:nia-brooks:halloween",
  ]);
  assert.deepEqual(choices.map(({ voucherItemId }) => voucherItemId), [
    "swimsuit-voucher",
    "skin-voucher",
    "swimsuit-voucher",
    "skin-voucher",
    "skin-voucher",
  ]);
});

test("voucher balance is derived from the authoritative game inventory", () => {
  const client = createVoucherClient({ platformApi: {}, loadout: {} });

  client.applyProgress({
    inventoryItems: [
      { itemId: "other-item", quantity: 9 },
      { itemId: "skin-voucher", quantity: 2 },
    ],
  });

  assert.deepEqual(client.getState(), { balance: 2, swimsuitBalance: 0, status: "ready", error: "" });
});

test("redeeming sends an idempotent request and applies the returned entitlement snapshot", async () => {
  const calls = [];
  const applied = [];
  const progress = {
    inventoryItems: [{ itemId: "skin-voucher", quantity: 0 }],
    entitlements: [{ entitlementId: "skin:daisy-monroe:maid" }],
  };
  const client = createVoucherClient({
    platformApi: {
      redeemGameSkinVoucher: async (gameSlug, input) => {
        calls.push([gameSlug, input]);
        return { ok: true, gameProgress: progress };
      },
    },
    loadout: { applyServerEntitlements: (value) => applied.push(value) },
    createRedemptionId: () => "redemption-7",
  });
  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });

  assert.equal(await client.redeem("skin:daisy-monroe:maid"), true);
  assert.deepEqual(calls, [["yam-bowling", {
    entitlementId: "skin:daisy-monroe:maid",
    redemptionId: "redemption-7",
  }]]);
  assert.deepEqual(applied, [progress.entitlements]);
  assert.deepEqual(client.getState(), { balance: 0, swimsuitBalance: 0, status: "ready", error: "" });
});

test("redeeming is refused locally without a voucher or valid skin entitlement", async () => {
  let calls = 0;
  const client = createVoucherClient({
    platformApi: { redeemGameSkinVoucher: async () => { calls += 1; } },
    loadout: {},
  });
  client.applyProgress({ inventoryItems: [] });

  assert.equal(await client.redeem("skin:daisy-monroe:maid"), false);
  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });
  assert.equal(await client.redeem("room:default"), false);
  assert.equal(calls, 0);
});

test("regular Skin Vouchers cannot unlock swimsuits and Swimsuit Vouchers cannot unlock regular skins", async () => {
  const calls = [];
  const client = createVoucherClient({
    platformApi: {
      redeemGameSkinVoucher: async (_gameSlug, body) => {
        calls.push(body.entitlementId);
        return {
          ok: true,
          gameProgress: { inventoryItems: [{ itemId: "skin-voucher", quantity: 0 }], entitlements: [] },
        };
      },
    },
    loadout: {},
  });

  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });
  assert.equal(await client.redeem("skin:daisy-monroe:swimsuit"), false);
  assert.deepEqual(calls, []);
  assert.equal(await client.redeem("skin:daisy-monroe:maid"), true);
  assert.deepEqual(calls, ["skin:daisy-monroe:maid"]);

  client.applyProgress({ inventoryItems: [{ itemId: "swimsuit-voucher", quantity: 1 }] });
  assert.equal(await client.redeem("skin:nia-brooks:maid"), false);
  assert.equal(await client.redeem("skin:nia-brooks:swimsuit"), true);
  assert.deepEqual(calls, ["skin:daisy-monroe:maid", "skin:nia-brooks:swimsuit"]);
});

test("a regular Skin Voucher unlocks a Halloween skin", async () => {
  const calls = [];
  const client = createVoucherClient({
    platformApi: {
      redeemGameSkinVoucher: async (_gameSlug, body) => {
        calls.push(body.entitlementId);
        return {
          ok: true,
          gameProgress: {
            inventoryItems: [{ itemId: "skin-voucher", quantity: 0 }],
            entitlements: [{ entitlementId: body.entitlementId }],
          },
        };
      },
    },
    loadout: {},
  });

  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });

  assert.equal(await client.redeem("skin:daisy-monroe:halloween"), true);
  assert.deepEqual(calls, ["skin:daisy-monroe:halloween"]);
  assert.equal(client.getState().balance, 0);
});

test("both skin voucher balances come from separate authoritative inventory rows", () => {
  const client = createVoucherClient({});
  client.applyProgress({ inventoryItems: [
    { itemId: "skin-voucher", quantity: 3 },
    { itemId: "swimsuit-voucher", quantity: 2 },
  ] });

  assert.deepEqual(client.getState(), {
    balance: 3,
    swimsuitBalance: 2,
    status: "ready",
    error: "",
  });
});

test("the voucher shop publishes three distinct server-addressable products", () => {
  assert.deepEqual(VOUCHER_STORE_OFFERS.map(({ id, itemId, quantity, cents }) => ({ id, itemId, quantity, cents })), [
    { id: "skin-voucher", itemId: "skin-voucher", quantity: 1, cents: 99 },
    { id: "swimsuit-voucher", itemId: "swimsuit-voucher", quantity: 1, cents: 199 },
    { id: "emote-voucher", itemId: "emote-voucher", quantity: 1, cents: 99 },
  ]);
  assert.equal(formatVoucherPrice(99), "$0.99");
  assert.equal(formatVoucherPrice(199), "$1.99");
  for (const offer of VOUCHER_STORE_OFFERS) assert.match(offer.asset, /^assets\/vouchers\/.+\.webp$/);
  assert.equal(
    VOUCHER_STORE_OFFERS.find((offer) => offer.id === "skin-voucher").description,
    "Unlock one normal skin.",
  );
  assert.doesNotMatch(
    VOUCHER_STORE_OFFERS.find((offer) => offer.id === "skin-voucher").description,
    /swimsuit/i,
  );
});

test("voucher checkout sends stable identity without browser price or inventory quantity", async () => {
  const calls = [];
  const storage = memoryStorage();
  const locationRef = { href: "https://factory.example/games/yam-bowling/index.html", assign(url) { this.assigned = url; } };
  const client = createVoucherStoreClient({
    account: () => ({ playerId: "player-7", token: "token-7" }),
    storage,
    locationRef,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, json: async () => ({ url: "https://checkout.stripe.com/c/one", sessionId: "cs_one" }) };
    },
  });

  assert.equal(await client.purchase("swimsuit-voucher"), true);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.offer, { id: "swimsuit-voucher", kind: "inventory", sku: "yb.voucher.swimsuit.1" });
  assert.equal(body.cents, undefined);
  assert.equal(body.quantity, undefined);
  assert.match(body.successUrl, /session_id=\{CHECKOUT_SESSION_ID\}/);
  assert.equal(locationRef.assigned, "https://checkout.stripe.com/c/one");
});

test("voucher checkout return applies a fresh authoritative inventory snapshot", async () => {
  const storage = memoryStorage();
  storage.setItem("yam-bowling.pendingVoucherCheckoutSessionId", "cs_paid");
  const client = createVoucherStoreClient({
    account: () => ({ playerId: "player-7", token: "token-7" }),
    storage,
    locationRef: { href: "https://factory.example/games/yam-bowling/index.html?checkout=success&session_id=cs_paid" },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ ok: true, progress: { inventoryItems: [{ itemId: "swimsuit-voucher", quantity: 1 }] } }),
    }),
  });

  const result = await client.fulfillReturn();
  assert.equal(result.progress.inventoryItems[0].itemId, "swimsuit-voucher");
  assert.equal(storage.getItem("yam-bowling.pendingVoucherCheckoutSessionId"), null);
});
