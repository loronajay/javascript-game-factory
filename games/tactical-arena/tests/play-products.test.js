import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAY_PRODUCT_ID_PATTERN,
  isValidPlayProductId,
  playProductIdForOffer,
  toPlayProductId,
} from "../src/platform/playProducts.js";
import {
  getConsumableOffers,
  getSkinOffers,
  getSkinPackOffers,
  getUnitOffers,
} from "../src/progression/marketplace.js";

const emptyStorage = { getItem: () => null, setItem() {}, removeItem() {} };

test("Play product ids reject everything Google's format forbids", () => {
  // Google Play: must start with a lowercase letter or digit, and contain only
  // lowercase letters, digits, underscores and periods.
  assert.equal(isValidPlayProductId("ta.skin.swordsman.summer_vibes"), true);
  assert.equal(isValidPlayProductId("ta_unit_1"), true);
  assert.equal(isValidPlayProductId("9lives"), true);

  assert.equal(isValidPlayProductId("ta.skin.summer-vibes"), false, "hyphens are not allowed");
  assert.equal(isValidPlayProductId("TA.Skin"), false, "uppercase is not allowed");
  assert.equal(isValidPlayProductId("_leading"), false, "must start alphanumeric");
  assert.equal(isValidPlayProductId(".leading"), false);
  assert.equal(isValidPlayProductId("has space"), false);
  assert.equal(isValidPlayProductId("has:colon"), false);
  assert.equal(isValidPlayProductId(""), false);
  assert.equal(isValidPlayProductId(null), false);
});

test("hyphens become underscores, which is the whole reason this mapping exists", () => {
  assert.equal(toPlayProductId("ta.skin.swordsman.summer-vibes"), "ta.skin.swordsman.summer_vibes");
  assert.equal(toPlayProductId("ta.skinpack.blood-moon"), "ta.skinpack.blood_moon");
  assert.equal(toPlayProductId("ta.consumable.valor-boost-1"), "ta.consumable.valor_boost_1");
  // Already-valid ids pass through untouched.
  assert.equal(toPlayProductId("ta.unit.swordsman"), "ta.unit.swordsman");
});

test("the mapping is deterministic and collision-free across the real catalog", () => {
  const offers = [
    ...getUnitOffers(emptyStorage),
    ...getSkinOffers(emptyStorage),
    ...getSkinPackOffers(emptyStorage),
    ...getConsumableOffers(),
  ];
  assert.ok(offers.length > 50, `expected a full catalog, got ${offers.length}`);

  const seen = new Map();
  for (const offer of offers) {
    const id = playProductIdForOffer(offer);
    assert.ok(id, `no Play product id for ${offer.sku}`);
    assert.ok(
      isValidPlayProductId(id),
      `${offer.sku} -> ${id} is not a legal Play product id`,
    );
    // Two different SKUs collapsing onto one Play product would sell the wrong item.
    if (seen.has(id)) {
      assert.fail(`Play product id collision: ${seen.get(id)} and ${offer.sku} both map to ${id}`);
    }
    seen.set(id, offer.sku);
    // Stable across calls.
    assert.equal(playProductIdForOffer(offer), id);
  }
});

test("offers without a usable sku produce null rather than a bogus product id", () => {
  assert.equal(playProductIdForOffer(null), null);
  assert.equal(playProductIdForOffer({}), null);
  assert.equal(playProductIdForOffer({ sku: "" }), null);
  assert.equal(playProductIdForOffer({ sku: "   " }), null);
  // A sku that cannot be rescued into a legal id must fail loudly, not silently ship.
  assert.equal(playProductIdForOffer({ sku: "!!!" }), null);
});

test("the exported pattern matches the validator", () => {
  for (const id of ["ta.unit.swordsman", "a", "z9._x"]) {
    assert.equal(PLAY_PRODUCT_ID_PATTERN.test(id), isValidPlayProductId(id), id);
  }
});
