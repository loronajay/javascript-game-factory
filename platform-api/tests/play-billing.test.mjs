import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createPlayAccessTokenProvider,
  fulfillPlayPurchase,
  listAmbiguousPlayProductIds,
  listPlayProductIds,
  resolvePlayProductOffer,
  toPlayProductId,
} from "../src/services/play-billing.mjs";

const PLAY_PRODUCT_ID_PATTERN = /^[a-z0-9][a-z0-9._]*$/;

// A purchase Google would call good. Overridden per test for the unhappy states.
function googlePurchase(overrides = {}) {
  return { purchaseState: 0, consumptionState: 0, orderId: "GPA.1234-5678-9012-34567", ...overrides };
}

// Wires fulfillPlayPurchase with everything faked, and records what it tried to do so a
// test can assert that a refused purchase granted nothing.
function harness({ purchase = googlePurchase(), status = 200, progress = { entitlements: [] }, existingClaim = null, accessToken = "ya29.test" } = {}) {
  const claims = [];
  const requests = [];
  return {
    claims,
    requests,
    run: (body, playerId = "player-1") => fulfillPlayPurchase({
      playerId,
      body,
      packageName: "com.jayarcade.tacticalarena",
      getAccessToken: async () => accessToken,
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: status >= 200 && status < 300, status, json: async () => (status === 200 ? purchase : { error: { message: "nope" } }) };
      },
      getGameProgress: async () => progress,
      findPlayPurchaseClaim: async () => existingClaim,
      recordGameProgressClaim: async (claim) => {
        claims.push(claim);
        return { ok: true, alreadyProcessed: false, progress: { valorBalance: 0, entitlements: [] } };
      },
    }),
  };
}

// --- product index -----------------------------------------------------------

test("every published Play product id is legal and unambiguous", () => {
  const ids = listPlayProductIds();
  assert.ok(ids.length > 300, `expected the full catalog, got ${ids.length}`);
  for (const id of ids) {
    assert.match(id, PLAY_PRODUCT_ID_PATTERN, `${id} is not a legal Play product id`);
  }
  // Two catalog entries collapsing onto one Play id would make a purchase unattributable.
  assert.deepEqual(listAmbiguousPlayProductIds(), []);
});

test("Play product ids resolve back to the offer the server will price", () => {
  assert.deepEqual(resolvePlayProductOffer("ta.unit.monk"), { kind: "unit", sku: "ta.unit.monk", type: "monk" });
  assert.deepEqual(resolvePlayProductOffer("ta.skin.swordsman.summer_vibes"), {
    kind: "skin",
    sku: "ta.skin.swordsman.summer-vibes",
    type: "swordsman",
    slug: "summer-vibes",
  });
  assert.deepEqual(resolvePlayProductOffer("ta.skinpack.blood_moon"), {
    kind: "skin-pack",
    sku: "ta.skinpack.blood-moon",
    packId: "blood-moon",
  });
  const consumable = resolvePlayProductOffer(listPlayProductIds().find((id) => id.startsWith("ta.consumable.")));
  assert.equal(consumable.kind, "consumable");
});

test("anything outside the catalog resolves to nothing", () => {
  for (const bogus of ["", null, "ta.unit.does_not_exist", "ta.skin.swordsman.summer-vibes", "../../etc/passwd", "TA.UNIT.MONK "]) {
    const resolved = resolvePlayProductOffer(bogus);
    // The uppercase/whitespace form is the real product after normalization; the rest are junk.
    if (bogus === "TA.UNIT.MONK ") assert.equal(resolved.type, "monk");
    else assert.equal(resolved, null, `${bogus} must not resolve`);
  }
});

// The game maps SKUs onto Play ids for the purchase call; this module maps them back for
// the grant. If the two ever disagree, a real purchase becomes unattributable server-side.
test("the server's product-id mapping matches the game client's", async () => {
  const { toPlayProductId: clientMapping } = await import("../../games/tactical-arena/src/platform/playProducts.js");
  for (const sku of ["ta.unit.monk", "ta.skin.swordsman.summer-vibes", "ta.skinpack.blood-moon", "ta.consumable.valor-boost-1"]) {
    assert.equal(toPlayProductId(sku), clientMapping(sku), `mapping drifted for ${sku}`);
  }
});

