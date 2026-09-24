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

async function post(app, url, value, token = "") {
  const body = Buffer.from(JSON.stringify(value));
  const req = {
    method: "POST",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    async *[Symbol.asyncIterator]() { yield body; },
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

test("the signed-in player can read and purchase from the arcade room shop", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: TEST_SECRET,
    getTicketShop: async (input) => ({ balance: 5000, ownedIds: [], items: [{ id: "decor.prop.claw", price: 1200 }], shopSlug: input.shopSlug }),
    purchaseTicketShopItem: async (input) => {
      calls.push(input);
      return { ok: true, itemId: input.itemId, price: 1200, balance: 3800, alreadyOwned: false };
    },
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);

  const shop = await get(app, "/tickets/shops/arcade-room", token);
  const purchase = await post(app, "/tickets/shops/arcade-room/purchases", { itemId: "decor.prop.claw", price: 1 }, token);

  assert.equal(shop.statusCode, 200);
  assert.equal(shop.json.shop.balance, 5000);
  assert.equal(purchase.statusCode, 200);
  assert.deepEqual(calls, [{ playerId: "player-1", shopSlug: "arcade-room", itemId: "decor.prop.claw" }]);
  assert.equal(purchase.json.purchase.balance, 3800);
});

test("arcade room purchase errors preserve useful HTTP status", async () => {
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, TEST_SECRET);
  const app = createApp({
    jwtSecret: TEST_SECRET,
    purchaseTicketShopItem: async () => ({ ok: false, error: "insufficient_tickets", balance: 25, price: 1200 }),
  });
  const response = await post(app, "/tickets/shops/arcade-room/purchases", { itemId: "decor.prop.claw" }, token);
  assert.equal(response.statusCode, 409);
  assert.equal(response.json.error, "insufficient_tickets");
});
