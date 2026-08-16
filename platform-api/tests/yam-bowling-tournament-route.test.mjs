import test from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../src/app.mjs";
import { signToken } from "../src/auth-helpers.mjs";

const SECRET = "test-jwt-secret-at-least-32-chars-long";

function responseSink() {
  return {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    end(value = "") { this.body = value; },
  };
}

async function request(app, { method = "GET", token = "", path, body = null }) {
  const req = {
    method,
    url: path,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(JSON.stringify(body)); },
  };
  const res = responseSink();
  await app(req, res);
  return { statusCode: res.statusCode, json: JSON.parse(res.body) };
}

test("the tournament endpoints authenticate and keep the server in charge of event state and prizes", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: SECRET,
    now: () => "2026-08-16T12:00:00.000Z",
    getTournamentState: async (params) => {
      calls.push(["get", params]);
      return { ok: true, status: "open", event: { id: "yam-major-0000" }, completedRoundIndexes: [] };
    },
    recordTournamentRound: async (params) => {
      calls.push(["post", params]);
      return { ok: true, prize: null, tournament: { completedRoundIndexes: [0] }, progress: { entitlements: [] } };
    },
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, SECRET);

  const current = await request(app, {
    token,
    path: "/game-progress/yam-bowling/tournaments/current",
  });
  const claim = await request(app, {
    method: "POST",
    token,
    path: "/game-progress/yam-bowling/tournaments/rounds/0",
    body: { eventId: "yam-major-0000", bowlerSlug: "daisy-monroe", prizeId: "skin-voucher", won: true },
  });

  assert.equal(current.statusCode, 200);
  assert.equal(claim.statusCode, 200);
  assert.deepEqual(calls, [
    ["get", { playerId: "player-1", gameSlug: "yam-bowling", now: "2026-08-16T12:00:00.000Z" }],
    ["post", {
      playerId: "player-1",
      gameSlug: "yam-bowling",
      now: "2026-08-16T12:00:00.000Z",
      eventId: "yam-major-0000",
      roundIndex: 0,
      bowlerSlug: "daisy-monroe",
    }],
  ]);
  assert.deepEqual(claim.json.progress.entitlements, []);
});

test("unsigned tournament requests are refused", async () => {
  const app = createApp({ jwtSecret: SECRET, getTournamentState: async () => ({ ok: true }) });
  const response = await request(app, { path: "/game-progress/yam-bowling/tournaments/current" });
  assert.equal(response.statusCode, 401);
});