// --- fulfillment: the happy paths --------------------------------------------

test("a verified purchase grants the entitlement its product maps to", async () => {
  const h = harness();
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok-abc" });

  assert.equal(result.ok, true);
  assert.equal(result.consume, false, "a unit is durable");
  assert.deepEqual(result.entitlements, ["unit:monk"]);

  assert.equal(h.claims.length, 1);
  const claim = h.claims[0];
  assert.equal(claim.kind, "premium-unit-purchase");
  assert.equal(claim.claimId, "play-purchase:GPA.1234-5678-9012-34567");
  assert.equal(claim.payload.playProductId, "ta.unit.monk");
  assert.equal(claim.payload.sku, "ta.unit.monk");
  assert.match(claim.payload.playPurchaseTokenHash, /^[0-9a-f]{64}$/);
  // The raw token is a credential against Google's API — the hash is all we keep.
  assert.equal(JSON.stringify(claim).includes("tok-abc"), false);

  assert.equal(h.requests.length, 1);
  assert.match(h.requests[0].url, /purchases\/products\/ta\.unit\.monk\/tokens\/tok-abc$/);
  assert.equal(h.requests[0].options.headers.authorization, "Bearer ya29.test");
});

test("a consumable comes back marked for consumption, with inventory instead of entitlements", async () => {
  const consumableId = listPlayProductIds().find((id) => id.startsWith("ta.consumable."));
  const h = harness();
  const result = await h.run({ gameSlug: "tactical-arena", productId: consumableId, purchaseToken: "tok-c" });

  assert.equal(result.ok, true);
  assert.equal(result.consume, true);
  assert.equal(h.claims[0].kind, "premium-consumable-purchase");
  assert.equal(h.claims[0].payload.inventoryItems.length, 1);
});

test("a partially owned skin pack grants only the skins the player is missing", async () => {
  const h = harness({ progress: { entitlements: [{ entitlementId: "skin:angel:blood-moon" }] } });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.skinpack.blood_moon", purchaseToken: "tok-p" });

  assert.equal(result.ok, true);
  assert.equal(result.entitlements.includes("skin:angel:blood-moon"), false);
  assert.equal(result.entitlements.includes("skin-pack:blood-moon"), true);
});

// --- fulfillment: everything that must NOT grant ------------------------------

test("a product the catalog does not sell is refused before Google is ever asked", async () => {
  const h = harness();
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.free_money", purchaseToken: "tok" });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 400);
  assert.equal(result.error, "offer_not_found");
  assert.equal(h.requests.length, 0, "an unknown product must not cost a Google round trip");
  assert.equal(h.claims.length, 0);
});

test("a purchase Google does not recognise grants nothing", async () => {
  const h = harness({ status: 404 });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "forged" });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 404);
  assert.equal(result.error, "purchase_not_found");
  assert.equal(h.claims.length, 0);
});

test("a Google outage fails closed rather than granting on trust", async () => {
  const h = harness({ status: 503 });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 502);
  assert.equal(result.error, "play_verification_failed");
  assert.equal(h.claims.length, 0);
});

test("cancelled and pending purchases are distinguished, and neither grants", async () => {
  const cancelled = harness({ purchase: googlePurchase({ purchaseState: 1 }) });
  const cancelledResult = await cancelled.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });
  assert.equal(cancelledResult.error, "purchase_not_completed");
  assert.equal(cancelled.claims.length, 0);

  const pending = harness({ purchase: googlePurchase({ purchaseState: 2 }) });
  const pendingResult = await pending.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });
  // A distinct code because pending resolves later and the client should retry; cancelled never will.
  assert.equal(pendingResult.error, "purchase_pending");
  assert.equal(pending.claims.length, 0);
});

