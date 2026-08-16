import test from "node:test";
import assert from "node:assert/strict";

import { buildVoucherChoices, createVoucherClient } from "./profile/voucher-client.mjs";

test("redemption choices include only unowned alternate skins for owned bowlers", () => {
  const choices = buildVoucherChoices({
    ownedBowlers: [{ slug: "daisy-monroe", name: "Daisy Monroe" }, { slug: "nia-brooks", name: "Nia Brooks" }],
    availableSkins: [{ id: "canon", name: "Classic" }, { id: "swimsuit", name: "Swimsuit" }, { id: "maid", name: "Maid Café" }],
    owns: (itemId) => itemId === "skin:daisy-monroe:maid",
  });

  assert.deepEqual(choices.map(({ entitlementId }) => entitlementId), [
    "skin:daisy-monroe:swimsuit",
    "skin:nia-brooks:swimsuit",
    "skin:nia-brooks:maid",
  ]);
});

test("voucher balance is derived from the authoritative game inventory", () => {
  const client = createVoucherClient({ platformApi: {}, loadout: {} });

  client.applyProgress({
    inventoryItems: [
      { itemId: "other-item", quantity: 9 },
      { itemId: "skin-voucher", quantity: 2 },
    ],
  });

  assert.deepEqual(client.getState(), { balance: 2, status: "ready", error: "" });
});

test("redeeming sends an idempotent request and applies the returned entitlement snapshot", async () => {
  const calls = [];
  const applied = [];
  const progress = {
    inventoryItems: [{ itemId: "skin-voucher", quantity: 0 }],
    entitlements: [{ entitlementId: "skin:daisy-monroe:maid" }],
  };
  const client = createVoucherClient({
    platformApi: {
      redeemGameSkinVoucher: async (gameSlug, input) => {
        calls.push([gameSlug, input]);
        return { ok: true, gameProgress: progress };
      },
    },
    loadout: { applyServerEntitlements: (value) => applied.push(value) },
    createRedemptionId: () => "redemption-7",
  });
  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });

  assert.equal(await client.redeem("skin:daisy-monroe:maid"), true);
  assert.deepEqual(calls, [["yam-bowling", {
    entitlementId: "skin:daisy-monroe:maid",
    redemptionId: "redemption-7",
  }]]);
  assert.deepEqual(applied, [progress.entitlements]);
  assert.deepEqual(client.getState(), { balance: 0, status: "ready", error: "" });
});

test("redeeming is refused locally without a voucher or valid skin entitlement", async () => {
  let calls = 0;
  const client = createVoucherClient({
    platformApi: { redeemGameSkinVoucher: async () => { calls += 1; } },
    loadout: {},
  });
  client.applyProgress({ inventoryItems: [] });

  assert.equal(await client.redeem("skin:daisy-monroe:maid"), false);
  client.applyProgress({ inventoryItems: [{ itemId: "skin-voucher", quantity: 1 }] });
  assert.equal(await client.redeem("room:default"), false);
  assert.equal(calls, 0);
});
