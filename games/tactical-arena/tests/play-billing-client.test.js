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

test("every failure code has player-facing copy", () => {
  for (const code of ["PURCHASE_CANCELLED", "PURCHASE_FAILED", "PRODUCT_NOT_FOUND", "BILLING_UNAVAILABLE", "verification_failed", "", undefined]) {
    const message = playPurchaseErrorMessage(code);
    assert.equal(typeof message, "string");
    assert.ok(message.length > 0);
    assert.ok(!message.includes("_"), `raw code leaked for ${code}: ${message}`);
  }
});