test("a purchase token already redeemed by another account is refused", async () => {
  const h = harness({ existingClaim: { playerId: "player-2", gameSlug: "tactical-arena", claimId: "play-purchase:GPA.1" } });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "shared-token" }, "player-1");

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 409);
  assert.equal(result.error, "purchase_already_redeemed");
  assert.equal(h.claims.length, 0);
});

test("the buyer resubmitting their own token is allowed through to the idempotent claim", async () => {
  const h = harness({ existingClaim: { playerId: "player-1", gameSlug: "tactical-arena", claimId: "play-purchase:GPA.1" } });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "own-token" }, "player-1");

  assert.equal(result.ok, true);
  assert.equal(h.claims.length, 1, "the claim layer, not this one, decides it is a replay");
});

test("re-verifying our own already-granted purchase succeeds so the client can settle it", async () => {
  const h = harness({
    progress: { entitlements: [{ entitlementId: "unit:monk" }] },
    // The token is on one of our claim rows: the grant landed, only the acknowledge failed.
    existingClaim: { playerId: "player-1", gameSlug: "tactical-arena", claimId: "play-purchase:GPA.1" },
  });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });

  // Boot recovery replays this. It has to come back ok, or Google auto-refunds a purchase
  // whose item the player is already holding.
  assert.equal(result.ok, true);
  assert.equal(result.alreadyProcessed, true);
  assert.equal(result.consume, false);
  assert.deepEqual(result.entitlements, []);
  assert.equal(h.claims.length, 0, "nothing left to grant");
});

test("paying again for something already owned is refused, so Google auto-refunds it", async () => {
  // Play cannot see Stripe ownership, so it will happily re-sell a skin bought on the web.
  // The token is one we have never recorded, which is what separates this from a retry.
  const h = harness({ progress: { entitlements: [{ entitlementId: "unit:monk" }] }, existingClaim: null });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "fresh-token" });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 409);
  assert.equal(result.error, "offer_already_owned");
  assert.equal(h.claims.length, 0);
  // Failing here is the entire point: the client only settles on ok, so the purchase is
  // left unacknowledged and Google refunds it within three days.
});

test("the client cannot pick its own order id", async () => {
  const h = harness();
  await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok", orderId: "GPA.attacker-chosen" });

  assert.equal(h.claims[0].claimId, "play-purchase:GPA.1234-5678-9012-34567");
});

test("a purchase with no order id is still keyed stably, off the token hash", async () => {
  const h = harness({ purchase: googlePurchase({ orderId: undefined }) });
  await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });

  assert.match(h.claims[0].claimId, /^play-purchase:token:[0-9a-f]{32}$/);
});

// The two cases above pass individually even when the client's order id is trusted, because
// one has Google's id winning and the other sends none. This is the case that separates them:
// Google supplies no order id AND the client offers one. If the client's value is used, the
// claim id becomes attacker-chosen, and the claim id is the only thing making a replay
// idempotent — so the same token resubmitted with fresh ids mints a claim row every time.
test("a client order id is ignored even when Google supplies none", async () => {
  const h = harness({ purchase: googlePurchase({ orderId: undefined }) });
  await h.run({
    gameSlug: "tactical-arena",
    productId: "ta.unit.monk",
    purchaseToken: "tok",
    orderId: "GPA.attacker-chosen",
  });

  assert.match(h.claims[0].claimId, /^play-purchase:token:[0-9a-f]{32}$/);
  assert.equal(h.claims[0].payload.playOrderId, "");
  assert.doesNotMatch(h.claims[0].sourceId, /attacker-chosen/);
});

// Consumables are where a duplicated claim actually costs money: they stack, so every extra
// claim row adds quantity. Entitlement replays are harmless (same row), which is why this
// asserts on the consumable path specifically.
test("replaying one consumable token with fresh client order ids grants it only once", async () => {
  const claimIds = new Set();
  for (const attackerOrderId of ["GPA.fake-1", "GPA.fake-2", "GPA.fake-3"]) {
    const h = harness({ purchase: googlePurchase({ orderId: undefined }) });
    await h.run({
      gameSlug: "tactical-arena",
      productId: "ta.consumable.valor_boost_1",
      purchaseToken: "one-real-token",
      orderId: attackerOrderId,
    });
    assert.equal(h.claims.length, 1);
    claimIds.add(h.claims[0].claimId);
  }

  // One token, one claim id, no matter what the client called it.
  assert.equal(claimIds.size, 1);
});

