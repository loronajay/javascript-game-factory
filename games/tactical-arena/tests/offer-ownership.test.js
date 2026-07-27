import test from "node:test";
import assert from "node:assert/strict";

import { isOfferFullyOwned, offerRedundantEntitlementIds } from "../src/platform/offerOwnership.js";
import { getSkinPackOffers } from "../src/progression/marketplace.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

const UNIT = { kind: "unit", type: "monk", entitlementId: "unit:monk" };
const SKIN = { kind: "skin", type: "swordsman", slug: "summer-vibes", entitlementId: "skin:swordsman:summer-vibes" };
const CONSUMABLE = { kind: "consumable", id: "valor-boost-1", sku: "ta.consumable.valor-boost-1" };

test("a unit or skin is redundant exactly when its own entitlement is owned", () => {
  assert.equal(isOfferFullyOwned(UNIT, ["unit:monk"]), true);
  assert.equal(isOfferFullyOwned(UNIT, ["unit:paladin"]), false);
  assert.equal(isOfferFullyOwned(SKIN, ["skin:swordsman:summer-vibes"]), true);
  assert.equal(isOfferFullyOwned(SKIN, []), false);
});

test("ownership can be read from a raw server snapshot, not just a list of ids", () => {
  const snapshot = { entitlements: [{ entitlementId: "unit:monk", kind: "unit" }] };
  assert.equal(isOfferFullyOwned(UNIT, snapshot), true);
  assert.equal(isOfferFullyOwned(SKIN, snapshot), false);
  assert.equal(isOfferFullyOwned(UNIT, new Set(["unit:monk"])), true);
});

// Consumables stack instead of being owned. Blocking one because the player already holds
// some would make the item unbuyable forever after the first purchase.
test("a consumable is never redundant", () => {
  assert.deepEqual(offerRedundantEntitlementIds(CONSUMABLE), []);
  assert.equal(isOfferFullyOwned(CONSUMABLE, ["valor-boost-1", "unit:monk"]), false);
});

// This is the case the client and server must agree on. The server prorates a partially
// owned pack down to the skins the player is missing and sells it; if the client blocked it,
// players could never complete a pack they had bought one skin from.
test("a skin pack is redundant only when every skin in it is owned", () => {
  const pack = getSkinPackOffers(storageAdapter()).find((offer) => offer.packId === "arcane");
  assert.ok(pack, "the Arcane pack should exist");

  const allIds = pack.skins.map((skin) => `skin:${skin.type}:${skin.slug}`);
  assert.ok(allIds.length > 1);

  assert.equal(isOfferFullyOwned(pack, allIds), true, "every skin owned - nothing left to sell");
  assert.equal(isOfferFullyOwned(pack, allIds.slice(1)), false, "one skin missing - still buyable");
  assert.equal(isOfferFullyOwned(pack, []), false);
  // Holding the pack marker is not the test: a pack that later gains a skin is worth
  // buying again, and the server prices it that way.
  assert.equal(isOfferFullyOwned(pack, [`skin-pack:${pack.packId}`]), false);
});

// A blocked purchase costs the player a sale, so anything we cannot positively identify as
// redundant has to stay buyable. The server refusal is the backstop for the rest.
test("an unrecognised or malformed offer is never treated as owned", () => {
  for (const offer of [null, undefined, {}, { kind: "mystery" }, { kind: "skin" }, { kind: "skin-pack", skins: [] }]) {
    assert.equal(isOfferFullyOwned(offer, ["unit:monk", "skin:swordsman:summer-vibes"]), false);
  }
});

test("pack skins without an explicit entitlementId are still resolved", () => {
  const pack = { kind: "skin-pack", packId: "test", skins: [{ type: "monk", slug: "jade-dragon" }] };
  assert.deepEqual(offerRedundantEntitlementIds(pack), ["skin:monk:jade-dragon"]);
  assert.equal(isOfferFullyOwned(pack, ["skin:monk:jade-dragon"]), true);
});

// The client blocks a purchase before Google is ever asked; the server independently refuses
// to grant one. If those two disagree, the client either blocks a sale the server would have
// honoured, or waves through one the server will refuse — which is exactly the refund path
// this preflight exists to avoid. So check them against each other directly.
test("the client's redundancy rule matches the server's already-owned verdict", async () => {
  const { resolveTacticalArenaPremiumOffer } = await import("../../../platform-api/src/services/payments.mjs");
  const pack = getSkinPackOffers(storageAdapter()).find((offer) => offer.packId === "arcane");
  const packSkinIds = pack.skins.map((skin) => `skin:${skin.type}:${skin.slug}`);

  const cases = [
    ["unowned unit", UNIT, { kind: "unit", type: "monk" }, []],
    ["owned unit", UNIT, { kind: "unit", type: "monk" }, ["unit:monk"]],
    ["unowned skin", SKIN, { kind: "skin", type: "swordsman", slug: "summer-vibes" }, []],
    ["owned skin", SKIN, { kind: "skin", type: "swordsman", slug: "summer-vibes" }, ["skin:swordsman:summer-vibes"]],
    ["untouched pack", pack, { kind: "skin-pack", packId: "arcane" }, []],
    ["partly owned pack", pack, { kind: "skin-pack", packId: "arcane" }, packSkinIds.slice(1)],
    ["fully owned pack", pack, { kind: "skin-pack", packId: "arcane" }, packSkinIds],
    ["consumable", CONSUMABLE, { kind: "consumable", id: "valor-boost-1" }, ["valor-boost-1"]],
  ];

  for (const [label, clientOffer, serverOffer, ownedIds] of cases) {
    const progress = { entitlements: ownedIds.map((entitlementId) => ({ entitlementId })) };
    const resolved = await resolveTacticalArenaPremiumOffer(serverOffer, progress);
    const serverSaysOwned = resolved.error === "offer_already_owned";
    assert.equal(
      isOfferFullyOwned(clientOffer, progress),
      serverSaysOwned,
      `${label}: client and server disagree on whether this is already owned`,
    );
  }
});
