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

async function get(app, url, token = "") {
  const req = {
    method: "GET",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res = responseSink();
  await app(req, res);
  return { statusCode: res.statusCode, json: JSON.parse(res.body) };
}

test("ticket wallet reads require the signed-in player", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    getTicketWallet: async (playerId) => {
      calls.push(playerId);
      return { balance: 5000 };
    },
  });

  const response = await get(app, "/tickets/wallet");

  assert.equal(response.statusCode, 401);
  assert.equal(response.json.error, "unauthorized");
  assert.deepEqual(calls, []);
});

test("ticket wallet reads use token identity and return the authoritative balance", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    getTicketWallet: async (playerId) => {
      calls.push(playerId);
      return { balance: 5000, updatedAt: "2026-09-23T12:00:00.000Z" };
    },
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);

  const response = await get(app, "/tickets/wallet", token);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, ["player-1"]);
  assert.deepEqual(response.json.wallet, {
    balance: 5000,
    updatedAt: "2026-09-23T12:00:00.000Z",
  });
});

test("ticket wallet route reports an unwired backend instead of inventing a balance", async () => {
  const app = createApp({ jwtSecret: TEST_SECRET });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);

  const response = await get(app, "/tickets/wallet", token);

  assert.equal(response.statusCode, 503);
  assert.equal(response.json.error, "tickets_not_configured");
});