test("malformed requests and foreign game slugs are rejected", async () => {
  const h = harness();
  for (const body of [
    { gameSlug: "tactical-arena", productId: "ta.unit.monk" },
    { gameSlug: "tactical-arena", purchaseToken: "tok" },
    { gameSlug: "some-other-game", productId: "ta.unit.monk", purchaseToken: "tok" },
  ]) {
    const result = await h.run(body);
    assert.equal(result.error, "invalid_purchase_request");
  }
  const noPlayer = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" }, "");
  assert.equal(noPlayer.error, "invalid_purchase_request");
  assert.equal(h.claims.length, 0);
});

test("an unconfigured service account refuses to verify rather than granting blind", async () => {
  const h = harness({ accessToken: "" });
  const result = await h.run({ gameSlug: "tactical-arena", productId: "ta.unit.monk", purchaseToken: "tok" });

  assert.equal(result.ok, false);
  assert.equal(result.statusCode, 503);
  assert.equal(result.error, "play_verification_not_configured");
  assert.equal(h.claims.length, 0);
});

// --- service-account auth ----------------------------------------------------

function testServiceAccountKey() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    client_email: "play-verifier@example.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

test("the access token provider signs a service-account JWT and caches the result", async () => {
  const key = testServiceAccountKey();
  const exchanges = [];
  let clock = 1_000_000;
  const getToken = createPlayAccessTokenProvider({
    serviceAccountKey: key,
    now: () => clock,
    fetchImpl: async (url, options) => {
      exchanges.push({ url, body: Object.fromEntries(new URLSearchParams(String(options.body))) });
      return { ok: true, json: async () => ({ access_token: `ya29.token-${exchanges.length}`, expires_in: 3600 }) };
    },
  });

  assert.equal(await getToken(), "ya29.token-1");
  assert.equal(exchanges[0].url, "https://oauth2.googleapis.com/token");
  assert.equal(exchanges[0].body.grant_type, "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const [header, claims] = exchanges[0].body.assertion.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString("utf8")), { alg: "RS256", typ: "JWT" });
  const decoded = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
  assert.equal(decoded.iss, key.client_email);
  assert.equal(decoded.scope, "https://www.googleapis.com/auth/androidpublisher");

  clock += 60_000;
  assert.equal(await getToken(), "ya29.token-1");
  assert.equal(exchanges.length, 1, "a live token must be reused, not re-signed per purchase");

  // Retired a minute before Google would expire it, so a token never dies mid-verification.
  clock += 3_600_000;
  assert.equal(await getToken(), "ya29.token-2");
});

test("a missing or unparseable service-account key yields no token instead of throwing", async () => {
  for (const key of ["", null, "not json", "eyJub3QiOiAiYSBrZXkifQ=="]) {
    const getToken = createPlayAccessTokenProvider({ serviceAccountKey: key, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
    assert.equal(await getToken(), "");
  }
});

test("a base64-encoded service-account key is accepted, for hosts that mangle newlines", async () => {
  const key = testServiceAccountKey();
  const getToken = createPlayAccessTokenProvider({
    serviceAccountKey: Buffer.from(JSON.stringify(key), "utf8").toString("base64"),
    fetchImpl: async () => ({ ok: true, json: async () => ({ access_token: "ya29.from-base64", expires_in: 3600 }) }),
  });
  assert.equal(await getToken(), "ya29.from-base64");
});

test("a failed token exchange returns empty rather than a bad token", async () => {
  const getToken = createPlayAccessTokenProvider({
    serviceAccountKey: testServiceAccountKey(),
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: "invalid_grant" }) }),
  });
  assert.equal(await getToken(), "");
});
