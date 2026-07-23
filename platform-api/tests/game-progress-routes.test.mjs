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

async function invoke(app, method, url, { body, token } = {}) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  const req = {
    method,
    url,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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

test("GET /game-progress/:gameSlug requires an authenticated platform account", async () => {
  const app = createApp({
    jwtSecret: TEST_SECRET,
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "GET", "/game-progress/tactical-arena");

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
});

test("GET /game-progress/:gameSlug rejects stale account sessions", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com", sessionId: "older-session" }, TEST_SECRET);
  const app = createApp({
    jwtSecret: TEST_SECRET,
    verifyAccountSession: async () => false,
    getGameProgress: async () => {
      throw new Error("stale sessions must not reach progress loading");
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "GET", "/game-progress/tactical-arena", { token });

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
});

test("GET /game-progress/:gameSlug returns account progression for the signed-in player", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    getGameProgress: async (playerId, gameSlug) => {
      seen.push({ playerId, gameSlug });
      return {
        playerId,
        gameSlug,
        valorBalance: 450,
        entitlements: [{ entitlementId: "skin:swordsman:wandering", kind: "skin" }],
        campaignProgress: [{ missionId: "the-wandering-party", stars: 3 }],
        inventoryItems: [],
      };
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "GET", "/game-progress/tactical-arena", { token });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(seen, [{ playerId: "player-1", gameSlug: "tactical-arena" }]);
  assert.equal(response.json.progress.valorBalance, 450);
  assert.equal(response.json.progress.entitlements[0].entitlementId, "skin:swordsman:wandering");
});

test("POST /game-progress/:gameSlug/claims records a campaign claim idempotency request", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordGameProgressClaim: async (params) => {
      seen.push(params);
      return {
        ok: true,
        alreadyProcessed: false,
        progress: { playerId: params.playerId, gameSlug: params.gameSlug, valorBalance: 75 },
      };
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/game-progress/tactical-arena/claims", {
    token,
    body: {
      claimId: "campaign-valor:clod-trial",
      kind: "campaign-valor",
      payload: { missionId: "clod-trial", amount: 75, stars: 3 },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.alreadyProcessed, false);
  assert.deepEqual(seen, [{
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "campaign-valor:clod-trial",
    kind: "campaign-valor",
    sourceId: undefined,
    payload: { missionId: "clod-trial", amount: 75, stars: 3 },
  }]);
});

test("POST /game-progress/:gameSlug/claims accepts tutorial reward claims", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordGameProgressClaim: async (params) => {
      seen.push(params);
      return {
        ok: true,
        alreadyProcessed: false,
        progress: { playerId: params.playerId, gameSlug: params.gameSlug, entitlements: [] },
      };
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/game-progress/tactical-arena/claims", {
    token,
    body: {
      claimId: "tutorial-skin-choice:juggernaut:bio-mech",
      kind: "tutorial-skin-choice",
      sourceId: "all-tutorials",
      payload: { type: "juggernaut", slug: "bio-mech", entitlementId: "skin:juggernaut:bio-mech" },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.alreadyProcessed, false);
  assert.deepEqual(seen, [{
    playerId: "player-1",
    gameSlug: "tactical-arena",
    claimId: "tutorial-skin-choice:juggernaut:bio-mech",
    kind: "tutorial-skin-choice",
    sourceId: "all-tutorials",
    payload: { type: "juggernaut", slug: "bio-mech", entitlementId: "skin:juggernaut:bio-mech" },
  }]);
});

test("POST /game-progress/:gameSlug/claims REJECTS premium skin purchase claims (Stripe-only)", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordGameProgressClaim: async (params) => {
      seen.push(params);
      return { ok: true, alreadyProcessed: false, progress: {} };
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/game-progress/tactical-arena/claims", {
    token,
    body: {
      claimId: "forged-claim",
      kind: "premium-skin-purchase",
      sourceId: "forged",
      payload: { entitlementIds: ["skin:swordsman:medieval"] },
    },
  });

  // A client must not be able to grant itself a paid entitlement for free.
  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "claim_kind_forbidden");
  assert.deepEqual(seen, []);
});

test("POST /game-progress/:gameSlug/claims REJECTS premium unit purchase claims (Stripe-only)", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const seen = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordGameProgressClaim: async (params) => {
      seen.push(params);
      return { ok: true, alreadyProcessed: false, progress: {} };
    },
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/game-progress/tactical-arena/claims", {
    token,
    body: {
      claimId: "forged-unit-claim",
      kind: "premium-unit-purchase",
      sourceId: "forged",
      payload: { entitlementIds: ["unit:sniper"] },
    },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "claim_kind_forbidden");
  assert.deepEqual(seen, []);
});

test("POST /game-progress/:gameSlug/claims rejects unsupported claim kinds", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const app = createApp({
    jwtSecret: TEST_SECRET,
    now: () => "2026-07-17T00:00:00.000Z",
  });

  const response = await invoke(app, "POST", "/game-progress/tactical-arena/claims", {
    token,
    body: {
      claimId: "premium:fake-order",
      kind: "premium-entitlement",
      payload: { entitlementId: "skin:swordsman:arcane" },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json.error, "invalid_claim_kind");
});
