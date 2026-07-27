import test from "node:test";
import assert from "node:assert/strict";

import {
  PURCHASE_PROVIDERS,
  purchaseProviderMessage,
  selectPurchaseProvider,
} from "../src/platform/purchaseProviders.js";

test("the web keeps using Stripe", () => {
  assert.equal(selectPurchaseProvider({ nativeApp: false }), PURCHASE_PROVIDERS.stripe);
  assert.equal(
    selectPurchaseProvider({ nativeApp: false, plugins: { PlayBilling: {} } }),
    PURCHASE_PROVIDERS.stripe,
    "a stray plugin must not hijack the web checkout",
  );
});

test("the packaged app uses Play Billing", () => {
  assert.equal(
    selectPurchaseProvider({ nativeApp: true, plugins: { PlayBilling: {} } }),
    PURCHASE_PROVIDERS.play,
  );
});

test("the app never silently falls back to Stripe when the bridge is missing", () => {
  // Selling digital goods inside the app through Stripe is a separate Play program
  // with its own enrollment, PCI scope and 24-hour transaction reporting. Falling
  // back to it because a plugin failed to load would ship an unenrolled payment
  // flow, so this must surface as unavailable instead.
  assert.equal(selectPurchaseProvider({ nativeApp: true, plugins: null }), PURCHASE_PROVIDERS.unavailable);
  assert.equal(selectPurchaseProvider({ nativeApp: true, plugins: {} }), PURCHASE_PROVIDERS.unavailable);
  assert.equal(selectPurchaseProvider({ nativeApp: true }), PURCHASE_PROVIDERS.unavailable);
});

test("selection never throws on junk input", () => {
  assert.equal(selectPurchaseProvider(), PURCHASE_PROVIDERS.stripe);
  assert.equal(selectPurchaseProvider(null), PURCHASE_PROVIDERS.stripe);
  assert.equal(selectPurchaseProvider({ nativeApp: "yes", plugins: 5 }), PURCHASE_PROVIDERS.unavailable);
});

test("every provider state has player-facing copy", () => {
  for (const provider of Object.values(PURCHASE_PROVIDERS)) {
    const message = purchaseProviderMessage(provider);
    assert.equal(typeof message, "string");
    assert.ok(!message.includes("_"), `raw code leaked for ${provider}: ${message}`);
  }
  // Only the broken state should say anything at all; the working ones are silent.
  assert.equal(purchaseProviderMessage(PURCHASE_PROVIDERS.play), "");
  assert.equal(purchaseProviderMessage(PURCHASE_PROVIDERS.stripe), "");
  assert.ok(purchaseProviderMessage(PURCHASE_PROVIDERS.unavailable).length > 0);
});
