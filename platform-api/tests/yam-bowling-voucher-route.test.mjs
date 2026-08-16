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

async function post(app, token, body) {
  const chunk = Buffer.from(JSON.stringify(body));
  const req = {
    method: "POST",
    url: "/game-progress/yam-bowling/vouchers/redeem",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    async *[Symbol.asyncIterator]() { yield chunk; },
  };
  const res = responseSink();
  await app(req, res);
  return { statusCode: res.statusCode, json: JSON.parse(res.body) };
}

test("the voucher endpoint authenticates and forwards only the skin target and replay id", async () => {
  const calls = [];
  const app = createApp({
    jwtSecret: SECRET,
    redeemSkinVoucher: async (params) => {
      calls.push(params);
      return { ok: true, entitlementId: params.entitlementId, progress: { inventoryItems: [] } };
    },
  });
  const token = signToken({ playerId: "player-1", email: "player@test.com" }, SECRET);
  const response = await post(app, token, {
    entitlementId: "skin:daisy-monroe:maid",
    redemptionId: "redeem-1",
    quantity: 99,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    playerId: "player-1",
    gameSlug: "yam-bowling",
    entitlementId: "skin:daisy-monroe:maid",
    redemptionId: "redeem-1",
  }]);
  assert.deepEqual(response.json.progress.inventoryItems, []);
});

test("the voucher endpoint refuses unsigned requests", async () => {
  const app = createApp({ jwtSecret: SECRET, redeemSkinVoucher: async () => ({ ok: true }) });
  const response = await post(app, "", { entitlementId: "skin:daisy-monroe:maid", redemptionId: "redeem-1" });
  assert.equal(response.statusCode, 401);
});
