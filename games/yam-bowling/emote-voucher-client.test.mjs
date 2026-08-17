import test from "node:test";
import assert from "node:assert/strict";

import { buildEmoteVoucherChoices, createEmoteVoucherClient } from "./profile/emote-voucher-client.mjs";

const emoteCore = (await import("./emote-core.js")).default ?? require("./emote-core.js");

function progressWith(quantity) {
  return { inventoryItems: [{ itemId: "emote-voucher", quantity }] };
}

test("a voucher can only be spent on emotes it is able to buy", () => {
  const choices = buildEmoteVoucherChoices({ emotes: emoteCore.EMOTES, owns: () => false });

  // The six founding emotes are already owned and the mastery emote is granted
  // outright at level 17, so neither may consume a voucher.
  assert.equal(choices.length, 23);
  for (const slug of ["wave", "thumbs-up", "good-luck", "nice-one", "lets-go", "oh-no", "game-face"]) {
    assert.equal(
      choices.some((choice) => choice.emoteSlug === slug),
      false,
      `${slug} must not be purchasable`,
    );
  }
  for (const choice of choices) {
    assert.equal(choice.entitlementId, `emote:${choice.emoteSlug}`);
    assert.match(choice.art, /^assets\/emotes\/[a-z0-9-]+\.webp$/);
  }
});

test("an emote already owned drops out of the picker", () => {
  const choices = buildEmoteVoucherChoices({
    emotes: emoteCore.EMOTES,
    owns: (entitlementId) => entitlementId === "emote:cheer",
  });

  assert.equal(choices.some((choice) => choice.emoteSlug === "cheer"), false);
  assert.equal(choices.length, 22);
});

test("the balance is read from the authoritative inventory, never counted locally", () => {
  const client = createEmoteVoucherClient({});

  assert.equal(client.getState().balance, 0);
  assert.equal(client.applyProgress(progressWith(3)), 3);
  assert.equal(client.getState().balance, 3);
  // A malformed or negative quantity floors at zero rather than going negative.
  assert.equal(client.applyProgress(progressWith(-2)), 0);
  assert.equal(client.applyProgress({}), 0);
});

test("redeeming sends an idempotent request and applies the returned entitlements", async () => {
  const calls = [];
  const applied = [];
  const client = createEmoteVoucherClient({
    platformApi: {
      redeemGameEmoteVoucher: (gameSlug, body) => {
        calls.push({ gameSlug, ...body });
        return Promise.resolve({
          ok: true,
          progress: progressWith(0),
          gameProgress: { ...progressWith(0), entitlements: ["emote:cheer"] },
        });
      },
    },
    loadout: { applyServerEntitlements: (ids) => applied.push(ids) },
    createRedemptionId: () => "redemption-1",
  });
  client.applyProgress(progressWith(1));

  assert.equal(await client.redeem("emote:cheer"), true);
  assert.deepEqual(calls, [{
    gameSlug: "yam-bowling",
    entitlementId: "emote:cheer",
    redemptionId: "redemption-1",
  }]);
  assert.deepEqual(applied, [["emote:cheer"]]);
  assert.equal(client.getState().balance, 0, "the server's balance replaces the local one");
});

test("redemption is refused locally without a voucher or a well-formed target", async () => {
  let called = false;
  const client = createEmoteVoucherClient({
    platformApi: { redeemGameEmoteVoucher: () => { called = true; return Promise.resolve({ ok: true }); } },
  });

  // No balance yet.
  assert.equal(await client.redeem("emote:cheer"), false);
  client.applyProgress(progressWith(1));
  // Not an emote id at all.
  assert.equal(await client.redeem("skin:reina-sato:maid"), false);
  assert.equal(await client.redeem(""), false);
  assert.equal(await client.redeem(null), false);
  assert.equal(called, false, "a malformed target must never cost a round trip");
});

test("a failed redemption reports an error and keeps the balance", async () => {
  const client = createEmoteVoucherClient({
    platformApi: { redeemGameEmoteVoucher: () => Promise.reject(new Error("network")) },
  });
  client.applyProgress(progressWith(2));

  assert.equal(await client.redeem("emote:cheer"), false);
  assert.equal(client.getState().status, "error");
  assert.equal(client.getState().balance, 2, "a network failure is not a spend");
});
