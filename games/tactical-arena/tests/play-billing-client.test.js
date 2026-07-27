import test from "node:test";
import assert from "node:assert/strict";

import {
  playPurchaseErrorMessage,
  purchaseWithPlay,
  recoverPendingPlayPurchases,
} from "../src/platform/playBillingClient.js";

const SKIN_OFFER = { kind: "skin", sku: "ta.skin.swordsman.summer-vibes", entitlementId: "skin:swordsman:summer-vibes" };
const CONSUMABLE_OFFER = { kind: "consumable", sku: "ta.consumable.valor-boost-1", id: "valor-boost-1" };

function fakeBridge(overrides = {}) {
  const calls = { purchase: [], acknowledge: [], consume: [], pending: 0 };
  return {
    calls,
    PlayBilling: {
      async purchase(args) {
        calls.purchase.push(args);
        if (overrides.purchase) return overrides.purchase(args);
        return { purchases: [{ purchaseToken: "tok-1", orderId: "ord-1", productIds: [args.productId] }] };
      },
      async acknowledge(args) { calls.acknowledge.push(args); },
      async consume(args) { calls.consume.push(args); },
      async getPendingPurchases() {
        calls.pending += 1;
        return overrides.pending ?? { purchases: [] };
      },
    },
  };
}

function fakeVerifier(result = { ok: true, entitlements: ["skin:swordsman:summer-vibes"] }) {
  const seen = [];
  return {
    seen,
    async verify(payload) {
      seen.push(payload);
      return typeof result === "function" ? result(payload) : result;
    },
  };
}

