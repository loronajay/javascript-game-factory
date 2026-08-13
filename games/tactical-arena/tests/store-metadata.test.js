// Store-facing text is Play Console metadata.
//
// `mobile/tactical-arena/scripts/play-products-sync.mjs` builds every Play product title from
// these offer names, so a display string here becomes the title Google shows in the purchase
// sheet and reviews against the app's content rating. Profanity there risks a metadata
// rejection and contradicts the Everyone 10+ rating the game otherwise earns.
//
// The slugs are deliberately NOT covered: `fuck-cancer` names asset files, entitlement ids and
// Play product ids, none of which can change once shipped. Only what a player reads matters.

import test from "node:test";
import assert from "node:assert/strict";

import {
  getConsumableOffers,
  getSkinOffers,
  getSkinPackOffers,
  getUnitOffers,
} from "../src/progression/marketplace.js";
import { CANCER_RESEARCH_DONATION_NOTE } from "../src/ui/skinModel.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

// Matches the word and the usual maskings of it (f*ck, f&%!, f_ck ...), since a masked form is
// still profanity to a reviewer and still has to be declared on the content rating.
const PROFANITY = [
  /\bf[\W_]*[u\*@#&%!][\W_]*c?[\W_]*[k\*@#&%!]/i,
  /\bs[\W_]*h[\W_]*[i\*][\W_]*t\b/i,
  /\bc[\W_]*u[\W_]*n[\W_]*t\b/i,
];

function storeStrings() {
  const storage = memoryStorage();
  const offers = [
    ...getUnitOffers(storage),
    ...getSkinOffers(storage),
    ...getSkinPackOffers(storage),
    ...getConsumableOffers(),
  ];
  const strings = [];
  for (const offer of offers) {
    for (const field of ["name", "description", "packName", "donationNote"]) {
      if (typeof offer?.[field] === "string" && offer[field]) {
        strings.push({ sku: offer.sku || offer.id, field, text: offer[field] });
      }
    }
  }
  return strings;
}

test("no store-facing offer text contains profanity", () => {
  const offending = storeStrings().filter(({ text }) => PROFANITY.some((rx) => rx.test(text)));

  assert.deepEqual(
    offending.map((o) => `${o.sku}.${o.field}: ${o.text}`),
    [],
    "these become Play product titles/descriptions — rename the display string, not the slug",
  );
});

test("the cancer-research collection ships under its non-profane name", () => {
  const storage = memoryStorage();
  const pack = getSkinPackOffers(storage).find((offer) => offer.packId === "fuck-cancer");

  assert.ok(pack, "the cancer-research pack should still exist");
  assert.equal(pack.name, "Fight Cancer Pack");
  // The slug is load-bearing (assets, entitlement ids, Play product ids) and must NOT change.
  assert.equal(pack.packId, "fuck-cancer");
  assert.match(pack.sku, /fuck-cancer/);

  const skins = getSkinOffers(storage).filter((offer) => offer.slug === "fuck-cancer");
  assert.ok(skins.length > 0, "the collection should still have skins");
  for (const skin of skins) {
    assert.equal(skin.name, "Fight Cancer", `${skin.sku} still shows the old name`);
  }
});

// A charity claim attached to a paid product is a representation. US commercial co-venture
// rules generally want the share, the named recipient, and a timeframe rather than a vague
// "a portion of proceeds".
//
// The unfilled <CHARITY NAME> placeholder is deliberately NOT asserted here: it would leave
// `npm test` permanently red, which trains you to ignore it and hides real failures. That
// check lives in `mobile/tactical-arena/scripts/release-check.mjs`, which is the gate that
// actually matters — it blocks the Play upload while the placeholder is still in place.
test("the donation pledge names a share and a timeframe", () => {
  assert.match(CANCER_RESEARCH_DONATION_NOTE, /100%/);
  assert.match(CANCER_RESEARCH_DONATION_NOTE, /annually|yearly|each year|quarterly/i);
});

// The Play sheet reads the client name; Stripe Checkout reads the server's. They must agree,
// the same way unit/skin prices already do.
test("client and server agree on the pack's display name", async () => {
  const storage = memoryStorage();
  const pack = getSkinPackOffers(storage).find((offer) => offer.packId === "fuck-cancer");
  const { resolveTacticalArenaPremiumOffer } = await import("../../../platform-api/src/services/payments.mjs");

  const resolved = await resolveTacticalArenaPremiumOffer(
    { kind: "skin-pack", sku: pack.sku, packId: "fuck-cancer" },
    {},
  );

  assert.equal(resolved.ok, true, resolved.error);
  assert.equal(resolved.offer.name, pack.name);
});
