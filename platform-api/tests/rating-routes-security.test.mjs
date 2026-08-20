import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.mjs";
import { signToken } from "../src/auth-helpers.mjs";

const TEST_SECRET = "test-jwt-secret-at-least-32-chars-long";

function responseSink() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = value; },
  };
}

async function post(app, url, token, body) {
  const chunk = Buffer.from(JSON.stringify(body));
  const req = {
    method: "POST",
    url,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    async *[Symbol.asyncIterator]() { yield chunk; },
  };
  const res = responseSink();
  await app(req, res);
  return { statusCode: res.statusCode, json: JSON.parse(res.body) };
}

test("legacy client-reported ratings cannot write the Tactical Arena ladder", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordMatchRating: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
    now: () => "2026-08-03T00:00:00.000Z",
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);

  const response = await post(app, "/ratings/tactical-arena", token, {
    opponentPlayerId: "player-2",
    outcome: "win",
    sessionId: "invented-session",
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json.error, "server_attestation_required");
  assert.deepEqual(calls, []);
});

test("a reported match is ranked unless it opts out, so no existing caller changes meaning", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordMatchRating: async (gameSlug, options) => {
      calls.push(options);
      return { ok: true };
    },
    now: () => "2026-08-03T00:00:00.000Z",
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const base = { opponentPlayerId: "player-2", outcome: "win", sessionId: "yam-bowling:ROOM:1:1" };

  // No flag at all: every cabinet that predates the split keeps staking a rating.
  assert.equal((await post(app, "/ratings/yam-bowling", token, base)).statusCode, 200);
  assert.equal(calls[0].ranked, true);

  assert.equal((await post(app, "/ratings/yam-bowling", token, { ...base, ranked: true })).statusCode, 200);
  assert.equal(calls[1].ranked, true);

  // Only an explicit `false` opts out. Anything else is not an opt-out.
  assert.equal((await post(app, "/ratings/yam-bowling", token, { ...base, ranked: false })).statusCode, 200);
  assert.equal(calls[2].ranked, false);

  assert.equal((await post(app, "/ratings/yam-bowling", token, { ...base, ranked: "false" })).statusCode, 200);
  assert.equal(calls[3].ranked, true);
});

test("a Yam Bowling report preserves the complete bounded bowling stat block", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    recordMatchRating: async (_gameSlug, options) => {
      calls.push(options);
      return { ok: true };
    },
    now: () => "2026-08-03T00:00:00.000Z",
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const stats = {
    strikes: 3,
    highGame: 87,
    quickGames: 1,
    quickTotalScore: 87,
    quickHighGame: 87,
    quickStrikeOpportunities: 4,
    quickStrikes: 3,
    quickSpareOpportunities: 1,
    quickSpares: 1,
  };

  const response = await post(app, "/ratings/yam-bowling", token, {
    opponentPlayerId: "player-2",
    outcome: "draw",
    sessionId: "yam-bowling:ROOM:1:2",
    progression: { trackId: "reina-sato", modeId: "quick", performance: 3, stats },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls[0].progression.stats, stats);
});
