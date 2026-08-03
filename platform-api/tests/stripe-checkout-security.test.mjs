import test from "node:test";
import assert from "node:assert/strict";

import { createTacticalArenaCheckoutSession } from "../src/services/payments.mjs";

test("Stripe Checkout uses a restricted-key-compatible request and a Dahlia integration identifier", async () => {
  let request = null;
  const result = await createTacticalArenaCheckoutSession({
    stripeApiKey: "rk_test_checkout",
    stripePublishableKey: "pk_test_checkout",
    playerId: "player-1",
    getGameProgress: async () => ({ entitlements: [] }),
    fetchImpl: async (url, options) => {
      request = { url, options, form: Object.fromEntries(new URLSearchParams(String(options.body))) };
      return {
        ok: true,
        json: async () => ({ id: "cs_test_1", client_secret: "cs_test_1_secret_abc" }),
      };
    },
    body: {
      gameSlug: "tactical-arena",
      offer: { kind: "skin", type: "swordsman", slug: "medieval" },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(request.options.headers.authorization, "Bearer rk_test_checkout");
  assert.equal(request.options.headers["Stripe-Version"], "2026-06-24.dahlia");
  assert.match(request.form.integration_identifier, /^tactical_arena_checkout_[a-z]{8}$/);
  assert.equal(request.form.payment_method_types, undefined);
});
