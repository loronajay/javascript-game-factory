import test from "node:test";
import assert from "node:assert/strict";

import {
  CHECKOUT_API_UNAVAILABLE_ERROR,
  buildPremiumCheckoutPayload,
  checkoutEndpointUrl,
  startPremiumCheckout,
} from "../src/platform/premiumCheckoutClient.js";

const ACCOUNT = Object.freeze({
  authenticated: true,
  playerId: "factory-player-1",
  token: "token-1",
});

const SKIN_OFFER = Object.freeze({
  id: "skin:swordsman:medieval",
  kind: "skin",
  type: "swordsman",
  slug: "medieval",
  name: "Medieval",
  sku: "ta.skin.swordsman.medieval",
  entitlementId: "skin:swordsman:medieval",
  price: Object.freeze({ kind: "premium", currency: "USD", cents: 199 }),
});

const PACK_OFFER = Object.freeze({
  id: "skin-pack:halloween",
  kind: "skin-pack",
  packId: "halloween",
  name: "Halloween Pack",
  sku: "ta.skinpack.halloween",
  entitlementId: "skin-pack:halloween",
  price: Object.freeze({ kind: "premium", currency: "USD", cents: 2499 }),
  unownedSkins: Object.freeze([
    Object.freeze({ type: "swordsman", slug: "pumpkin-knight", entitlementId: "skin:swordsman:pumpkin-knight" }),
    Object.freeze({ type: "necromancer", slug: "trick-or-treat", entitlementId: "skin:necromancer:trick-or-treat" }),
  ]),
});

test("premium checkout payload sends stable offer identity without trusting browser price", () => {
  const payload = buildPremiumCheckoutPayload(SKIN_OFFER, {
    account: ACCOUNT,
    successUrl: "https://factory.example/games/tactical-arena/index.html?checkout=success",
    cancelUrl: "https://factory.example/games/tactical-arena/index.html?checkout=cancel",
  });

  assert.deepEqual(payload, {
    gameSlug: "tactical-arena",
    playerId: "factory-player-1",
    offer: {
      id: "skin:swordsman:medieval",
      kind: "skin",
      sku: "ta.skin.swordsman.medieval",
      entitlementId: "skin:swordsman:medieval",
      type: "swordsman",
      slug: "medieval",
    },
    successUrl: "https://factory.example/games/tactical-arena/index.html?checkout=success",
    cancelUrl: "https://factory.example/games/tactical-arena/index.html?checkout=cancel",
  });
});

test("premium checkout payload supports unit offers without trusting browser price", () => {
  const payload = buildPremiumCheckoutPayload({
    id: "unit:sniper",
    kind: "unit",
    type: "sniper",
    sku: "ta.unit.sniper",
    entitlementId: "unit:sniper",
    premiumPrice: { kind: "premium", currency: "USD", cents: 1 },
  }, {
    account: { authenticated: true, playerId: "player-1", token: "token-1" },
  });

  assert.deepEqual(payload.offer, {
    id: "unit:sniper",
    kind: "unit",
    sku: "ta.unit.sniper",
    entitlementId: "unit:sniper",
    type: "sniper",
  });
  assert.equal(payload.offer.premiumPrice, undefined);
});

test("premium checkout payload summarizes pack contents for server-side validation", () => {
  const payload = buildPremiumCheckoutPayload(PACK_OFFER, { account: ACCOUNT });

  assert.equal(payload.offer.kind, "skin-pack");
  assert.equal(payload.offer.packId, "halloween");
  assert.deepEqual(payload.offer.unownedEntitlementIds, [
    "skin:swordsman:pumpkin-knight",
    "skin:necromancer:trick-or-treat",
  ]);
  assert.equal("cents" in payload.offer, false);
  assert.equal("price" in payload.offer, false);
});

test("checkout endpoint defaults to the same-origin tactical arena API path", () => {
  const previous = globalThis.__JGF_PLATFORM_API_URL__;
  delete globalThis.__JGF_PLATFORM_API_URL__;
  assert.equal(
    checkoutEndpointUrl({
      currentHref: "https://factory.example/games/tactical-arena/index.html",
    }),
    "https://factory.example/api/tactical-arena/checkout-sessions",
  );

  assert.equal(
    checkoutEndpointUrl({
      endpoint: "../stripe/create",
      currentHref: "https://factory.example/games/tactical-arena/index.html",
    }),
    "https://factory.example/games/stripe/create",
  );
  globalThis.__JGF_PLATFORM_API_URL__ = previous;
});

test("checkout endpoint prefers the configured Factory platform API", () => {
  const previous = globalThis.__JGF_PLATFORM_API_URL__;
  globalThis.__JGF_PLATFORM_API_URL__ = "https://platform-api.example/";

  assert.equal(
    checkoutEndpointUrl({
      currentHref: "https://loronajay.github.io/javascript-game-factory/games/tactical-arena/index.html",
    }),
    "https://platform-api.example/payments/tactical-arena/checkout-sessions",
  );

  globalThis.__JGF_PLATFORM_API_URL__ = previous;
});

test("startPremiumCheckout posts to the checkout API and redirects to Stripe", async () => {
  const calls = [];
  const locationRef = {
    href: "https://factory.example/games/tactical-arena/index.html",
    assigned: "",
    assign(url) {
      this.assigned = url;
      this.href = url;
    },
  };

  const result = await startPremiumCheckout({
    offer: SKIN_OFFER,
    account: ACCOUNT,
    locationRef,
    checkoutEndpoint: "/api/test-checkout",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        async json() {
          return { url: "https://checkout.stripe.com/c/session-1" };
        },
      };
    },
  });

  assert.equal(result.url, "https://checkout.stripe.com/c/session-1");
  assert.equal(locationRef.assigned, "https://checkout.stripe.com/c/session-1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://factory.example/api/test-checkout");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer token-1");
  assert.equal(JSON.parse(calls[0].init.body).offer.sku, "ta.skin.swordsman.medieval");
});

test("startPremiumCheckout reports unavailable checkout API failures", async () => {
  await assert.rejects(
    () => startPremiumCheckout({
      offer: SKIN_OFFER,
      account: ACCOUNT,
      locationRef: { href: "https://factory.example/games/tactical-arena/index.html" },
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        async json() {
          return { errorCode: "NOT_FOUND" };
        },
      }),
    }),
    (error) => error?.code === CHECKOUT_API_UNAVAILABLE_ERROR,
  );
});
