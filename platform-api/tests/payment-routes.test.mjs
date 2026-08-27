import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.mjs";
import { signToken } from "../src/auth-helpers.mjs";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long";

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(value = "") {
      this.body = value;
    },
  };
}

async function invoke(app, method, url, { body, token, headers = {} } = {}) {
  const chunks = body ? [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))] : [];
  const req = {
    method,
    url,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next() {
          if (done || chunks.length === 0) return Promise.resolve({ done: true });
          done = true;
          return Promise.resolve({ value: chunks[0], done: false });
        },
      };
    },
  };
  const res = createMockResponse();
  await app(req, res);
  return {
    statusCode: res.statusCode,
    json: JSON.parse(res.body),
  };
}

test("POST /payments/tactical-arena/checkout-sessions requires an authenticated player", async () => {
  const app = createApp({
    jwtSecret: TEST_SECRET,
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/checkout-sessions", {
    body: { playerId: "player-1" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
});

test("POST /payments/tactical-arena/checkout-sessions rejects player id spoofing", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const app = createApp({
    jwtSecret: TEST_SECRET,
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/checkout-sessions", {
    token,
    body: { playerId: "player-2" },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "player_mismatch");
});

test("POST /payments/tactical-arena/checkout-sessions delegates trusted checkout creation", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    createPremiumCheckoutSession: async (params) => {
      seen.push(params);
      return {
        ok: true,
        url: "",
        sessionId: "cs_test_session_1",
        clientSecret: "cs_test_session_1_secret_abc",
        publishableKey: "pk_test_checkout",
      };
    },
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/checkout-sessions", {
    token,
    body: {
      gameSlug: "tactical-arena",
      playerId: "player-1",
      offer: {
        kind: "skin",
        sku: "ta.skin.swordsman.medieval",
        type: "swordsman",
        slug: "medieval",
      },
      successUrl: "https://factory.example/games/tactical-arena/index.html?checkout=success",
      cancelUrl: "https://factory.example/games/tactical-arena/index.html?checkout=cancel",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.sessionId, "cs_test_session_1");
  assert.equal(response.json.clientSecret, "cs_test_session_1_secret_abc");
  assert.equal(response.json.publishableKey, "pk_test_checkout");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].playerId, "player-1");
  assert.equal(seen[0].body.offer.sku, "ta.skin.swordsman.medieval");
});

test("POST /payments/yam-bowling/checkout-sessions pins checkout to the Yam cabinet", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    createPremiumCheckoutSession: async (params) => {
      seen.push(params);
      return { ok: true, url: "https://checkout.stripe.com/c/yam", sessionId: "cs_yam" };
    },
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/yam-bowling/checkout-sessions", {
    token,
    body: {
      gameSlug: "yam-bowling",
      offer: { id: "skin-voucher", kind: "inventory", sku: "yb.voucher.skin.1" },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.url, "https://checkout.stripe.com/c/yam");
  assert.equal(seen[0].body.gameSlug, "yam-bowling");
});

test("POST /payments/tactical-arena/checkout-sessions/fulfill verifies a returned Checkout Session", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    fulfillPremiumCheckoutSession: async (params) => {
      seen.push(params);
      return {
        ok: true,
        alreadyProcessed: false,
        progress: { playerId: params.playerId, entitlements: [{ entitlementId: "skin:swordsman:summer-vibes" }] },
      };
    },
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/checkout-sessions/fulfill", {
    token,
    body: { sessionId: "cs_test_paid" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.progress.entitlements[0].entitlementId, "skin:swordsman:summer-vibes");
  assert.deepEqual(seen, [{
    playerId: "player-1",
    body: { sessionId: "cs_test_paid" },
  }]);
});

test("POST /payments/stripe/webhook delegates raw Stripe webhook fulfillment", async () => {
  const seen = [];
  const app = createApp({
    fulfillStripeWebhook: async (params) => {
      seen.push(params);
      return { ok: true, received: true };
    },
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const payload = JSON.stringify({ type: "checkout.session.completed" });
  const response = await invoke(app, "POST", "/payments/stripe/webhook", {
    body: payload,
    headers: { "stripe-signature": "t=1,v1=test" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.received, true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].signature, "t=1,v1=test");
});

test("POST /payments/tactical-arena/play-purchases requires a signed-in account", async () => {
  const app = createApp({ jwtSecret: TEST_SECRET, now: () => "2026-07-21T00:00:00.000Z" });

  const response = await invoke(app, "POST", "/payments/tactical-arena/play-purchases", {
    body: { gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" },
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
});

test("POST /payments/tactical-arena/play-purchases reports 503 when Play billing is unconfigured", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const app = createApp({ jwtSecret: TEST_SECRET, now: () => "2026-07-21T00:00:00.000Z" });

  const response = await invoke(app, "POST", "/payments/tactical-arena/play-purchases", {
    token,
    body: { gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" },
  });

  assert.equal(response.statusCode, 503);
  assert.equal(response.json.error, "play_billing_not_configured");
});

test("POST /payments/tactical-arena/play-purchases fulfills for the authenticated player only", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    fulfillPlayPurchase: async (params) => {
      seen.push(params);
      return {
        ok: true,
        consume: true,
        entitlements: ["unit:monk"],
        progress: { valorBalance: 40, entitlements: [] },
      };
    },
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/play-purchases", {
    token,
    // A spoofed playerId in the body must be ignored: the route passes the token's claim.
    body: { gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok", playerId: "player-2" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.consume, true);
  assert.deepEqual(response.json.entitlements, ["unit:monk"]);
  assert.equal(response.json.progress.valorBalance, 40);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].playerId, "player-1");
});

test("POST /payments/tactical-arena/play-purchases surfaces the service's refusal code", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const app = createApp({
    jwtSecret: TEST_SECRET,
    fulfillPlayPurchase: async () => ({ ok: false, statusCode: 409, error: "purchase_already_redeemed" }),
    now: () => "2026-07-21T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/payments/tactical-arena/play-purchases", {
    token,
    body: { gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json.error, "purchase_already_redeemed");
});