test("a managed purchase is verified server-side, then acknowledged", async () => {
  const bridge = fakeBridge();
  const verifier = fakeVerifier();

  const result = await purchaseWithPlay(SKIN_OFFER, { plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(result.ok, true);
  // Hyphens must have been translated on the way to Play.
  assert.equal(bridge.calls.purchase[0].productId, "ta.skin.swordsman.summer_vibes");
  assert.equal(verifier.seen[0].purchaseToken, "tok-1");
  assert.equal(verifier.seen[0].productId, "ta.skin.swordsman.summer_vibes");
  assert.equal(bridge.calls.acknowledge.length, 1, "durable goods are acknowledged");
  assert.equal(bridge.calls.consume.length, 0);
});

test("a consumable is consumed rather than acknowledged, so it can be bought again", async () => {
  const bridge = fakeBridge();
  const verifier = fakeVerifier({ ok: true, consume: true });

  await purchaseWithPlay(CONSUMABLE_OFFER, { plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(bridge.calls.consume.length, 1);
  assert.equal(bridge.calls.acknowledge.length, 0);
});

test("a failed server verification leaves the purchase UNACKNOWLEDGED", async () => {
  // This is the money-safety property: Google auto-refunds a purchase that is never
  // acknowledged within three days. Acknowledging before our server confirmed the
  // grant would take the player's money and give them nothing.
  const bridge = fakeBridge();
  const verifier = fakeVerifier({ ok: false, error: "verification_failed" });

  const result = await purchaseWithPlay(SKIN_OFFER, { plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(result.ok, false);
  assert.equal(bridge.calls.acknowledge.length, 0);
  assert.equal(bridge.calls.consume.length, 0);
});

test("a server that throws is treated exactly like a failed verification", async () => {
  const bridge = fakeBridge();
  const result = await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    verifyPurchase: async () => { throw new Error("network down"); },
  });

  assert.equal(result.ok, false);
  assert.equal(bridge.calls.acknowledge.length, 0);
});

test("cancelling is not an error the player should see as a failure", async () => {
  const bridge = fakeBridge({
    purchase: () => { const e = new Error("cancelled"); e.code = "PURCHASE_CANCELLED"; throw e; },
  });
  const verifier = fakeVerifier();

  const result = await purchaseWithPlay(SKIN_OFFER, { plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(verifier.seen.length, 0, "a cancelled purchase must never reach the server");
});

test("an offer with no legal Play product id never reaches the bridge", async () => {
  const bridge = fakeBridge();
  const verifier = fakeVerifier();

  const result = await purchaseWithPlay({ kind: "skin", sku: "!!!" }, {
    plugins: bridge,
    verifyPurchase: verifier.verify,
  });

  assert.equal(result.ok, false);
  assert.equal(bridge.calls.purchase.length, 0);
  assert.equal(verifier.seen.length, 0);
});

test("a missing bridge fails cleanly instead of throwing", async () => {
  const result = await purchaseWithPlay(SKIN_OFFER, { plugins: {}, verifyPurchase: async () => ({ ok: true }) });
  assert.equal(result.ok, false);
});

test("pending purchases from a killed app are recovered on boot", async () => {
  // A purchase can complete while the app is dead: money taken, nothing granted.
  const bridge = fakeBridge({
    pending: {
      purchases: [
        { purchaseToken: "tok-a", orderId: "o-a", productIds: ["ta.unit.paladin"] },
        { purchaseToken: "tok-b", orderId: "o-b", productIds: ["ta.consumable.valor_boost_1"] },
      ],
    },
  });
  const verifier = fakeVerifier((payload) => ({
    ok: true,
    consume: payload.productId.startsWith("ta.consumable."),
  }));

  const summary = await recoverPendingPlayPurchases({ plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(summary.recovered, 2);
  assert.equal(bridge.calls.acknowledge.length, 1);
  assert.equal(bridge.calls.consume.length, 1);
});

test("recovery skips what the server rejects and keeps going", async () => {
  const bridge = fakeBridge({
    pending: {
      purchases: [
        { purchaseToken: "bad", orderId: "o-a", productIds: ["ta.unit.paladin"] },
        { purchaseToken: "good", orderId: "o-b", productIds: ["ta.unit.monk"] },
      ],
    },
  });
  const verifier = fakeVerifier((p) => (p.purchaseToken === "bad" ? { ok: false } : { ok: true }));

  const summary = await recoverPendingPlayPurchases({ plugins: bridge, verifyPurchase: verifier.verify });

  assert.equal(summary.recovered, 1);
  assert.equal(summary.failed, 1);
  assert.deepEqual(bridge.calls.acknowledge.map((a) => a.purchaseToken), ["good"]);
});

test("recovery is a no-op without a bridge", async () => {
  const summary = await recoverPendingPlayPurchases({ plugins: {}, verifyPurchase: async () => ({ ok: true }) });
  assert.equal(summary.recovered, 0);
  assert.equal(summary.skipped, true);
});

// The server refuses to grant a purchase of something already owned (Play cannot see items
// bought on the web via Stripe, so it re-sells them). The purchase must then be left
// UNSETTLED — an unacknowledged purchase is auto-refunded by Google within three days,
// which is the only thing that makes the player whole. Acknowledging it would keep their money.
test("a refused duplicate purchase is never acknowledged, so Google refunds it", async () => {
  const bridge = {
    calls: { acknowledge: [], consume: [] },
    purchase: async () => ({ purchases: [{ purchaseToken: "dupe", orderId: "GPA.1" }] }),
    acknowledge: async (args) => { bridge.calls.acknowledge.push(args); },
    consume: async (args) => { bridge.calls.consume.push(args); },
  };

  const result = await purchaseWithPlay(
    { kind: "unit", sku: "ta.unit.monk", type: "monk", entitlementId: "unit:monk" },
    {
      plugins: { PlayBilling: bridge },
      assertOfferPurchasable: async () => ({ owned: false, checked: true }),
      verifyPurchase: async () => ({ ok: false, error: "offer_already_owned" }),
    },
  );

  assert.equal(result.ok, false);
  // Charged, so the copy must promise a refund — distinct from the preflight block below.
  assert.equal(result.error, "offer_already_owned_refunding");
  assert.deepEqual(bridge.calls.acknowledge, []);
  assert.deepEqual(bridge.calls.consume, []);
  assert.match(playPurchaseErrorMessage("offer_already_owned_refunding"), /refund/i);
});

test("every failure code has player-facing copy", () => {
  for (const code of ["PURCHASE_CANCELLED", "PURCHASE_FAILED", "PRODUCT_NOT_FOUND", "BILLING_UNAVAILABLE", "verification_failed", "offer_already_owned", "purchase_already_redeemed", "", undefined]) {
    const message = playPurchaseErrorMessage(code);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0);
    assert.ok(!message.includes("_"), `raw code leaked for ${code}: ${message}`);
  }
});

// --- ownership preflight -----------------------------------------------------
//
// The whole point of the preflight is that Google's sheet never opens, so no money moves.
// Every assertion below therefore checks `bridge.calls.purchase` is empty — a purchase that
// is refused AFTER the charge is a refund, which is a worse product than a refusal.

test("an offer the player already owns never reaches Google's purchase sheet", async () => {
  const bridge = fakeBridge();
  const result = await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    assertOfferPurchasable: async () => ({ owned: true, checked: true, snapshot: { entitlements: [{ entitlementId: "skin:swordsman:summer-vibes" }] } }),
    verifyPurchase: async () => { throw new Error("must not verify a purchase that never happened"); },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error, "offer_already_owned");
  assert.equal(result.blocked, true);
  assert.deepEqual(bridge.calls.purchase, [], "no charge may be attempted");
  // The snapshot rides along so the caller can correct a shop that was offering it.
  assert.ok(result.snapshot);
  assert.doesNotMatch(playPurchaseErrorMessage("offer_already_owned"), /refund/i, "nothing was charged, so promise no refund");
});

test("the preflight sees the offer and the account it is checking", async () => {
  const bridge = fakeBridge();
  const seen = [];
  await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    account: { token: "tok", playerId: "player-1" },
    assertOfferPurchasable: async (args) => { seen.push(args); return { owned: false, checked: true }; },
    verifyPurchase: async () => ({ ok: true }),
  });

  assert.equal(seen.length, 1);
  assert.equal(seen[0].offer, SKIN_OFFER);
  assert.equal(seen[0].account.playerId, "player-1");
});

test("an unowned offer still buys normally", async () => {
  const bridge = fakeBridge();
  const result = await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    assertOfferPurchasable: async () => ({ owned: false, checked: true }),
    verifyPurchase: async () => ({ ok: true, consume: false, entitlements: ["skin:swordsman:summer-vibes"] }),
  });

  assert.equal(result.ok, true);
  assert.equal(bridge.calls.purchase.length, 1);
  assert.equal(bridge.calls.acknowledge.length, 1);
});

test("a consumable is never blocked, however many the player already has", async () => {
  const bridge = fakeBridge();
  const result = await purchaseWithPlay(CONSUMABLE_OFFER, {
    plugins: bridge,
    // The real guard is used here: consumables carry no entitlement, so it must let them by.
    assertOfferPurchasable: async ({ offer }) => {
      const { isOfferFullyOwned } = await import("../src/platform/offerOwnership.js");
      return { owned: isOfferFullyOwned(offer, { entitlements: [{ entitlementId: "unit:monk" }] }), checked: true };
    },
    verifyPurchase: async () => ({ ok: true, consume: true }),
  });

  assert.equal(result.ok, true);
  assert.equal(bridge.calls.consume.length, 1);
});

test("a preflight that cannot reach the server fails open rather than blocking a sale", async () => {
  const bridge = fakeBridge();
  const result = await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    assertOfferPurchasable: async () => ({ owned: false, snapshot: null, checked: false }),
    verifyPurchase: async () => ({ ok: true }),
  });

  // A network blip must not stop a legitimate purchase; the server refusal + Google's
  // auto-refund is still behind it, and an unreachable server could not have verified
  // the purchase anyway.
  assert.equal(result.ok, true);
  assert.equal(bridge.calls.purchase.length, 1);
});

test("the default guard fails open when there is no signed-in session to ask about", async () => {
  const bridge = fakeBridge();
  // No assertOfferPurchasable: exercises createOwnedOfferGuard's real fetch path, which in
  // a headless test has no account and must degrade to "proceed" instead of throwing.
  const result = await purchaseWithPlay(SKIN_OFFER, {
    plugins: bridge,
    verifyPurchase: async () => ({ ok: true }),
  });

  assert.equal(result.ok, true);
});
